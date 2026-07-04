"use server";

import "server-only";

import {
  AdminAuthError,
  getAuthenticatedAdminMember,
  requireTenantPermission,
} from "@/actions/auth-utils";
import { isSocialFeatureEnabled } from "@/lib/social/feature-flag";
import { getAdminDb, getTenantContextForRequest } from "@/lib/firebase/serverApp";
import {
  encryptIntegrationSecret,
  isEncryptedIntegrationSecret,
} from "@/lib/integration-secret-crypto";
import { isSharedSaasTenantRuntime } from "@/lib/tenant-runtime";
import { getMetaAppConfig } from "@/lib/social/meta-config";
import {
  createPost,
  updatePost,
  setPostSchedule,
  cancelSchedule,
  deletePost,
  listPosts,
  validateSocialPost,
} from "@/lib/social/posts";
import { loadAdminAiInstructionSettings } from "@/lib/ai/ai-instruction-settings.server";
import { generateAdminText } from "@/actions/ai";
import { buildAiInstructionOverlaySection } from "@konfi/utils";
import {
  META_TENANT_INTEGRATION_KEY,
  MetaTenantIntegrationDocument,
  normalizeMetaTenantIntegrationMetadata,
  tenantMetaIntegrationDocumentId,
  TENANT_INTEGRATIONS_COLLECTION,
} from "@konfi/utils";
import type { SocialPost, SocialPostStatus, SocialProviderKey } from "@konfi/types";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

function assertSocialFeatureEnabled() {
  if (!isSocialFeatureEnabled()) throw new AdminAuthError("Not found", 404);
}

export interface MetaConnectionStatus {
  appConfigured: boolean;      // app credentials resolvable (env or tenant BYO)
  byoAppId?: string;           // stored BYO app id (never the secret)
  requiresByoApp: boolean;     // true in SaaS mode when env credentials are not applicable
  connected: boolean;
  needsAttention: boolean;     // status === "needs_attention"
  pages: { id: string; name: string; igAccount?: { id: string; username: string } }[];
}

async function getMetaIntegrationDoc(
  tenantId: string,
): Promise<MetaTenantIntegrationDocument | undefined> {
  const snapshot = await getAdminDb()
    .collection(TENANT_INTEGRATIONS_COLLECTION)
    .doc(tenantMetaIntegrationDocumentId(tenantId))
    .get();

  if (!snapshot.exists) {
    return undefined;
  }

  return snapshot.data() as MetaTenantIntegrationDocument | undefined;
}

export async function getMetaConnectionStatus(): Promise<MetaConnectionStatus> {
  assertSocialFeatureEnabled();
  const { tenantContext } = await requireTenantPermission(
    "marketing.social.manage",
  );

  const requiresByoApp = isSharedSaasTenantRuntime(tenantContext);
  const appConfig = await getMetaAppConfig(tenantContext);
  const appConfigured = appConfig !== null;

  const tenantId = tenantContext.tenantId;
  if (!tenantId) {
    return {
      appConfigured,
      requiresByoApp,
      connected: false,
      needsAttention: false,
      pages: [],
    };
  }

  const integration = await getMetaIntegrationDoc(tenantId);
  const { meta } = normalizeMetaTenantIntegrationMetadata(integration?.metadata);

  const connected =
    integration?.tenantId === tenantId &&
    integration.integrationKey === META_TENANT_INTEGRATION_KEY &&
    integration.status === "connected";

  const needsAttention = integration?.status === "needs_attention";

  const pages = (meta.pages ?? []).map((page) => ({
    id: page.id,
    name: page.name,
    ...(page.igAccount ? { igAccount: page.igAccount } : {}),
  }));

  return {
    appConfigured,
    ...(meta.appId ? { byoAppId: meta.appId } : {}),
    requiresByoApp,
    connected,
    needsAttention,
    pages,
  };
}

export async function saveMetaAppCredentials(input: {
  appId: string;
  appSecret: string;
}): Promise<void> {
  assertSocialFeatureEnabled();
  const { tenantContext, uid } = await requireTenantPermission(
    "marketing.social.manage",
  );

  const tenantId = tenantContext.tenantId;
  if (!tenantId) {
    throw new AdminAuthError("Tenant context is required", 403);
  }

  const appId = input.appId.trim();
  const appSecret = input.appSecret.trim();

  if (!appId) {
    throw new Error("appId is required");
  }
  if (!appSecret) {
    throw new Error("appSecret is required");
  }

  const encryptedAppSecret = encryptIntegrationSecret({
    plaintext: appSecret,
    scope: { integrationKey: META_TENANT_INTEGRATION_KEY, tenantId },
  });

  const docRef = getAdminDb()
    .collection(TENANT_INTEGRATIONS_COLLECTION)
    .doc(tenantMetaIntegrationDocumentId(tenantId));

  const existingSnap = await docRef.get();
  const existingData = existingSnap.exists ? existingSnap.data() : undefined;
  const existingIntegration = existingData as MetaTenantIntegrationDocument | undefined;

  // Keep existing connection state if already connected; otherwise mark oauth_pending
  const existingStatus = existingIntegration?.status;
  const status =
    existingStatus === "connected" ? "connected" : "oauth_pending";

  await docRef.set(
    {
      integrationKey: META_TENANT_INTEGRATION_KEY,
      tenantId,
      status,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: uid,
      metadata: {
        meta: {
          appId,
          encryptedAppSecret,
        },
      },
    },
    { merge: true },
  );
}

export async function disconnectMeta(): Promise<void> {
  assertSocialFeatureEnabled();
  const { tenantContext, uid } = await requireTenantPermission(
    "marketing.social.manage",
  );

  const tenantId = tenantContext.tenantId;
  if (!tenantId) {
    throw new AdminAuthError("Tenant context is required", 403);
  }

  const docRef = getAdminDb()
    .collection(TENANT_INTEGRATIONS_COLLECTION)
    .doc(tenantMetaIntegrationDocumentId(tenantId));

  const existingSnap = await docRef.get();
  if (!existingSnap.exists) {
    // Nothing to disconnect
    return;
  }

  const existingData = existingSnap.data() as MetaTenantIntegrationDocument | undefined;
  const { meta } = normalizeMetaTenantIntegrationMetadata(existingData?.metadata);

  // Preserve BYO app credentials; clear connection-specific fields
  await docRef.set(
    {
      integrationKey: META_TENANT_INTEGRATION_KEY,
      tenantId,
      status: "oauth_pending",
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: uid,
      metadata: {
        meta: {
          // Full replace: connection fields are dropped by omission
          ...(meta.appId ? { appId: meta.appId } : {}),
          ...(isEncryptedIntegrationSecret(meta.encryptedAppSecret)
            ? { encryptedAppSecret: meta.encryptedAppSecret }
            : {}),
        },
      },
    },
    { merge: false },
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Social Posts — public action contracts
// ──────────────────────────────────────────────────────────────────────────────

export interface SocialPostInput {
  channelId?: string;
  content: string;
  media: { storagePath: string; downloadUrl: string; contentType: string }[];
  targets: { provider: SocialProviderKey; targetId: string; targetName: string }[];
}

export interface SocialPostView {
  id: string;
  name: string;
  status: SocialPostStatus;
  content: string;
  media: SocialPostInput["media"];
  channelId?: string;
  targets: {
    provider: SocialProviderKey;
    targetId: string;
    targetName: string;
    status: "pending" | "published" | "failed";
    error?: string;
    externalPostId?: string;
  }[];
  scheduledAt?: number; // ms epoch
  createdAt: number; // ms epoch
  updatedAt: number; // ms epoch
}

function timestampToMs(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === "object" && ts !== null && "seconds" in ts) {
    const seconds = (ts as { seconds: number; nanoseconds?: number }).seconds;
    return seconds * 1000;
  }
  return 0;
}

function serializeSocialPost(post: SocialPost): SocialPostView {
  return {
    id: post.id,
    name: post.name,
    status: post.status,
    content: post.content,
    media: post.media,
    ...(post.channelId ? { channelId: post.channelId } : {}),
    targets: post.targets.map((t) => ({
      provider: t.provider,
      targetId: t.targetId,
      targetName: t.targetName,
      status: t.status,
      ...(t.error ? { error: t.error } : {}),
      ...(t.externalPostId ? { externalPostId: t.externalPostId } : {}),
    })),
    ...(post.scheduledAt ? { scheduledAt: timestampToMs(post.scheduledAt) } : {}),
    createdAt: timestampToMs(post.createdAt),
    updatedAt: timestampToMs(post.updatedAt),
  };
}

/** 1 minute grace to absorb latency between client clock and server */
const SCHEDULE_GRACE_MS = 60 * 1000;

export async function createSocialPost(input: SocialPostInput): Promise<{ id: string }> {
  assertSocialFeatureEnabled();
  const { tenantContext, uid } = await requireTenantPermission("marketing.social.manage");
  const member = await getAuthenticatedAdminMember();

  const id = await createPost({
    tenantContext,
    member,
    channelId: input.channelId,
    content: input.content,
    media: input.media,
    targets: input.targets,
  });

  return { id };
}

export async function updateSocialPost(id: string, input: SocialPostInput): Promise<void> {
  assertSocialFeatureEnabled();
  const { tenantContext } = await requireTenantPermission("marketing.social.manage");
  const member = await getAuthenticatedAdminMember();

  await updatePost(id, tenantContext, {
    member,
    content: input.content,
    media: input.media,
    targets: input.targets,
    channelId: input.channelId,
  });
}

export async function scheduleSocialPost(
  id: string,
  scheduledAt: number,
): Promise<{ issues: string[] } | { scheduled: true }> {
  assertSocialFeatureEnabled();
  const { tenantContext } = await requireTenantPermission("marketing.social.manage");
  const member = await getAuthenticatedAdminMember();

  // Refuse past timestamps (>1min grace)
  if (scheduledAt < Date.now() - SCHEDULE_GRACE_MS) {
    return { issues: ["Scheduled time must be in the future."] };
  }

  const post = await (await import("@/lib/social/posts")).getPost(id, tenantContext);
  if (!post) return { issues: ["Post not found."] };

  const validationIssues = validateSocialPost(post);
  if (validationIssues.length > 0) {
    return { issues: validationIssues.map((i) => i.message) };
  }

  await setPostSchedule(id, tenantContext, new Date(scheduledAt), member);
  return { scheduled: true };
}

export async function cancelSocialPostSchedule(id: string): Promise<void> {
  assertSocialFeatureEnabled();
  const { tenantContext } = await requireTenantPermission("marketing.social.manage");
  const member = await getAuthenticatedAdminMember();

  await cancelSchedule(id, tenantContext, member);
}

export async function deleteSocialPost(id: string): Promise<void> {
  assertSocialFeatureEnabled();
  const { tenantContext } = await requireTenantPermission("marketing.social.manage");

  await deletePost(id, tenantContext);
}

export async function listSocialPosts(
  filter?: { from?: number; to?: number; statuses?: SocialPostStatus[] },
): Promise<SocialPostView[]> {
  assertSocialFeatureEnabled();
  const { tenantContext } = await requireTenantPermission("marketing.social.manage");

  const posts = await listPosts(tenantContext, filter);
  return posts.map(serializeSocialPost);
}

export async function generateSocialPostText(input: {
  brief: string;
  provider?: SocialProviderKey;
}): Promise<string> {
  assertSocialFeatureEnabled();
  const { tenantContext } = await requireTenantPermission("marketing.social.manage");

  const aiInstructionSettings = await loadAdminAiInstructionSettings({
    tenantContext,
  });

  const providerGuidance =
    input.provider === "instagram"
      ? "Write for Instagram: keep copy concise (max 2200 chars), use relevant hashtags, encourage engagement, emoji are welcome."
      : "Write for Facebook: can be longer and conversational (max 63206 chars), hashtags are optional, focus on storytelling.";

  const overlaySection = buildAiInstructionOverlaySection(
    aiInstructionSettings,
    "socialPosts",
  );

  const systemPrompt = [
    "You are a social-media copywriter. Produce ready-to-publish post copy based on the brief provided.",
    providerGuidance,
    "Return only the post text — no preamble, no explanation, no quotation marks wrapping the whole response.",
    overlaySection,
  ]
    .filter((s): s is string => Boolean(s?.trim()))
    .join("\n\n");

  return generateAdminText({ systemPrompt, context: input.brief });
}
