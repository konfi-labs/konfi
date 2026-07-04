import { requireAdminAuth } from "@/actions/auth-utils";
import { isDevelopmentAllegroMockEnabled } from "@/lib/allegro-order-mocks";
import {
  type AllegroOrderFulfillmentResult,
  type AllegroOrderFulfillmentUpdate,
  isAllegroOrderFulfillmentUpdateRequest,
} from "@/lib/allegro-order-fulfillment";
import {
  ALLEGRO_ORDER_FULFILLMENT_SCOPE,
  getAllegroAccessToken,
  getAllegroApiBase,
  getMissingAllegroScopes,
} from "@/lib/allegro-auth";
import { connection, NextRequest, NextResponse } from "next/server";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

const allegroJsonHeaders = {
  Accept: "application/vnd.allegro.public.v1+json",
  "Content-Type": "application/vnd.allegro.public.v1+json",
};

async function readAllegroError(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) return "Allegro rejected the fulfillment status update.";

  try {
    const payload = JSON.parse(text) as unknown;
    if (
      typeof payload === "object" &&
      payload !== null &&
      "errors" in payload &&
      Array.isArray(payload.errors)
    ) {
      const messages = payload.errors
        .map((error) => {
          if (typeof error !== "object" || error === null) return null;
          const errorRecord = error as Record<string, unknown>;
          return typeof errorRecord.userMessage === "string"
            ? errorRecord.userMessage
            : typeof errorRecord.message === "string"
              ? errorRecord.message
              : null;
        })
        .filter((message): message is string => Boolean(message));

      if (messages.length > 0) {
        return messages.join("\n");
      }
    }

    if (
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof payload.message === "string"
    ) {
      return payload.message;
    }
  } catch {
    return text;
  }

  return text;
}

function buildFulfillmentUrl(
  apiBase: string,
  update: AllegroOrderFulfillmentUpdate,
): string {
  const params = new URLSearchParams();
  if (update.revision?.trim()) {
    params.set("checkoutForm.revision", update.revision.trim());
  }

  const queryString = params.toString();
  const baseUrl = `${apiBase}/order/checkout-forms/${encodeURIComponent(
    update.id,
  )}/fulfillment`;
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  await connection();

  try {
    await requireAdminAuth();

    const body: unknown = await request.json();
    if (!isAllegroOrderFulfillmentUpdateRequest(body)) {
      return NextResponse.json(
        { error: "Invalid Allegro fulfillment update payload" },
        { status: 400, headers: noStoreHeaders },
      );
    }

    if (isDevelopmentAllegroMockEnabled()) {
      return NextResponse.json(
        {
          results: body.updates.map((update) => ({
            id: update.id,
            ok: true,
            status: update.status,
          })),
        },
        { headers: noStoreHeaders },
      );
    }

    const tokenResult = await getAllegroAccessToken();
    if (!tokenResult) {
      return NextResponse.json(
        { error: "Not authenticated with Allegro" },
        { status: 401, headers: noStoreHeaders },
      );
    }

    const missingScopes = getMissingAllegroScopes(tokenResult.tokenData.scope, [
      ALLEGRO_ORDER_FULFILLMENT_SCOPE,
    ]);
    if (missingScopes.length > 0) {
      return NextResponse.json(
        {
          error:
            "Reconnect Allegro before changing order statuses. The current token is missing the order write permission.",
          missingScopes,
        },
        { status: 403, headers: noStoreHeaders },
      );
    }

    const apiBase = getAllegroApiBase();
    const results = await Promise.all(
      body.updates.map(
        async (update): Promise<AllegroOrderFulfillmentResult> => {
          const response = await fetch(buildFulfillmentUrl(apiBase, update), {
            method: "PUT",
            headers: {
              ...allegroJsonHeaders,
              Authorization: `Bearer ${tokenResult.accessToken}`,
            },
            body: JSON.stringify({ status: update.status }),
          });

          if (response.ok) {
            return { id: update.id, ok: true, status: update.status };
          }

          const error = await readAllegroError(response);
          console.error(
            "Allegro fulfillment update failed:",
            update.id,
            response.status,
            error,
          );

          return { id: update.id, ok: false, error };
        },
      ),
    );

    const status = results.every((result) => result.ok) ? 200 : 207;
    return NextResponse.json({ results }, { status, headers: noStoreHeaders });
  } catch (error) {
    console.error("Error updating Allegro fulfillment status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
