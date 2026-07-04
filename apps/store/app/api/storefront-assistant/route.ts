import { firebaseConfig } from "@/lib/firebase/config";
import {
  getAdminAuth,
  getStoreRuntimeConfigForRequest,
  verifyAnyIdToken,
  verifyAppCheckToken,
} from "@/lib/firebase/serverApp";
import { runStorefrontAssistant } from "@/lib/storefront-assistant/agent.server";
import { persistStorefrontAssistantTurn } from "@/lib/storefront-assistant/history.server";
import { checkStorefrontAssistantRateLimit } from "@/lib/storefront-assistant/rate-limit.server";
import { normalizeAssistantLocale } from "@/lib/storefront-assistant/schema";
import type { StorefrontAssistantRequestBody } from "@/lib/storefront-assistant/types";
import { NextRequest, NextResponse } from "next/server";

const APP_CHECK_HEADER = "x-firebase-appcheck";
const AUTH_HEADER_PREFIX = "Bearer ";
const MAX_MESSAGE_LENGTH = 1000;

function jsonError(message: string, status: number, retryAfter?: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined,
    },
  );
}

function getBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith(AUTH_HEADER_PREFIX)) {
    return null;
  }

  return authHeader.slice(AUTH_HEADER_PREFIX.length);
}

async function authenticateStorefrontAssistantRequest(
  request: NextRequest,
): Promise<{ ok: true; uid: string } | { ok: false; response: NextResponse }> {
  const idToken = getBearerToken(request);
  if (!idToken) {
    return {
      ok: false,
      response: jsonError("Authentication is required.", 401),
    };
  }

  const decodedToken = await verifyAnyIdToken(idToken);
  if (!decodedToken) {
    return {
      ok: false,
      response: jsonError("Authentication is required.", 401),
    };
  }

  if (decodedToken.firebase.sign_in_provider === "anonymous") {
    return {
      ok: false,
      response: jsonError("Anonymous accounts cannot use the assistant.", 403),
    };
  }

  if (process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) {
    const appCheckToken = request.headers.get(APP_CHECK_HEADER)?.trim();
    if (!appCheckToken) {
      return {
        ok: false,
        response: jsonError("App Check token is required.", 401),
      };
    }

    const verification = await verifyAppCheckToken(appCheckToken);
    if (!verification) {
      return {
        ok: false,
        response: jsonError("Invalid App Check token.", 401),
      };
    }

    if (verification.appId !== firebaseConfig.appId) {
      return { ok: false, response: jsonError("Invalid App Check app.", 403) };
    }
  }

  const userRecord = await getAdminAuth().getUser(decodedToken.uid);
  if (userRecord.disabled) {
    return {
      ok: false,
      response: jsonError("Authentication is required.", 401),
    };
  }

  return { ok: true, uid: decodedToken.uid };
}

function parseRequestBody(
  body: unknown,
): StorefrontAssistantRequestBody | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }

  const candidate = body as Partial<StorefrontAssistantRequestBody>;
  if (
    typeof candidate.message !== "string" ||
    candidate.message.trim().length === 0 ||
    candidate.message.length > MAX_MESSAGE_LENGTH
  ) {
    return null;
  }

  return {
    conversationId:
      typeof candidate.conversationId === "string" &&
      candidate.conversationId.trim().length > 0
        ? candidate.conversationId.trim()
        : undefined,
    message: candidate.message.trim(),
    locale: candidate.locale,
  };
}

export async function POST(request: NextRequest) {
  try {
    const authentication =
      await authenticateStorefrontAssistantRequest(request);
    if (!authentication.ok) {
      return authentication.response;
    }

    const runtimeConfig = await getStoreRuntimeConfigForRequest();
    if (!runtimeConfig) {
      return jsonError("Store not found.", 404);
    }

    const rateLimit = await checkStorefrontAssistantRateLimit(
      authentication.uid,
    );
    if (!rateLimit.allowed) {
      return jsonError(
        "Too many assistant requests. Please try again later.",
        429,
        rateLimit.retryAfterSeconds,
      );
    }

    let parsedJson: unknown;
    try {
      parsedJson = await request.json();
    } catch (error) {
      console.error("[Storefront Assistant] Invalid JSON body:", error);
      return jsonError("Request body must be valid JSON.", 400);
    }

    const body = parseRequestBody(parsedJson);
    if (!body) {
      return jsonError(
        "A message between 1 and 1000 characters is required.",
        400,
      );
    }

    const locale = normalizeAssistantLocale(body.locale);
    const assistantResponse = await runStorefrontAssistant({
      locale,
      message: body.message,
    });

    try {
      assistantResponse.conversationId = await persistStorefrontAssistantTurn({
        channelId: runtimeConfig.channelId,
        conversationId: body.conversationId,
        locale,
        message: body.message,
        response: assistantResponse,
        uid: authentication.uid,
      });
    } catch (error) {
      console.error("[Storefront Assistant] History persistence error:", error);
    }

    return NextResponse.json(assistantResponse);
  } catch (error) {
    console.error("[Storefront Assistant] Error:", error);
    return jsonError("Assistant is unavailable right now.", 500);
  }
}
