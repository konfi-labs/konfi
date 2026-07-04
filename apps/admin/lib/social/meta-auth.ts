import "server-only";

import { createHash } from "crypto";
import { EncryptJWT, jwtDecrypt } from "jose";
import { FieldValue } from "firebase-admin/firestore";
import {
  getAdminDb,
} from "@/lib/firebase/serverApp";
import {
  encryptIntegrationSecret,
} from "@/lib/integration-secret-crypto";
import {
  META_TENANT_INTEGRATION_KEY,
  tenantMetaIntegrationDocumentId,
  TENANT_INTEGRATIONS_COLLECTION,
  normalizeMetaTenantIntegrationMetadata,
} from "@konfi/utils";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import type { MetaAppConfig } from "./meta-config";

export const META_OAUTH_STATE_COOKIE = "meta_oauth_state";
export const META_OAUTH_STATE_COOKIE_MAX_AGE = 60 * 10; // 10 minutes

const JWT_ISSUER = "konfi-admin";
const META_OAUTH_STATE_JWT_AUDIENCE = "meta_oauth_state";

const META_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
  "instagram_business_basic",
  "instagram_business_content_publish",
] as const;

// ---------- encryption helpers ----------

const ENCRYPTION_SECRET =
  process.env.META_OAUTH_STATE_SECRET ||
  process.env.SESSION_SECRET ||
  process.env.ENCRYPTION_SECRET;

function getEncryptionKey(): Uint8Array {
  if (!ENCRYPTION_SECRET) {
    throw new Error(
      "Missing encryption secret. Set SESSION_SECRET or ENCRYPTION_SECRET.",
    );
  }
  return createHash("sha256").update(ENCRYPTION_SECRET, "utf8").digest();
}

// ---------- OAuth state cookie ----------

export interface MetaAuthState {
  state: string;
  redirectUri: string;
  createdAt: number;
  lng: string;
}

export async function encryptMetaAuthState(
  authState: MetaAuthState,
): Promise<string> {
  return new EncryptJWT({ data: authState })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(META_OAUTH_STATE_JWT_AUDIENCE)
    .setExpirationTime(`${META_OAUTH_STATE_COOKIE_MAX_AGE}s`)
    .encrypt(getEncryptionKey());
}

export async function decryptMetaAuthState(
  encryptedData: string,
): Promise<MetaAuthState | null> {
  try {
    const { payload } = await jwtDecrypt(encryptedData, getEncryptionKey(), {
      issuer: JWT_ISSUER,
      audience: META_OAUTH_STATE_JWT_AUDIENCE,
    });
    const data = payload.data as MetaAuthState | undefined;
    if (
      data &&
      typeof data.state === "string" &&
      typeof data.redirectUri === "string" &&
      typeof data.createdAt === "number" &&
      typeof data.lng === "string"
    ) {
      return data;
    }
    return null;
  } catch (error) {
    console.error("Failed to decrypt Meta auth state:", error);
    return null;
  }
}

// ---------- OAuth flow helpers ----------

export function buildMetaAuthorizationUrl({
  appConfig,
  redirectUri,
  state,
}: {
  appConfig: MetaAppConfig;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: appConfig.appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: META_OAUTH_SCOPES.join(","),
    state,
  });

  return `https://www.facebook.com/${appConfig.graphApiVersion}/dialog/oauth?${params.toString()}`;
}

interface GraphApiError {
  error?: { message?: string; code?: number };
}

async function assertGraphApiOk(res: Response): Promise<void> {
  if (!res.ok) {
    let message = `Graph API error ${res.status}`;
    try {
      const body = (await res.json()) as GraphApiError;
      if (body?.error?.message) {
        message = `Graph API error ${body.error.code ?? res.status}: ${body.error.message}`;
      }
    } catch {
      // ignore JSON parse failures
    }
    throw new Error(message);
  }
}

export async function exchangeCodeForTokens({
  appConfig,
  code,
  redirectUri,
}: {
  appConfig: MetaAppConfig;
  code: string;
  redirectUri: string;
}): Promise<{ accessToken: string }> {
  const params = new URLSearchParams({
    client_id: appConfig.appId,
    client_secret: appConfig.appSecret,
    redirect_uri: redirectUri,
    code,
  });

  const res = await fetch(
    `https://graph.facebook.com/${appConfig.graphApiVersion}/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    },
  );
  await assertGraphApiOk(res);

  const data = (await res.json()) as { access_token: string };
  return { accessToken: data.access_token };
}

export async function exchangeForLongLivedUserToken({
  appConfig,
  shortLivedToken,
}: {
  appConfig: MetaAppConfig;
  shortLivedToken: string;
}): Promise<{ accessToken: string; expiresAt: number }> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appConfig.appId,
    client_secret: appConfig.appSecret,
    fb_exchange_token: shortLivedToken,
  });

  const res = await fetch(
    `https://graph.facebook.com/${appConfig.graphApiVersion}/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    },
  );
  await assertGraphApiOk(res);

  const data = (await res.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

interface PageEntry {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username: string };
}

interface PagesResponse {
  data: PageEntry[];
  paging?: { next?: string };
}

export interface FetchedPage {
  id: string;
  name: string;
  accessToken: string;
  igAccount?: { id: string; username: string };
}

export async function fetchPagesWithInstagramAccounts({
  appConfig,
  userToken,
}: {
  appConfig: MetaAppConfig;
  userToken: string;
}): Promise<FetchedPage[]> {
  const results: FetchedPage[] = [];
  const fields = "id,name,access_token,instagram_business_account{id,username}";
  const initialParams = new URLSearchParams({ fields });
  let url: string | undefined = `https://graph.facebook.com/${appConfig.graphApiVersion}/me/accounts?${initialParams.toString()}`;
  const authHeaders = { Authorization: `Bearer ${userToken}` };

  while (url) {
    const res = await fetch(url, { headers: authHeaders });
    await assertGraphApiOk(res);
    const body = (await res.json()) as PagesResponse;

    for (const page of body.data ?? []) {
      results.push({
        id: page.id,
        name: page.name,
        accessToken: page.access_token,
        igAccount: page.instagram_business_account,
      });
    }

    url = body.paging?.next;
  }

  return results;
}

export async function persistMetaConnection({
  tenantContext,
  userToken,
  userTokenExpiresAt,
  pages,
  updatedByUid,
}: {
  tenantContext: TenantContext;
  userToken: string;
  userTokenExpiresAt: number;
  pages: FetchedPage[];
  updatedByUid: string;
}): Promise<void> {
  const tenantId = tenantContext.tenantId;
  if (!tenantId) {
    throw new Error("tenantId is required to persist Meta connection");
  }

  const scope = { integrationKey: META_TENANT_INTEGRATION_KEY, tenantId };

  const encryptedUserToken = encryptIntegrationSecret({
    plaintext: userToken,
    scope,
  });

  const encryptedPages = pages.map((page) => ({
    id: page.id,
    name: page.name,
    encryptedPageToken: encryptIntegrationSecret({
      plaintext: page.accessToken,
      scope,
    }),
    ...(page.igAccount ? { igAccount: page.igAccount } : {}),
  }));

  // Read existing doc to preserve BYO app credentials
  const docRef = getAdminDb()
    .collection(TENANT_INTEGRATIONS_COLLECTION)
    .doc(tenantMetaIntegrationDocumentId(tenantId));

  const existingSnap = await docRef.get();
  const existingData = existingSnap.exists ? existingSnap.data() : undefined;
  const existingNormalized = normalizeMetaTenantIntegrationMetadata(
    existingData?.metadata,
  );

  const preservedAppId = existingNormalized.meta.appId;
  const preservedEncryptedAppSecret = existingNormalized.meta.encryptedAppSecret;

  await docRef.set(
    {
      integrationKey: META_TENANT_INTEGRATION_KEY,
      tenantId,
      status: "connected",
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid,
      metadata: {
        meta: {
          ...(preservedAppId ? { appId: preservedAppId } : {}),
          ...(preservedEncryptedAppSecret
            ? { encryptedAppSecret: preservedEncryptedAppSecret }
            : {}),
          encryptedUserToken,
          userTokenExpiresAt,
          userTokenRefreshedAt: Date.now(),
          pages: encryptedPages,
        },
      },
    },
    { merge: false },
  );
}
