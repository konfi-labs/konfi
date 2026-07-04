import {
  getAdminDb,
  getStoreRuntimeConfigForRequest,
} from "@/lib/firebase/serverApp";
import {
  STOREFRONT_EDITOR_COOKIE,
  verifyStorefrontEditorToken,
} from "@/lib/storefront-editor/session";
import { FieldValue } from "firebase-admin/firestore";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

interface StorefrontMaintenanceBody {
  enabled?: unknown;
}

async function parseBody(request: Request): Promise<StorefrontMaintenanceBody> {
  try {
    const body = (await request.json()) as unknown;

    return body && typeof body === "object"
      ? (body as StorefrontMaintenanceBody)
      : {};
  } catch {
    return {};
  }
}

export async function PATCH(request: Request) {
  const token = (await cookies()).get(STOREFRONT_EDITOR_COOKIE)?.value;
  const session = verifyStorefrontEditorToken(token);

  if (!session) {
    return NextResponse.json(
      { error: "Preview session expired." },
      {
        status: 401,
      },
    );
  }

  const runtimeConfig = await getStoreRuntimeConfigForRequest();
  const tenantId = runtimeConfig?.tenantContext.tenantId;

  if (
    !runtimeConfig ||
    !tenantId ||
    runtimeConfig.channelId !== session.channelId ||
    tenantId !== session.tenantId
  ) {
    return NextResponse.json(
      { error: "Preview tenant mismatch." },
      {
        status: 403,
      },
    );
  }

  if (
    runtimeConfig.tenantContext.deploymentMode !== "saas" ||
    !runtimeConfig.hostname
  ) {
    return NextResponse.json(
      { error: "Maintenance mode can only be changed for hosted storefronts." },
      {
        status: 400,
      },
    );
  }

  const body = await parseBody(request);

  if (typeof body.enabled !== "boolean") {
    return NextResponse.json(
      { error: "Maintenance enabled flag is required." },
      {
        status: 400,
      },
    );
  }

  await getAdminDb()
    .collection("tenantDomains")
    .doc(runtimeConfig.hostname)
    .set(
      {
        maintenance: {
          enabled: body.enabled,
          updatedAt: FieldValue.serverTimestamp(),
          updatedByUid: session.uid,
        },
      },
      { merge: true },
    );

  return NextResponse.json({
    maintenance: {
      ...runtimeConfig.maintenance,
      enabled: body.enabled,
    },
    ok: true,
  });
}
