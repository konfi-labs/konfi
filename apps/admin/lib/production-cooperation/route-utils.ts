import { handleProductionCooperationAction } from "@/lib/production-cooperation/service";
import type {
  ProductionCooperationActionRequest,
  ProductionCooperationActionResult,
  ProductionCooperationActionResultCode,
} from "@/lib/production-cooperation/types";
import type { ProductionCooperationTokenAction } from "@sblyvwx/cloud-contracts";
import { fallbackLng, languages } from "@/i18n/settings";
import { NextResponse } from "next/server";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeLanguage(value: string | undefined): string {
  if (!value) {
    return fallbackLng;
  }

  const language = value.split("-")[0] ?? fallbackLng;
  return languages.includes(language) ? language : fallbackLng;
}

function getRequestLanguage(request: Request, explicitLanguage?: string) {
  if (explicitLanguage) {
    return normalizeLanguage(explicitLanguage);
  }

  const cookieLanguage = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("i18next="))
    ?.split("=")[1];

  if (cookieLanguage) {
    return normalizeLanguage(decodeURIComponent(cookieLanguage));
  }

  return normalizeLanguage(request.headers.get("accept-language") ?? undefined);
}

function buildStatusUrl(
  request: Request,
  result: ProductionCooperationActionResult,
  language?: string,
) {
  const url = new URL(
    `/${getRequestLanguage(request, language)}/cooperation/status`,
    request.url,
  );
  url.searchParams.set("code", result.code);

  if (result.requestId) {
    url.searchParams.set("requestId", result.requestId);
  }

  return url;
}

function statusForCode(code: ProductionCooperationActionResultCode) {
  switch (code) {
    case "accepted":
    case "declined":
      return 200;
    case "expired":
      return 410;
    case "disabled":
    case "unauthorized":
      return 403;
    case "not_found":
      return 404;
    case "replayed":
      return 409;
    case "tampered":
      return 400;
    case "unavailable":
      return 503;
  }
}

async function parseJsonRequest(
  request: Request,
): Promise<ProductionCooperationActionRequest & { lng?: string }> {
  const payload = (await request.json()) as unknown;

  if (!isRecord(payload)) {
    return { token: "" };
  }

  return {
    requestId: readString(payload.requestId),
    token: readString(payload.token),
    declineReason: readString(payload.declineReason),
    lng: readString(payload.lng),
  };
}

async function parseFormRequest(
  request: Request,
): Promise<ProductionCooperationActionRequest & { lng?: string }> {
  const formData = await request.formData();

  return {
    requestId: readString(formData.get("requestId")),
    token: readString(formData.get("token")),
    declineReason: readString(formData.get("declineReason")),
    lng: readString(formData.get("lng")),
  };
}

async function parsePostRequest(
  request: Request,
): Promise<ProductionCooperationActionRequest & { lng?: string }> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return parseJsonRequest(request);
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    return parseFormRequest(request);
  }

  return {};
}

export async function handleProductionCooperationActionGet(
  request: Request,
  action: Exclude<ProductionCooperationTokenAction, "review">,
) {
  const url = new URL(request.url);
  const result = await handleProductionCooperationAction(action, {
    token: url.searchParams.get("token") ?? "",
    declineReason: url.searchParams.get("declineReason") ?? undefined,
  });

  return NextResponse.redirect(
    buildStatusUrl(request, result, url.searchParams.get("lng") ?? undefined),
  );
}

export async function handleProductionCooperationActionPost(
  request: Request,
  action: Exclude<ProductionCooperationTokenAction, "review">,
) {
  const parsedRequest = await parsePostRequest(request);
  const result = await handleProductionCooperationAction(action, parsedRequest);

  return Response.json(result, { status: statusForCode(result.code) });
}
