import { getTenantContextForRequest } from "@/lib/firebase/serverApp";
import { resolveStorefrontBaseUrl } from "@/lib/storefront-domains";
import { getTenantAdminScopeTenantId } from "@/actions/auth-utils";
import { NextResponse } from "next/server";

function normalizeStoreUrl(storeUrl: string) {
  return /^https?:\/\//i.test(storeUrl) ? storeUrl : `https://${storeUrl}`;
}

async function getStorePreviewBaseUrl(params: {
  channelId: string;
  requestUrl: URL;
}) {
  const explicitDevStoreUrl =
    process.env.NEXT_PUBLIC_STORE_DEV_URL?.trim() ||
    process.env.NEXT_PUBLIC_STORE_LOCAL_URL?.trim();

  if (process.env.NODE_ENV === "development") {
    if (explicitDevStoreUrl) {
      return normalizeStoreUrl(explicitDevStoreUrl);
    }

    const port = process.env.NEXT_PUBLIC_STORE_DEV_PORT?.trim() || "3000";
    return `${params.requestUrl.protocol}//${params.requestUrl.hostname}${port ? `:${port}` : ""}`;
  }

  const tenantContext = await getTenantContextForRequest();
  const tenantId =
    getTenantAdminScopeTenantId(tenantContext) ?? tenantContext.tenantId;

  if (!tenantId) {
    throw new Error("Tenant context is required.");
  }

  return resolveStorefrontBaseUrl({
    channelId: params.channelId,
    tenantContext,
    tenantId,
  });
}

function getRequiredStringField(formData: FormData, key: string): string {
  const value = formData.get(key);

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required preview handoff field: ${key}`);
  }

  return value;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function buildBridgeHtml(params: {
  channelId: string;
  redirect: string;
  requestUrl: URL;
  token: string;
}) {
  const previewUrl = new URL(
    "/api/product-preview",
    await getStorePreviewBaseUrl({
      channelId: params.channelId,
      requestUrl: params.requestUrl,
    }),
  );

  const action = escapeHtml(previewUrl.toString());
  const token = escapeHtml(params.token);
  const redirect = escapeHtml(params.redirect);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Opening preview</title>
  </head>
  <body>
    <p style="font-family: sans-serif; padding: 16px;">Opening preview…</p>
    <form id="preview-handoff" method="POST" action="${action}">
      <input type="hidden" name="token" value="${token}" />
      <input type="hidden" name="redirect" value="${redirect}" />
    </form>
    <script>
      document.getElementById("preview-handoff")?.submit();
    </script>
  </body>
</html>`;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const channelId = getRequiredStringField(formData, "channelId");
    const token = getRequiredStringField(formData, "token");
    const redirect = getRequiredStringField(formData, "redirect");
    const requestUrl = new URL(request.url);

    return new NextResponse(
      await buildBridgeHtml({ channelId, redirect, requestUrl, token }),
      {
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/html; charset=utf-8",
        },
        status: 200,
      },
    );
  } catch (error) {
    console.error("Failed to build store preview bridge", error);
    return NextResponse.json(
      { error: "Failed to open store preview." },
      {
        headers: {
          "Cache-Control": "no-store",
        },
        status: 400,
      },
    );
  }
}
