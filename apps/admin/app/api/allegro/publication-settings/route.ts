import { requireAdminAuth } from "@/actions/auth-utils";
import { getAllegroAccessToken, getAllegroApiBase } from "@/lib/allegro-auth";
import {
  type AllegroPublicationSettingsOptionsResponse,
  normalizeAllegroPublicationOptions,
} from "@/lib/allegro-publication-settings-options";
import { connection, NextResponse } from "next/server";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

const allegroHeaders = {
  Accept: "application/vnd.allegro.public.v1+json",
  "Accept-Language": "pl-PL",
};

interface AllegroPublicationSettingsEndpoint {
  path: string;
  property: keyof AllegroPublicationSettingsOptionsResponse;
}

const publicationSettingsEndpoints: AllegroPublicationSettingsEndpoint[] = [
  { path: "/sale/shipping-rates", property: "shippingRates" },
  {
    path: "/after-sales-service-conditions/return-policies",
    property: "returnPolicies",
  },
  {
    path: "/after-sales-service-conditions/implied-warranties",
    property: "impliedWarranties",
  },
  {
    path: "/after-sales-service-conditions/warranties",
    property: "warranties",
  },
  {
    path: "/sale/responsible-producers",
    property: "responsibleProducers",
  },
];

class AllegroPublicationSettingsFetchError extends Error {
  constructor(public readonly status: number) {
    super("Failed to fetch Allegro publication settings options");
  }
}

async function readAllegroPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

export async function GET(): Promise<NextResponse> {
  await connection();

  try {
    await requireAdminAuth();

    const tokenResult = await getAllegroAccessToken();
    if (!tokenResult) {
      return NextResponse.json(
        { error: "Not authenticated with Allegro" },
        { status: 401, headers: noStoreHeaders },
      );
    }

    const apiBase = getAllegroApiBase();
    const fetchedOptions = await Promise.all(
      publicationSettingsEndpoints.map(async ({ path, property }) => {
        const response = await fetch(`${apiBase}${path}`, {
          headers: {
            ...allegroHeaders,
            Authorization: `Bearer ${tokenResult.accessToken}`,
          },
        });
        const payload = await readAllegroPayload(response);

        if (!response.ok) {
          console.error(
            "Allegro publication settings option fetch failed:",
            path,
            response.status,
            payload,
          );
          throw new AllegroPublicationSettingsFetchError(response.status);
        }

        return {
          property,
          options: normalizeAllegroPublicationOptions(payload, property),
        };
      }),
    );

    const responsePayload: AllegroPublicationSettingsOptionsResponse = {
      impliedWarranties: [],
      responsibleProducers: [],
      returnPolicies: [],
      shippingRates: [],
      warranties: [],
    };

    for (const { options, property } of fetchedOptions) {
      responsePayload[property] = options;
    }

    return NextResponse.json(responsePayload, { headers: noStoreHeaders });
  } catch (error) {
    console.error(
      "Error fetching Allegro publication settings options:",
      error,
    );
    if (error instanceof AllegroPublicationSettingsFetchError) {
      return NextResponse.json(
        {
          error:
            error.status === 401
              ? "Allegro token expired"
              : "Failed to fetch Allegro publication settings options",
        },
        { status: error.status, headers: noStoreHeaders },
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch Allegro publication settings options" },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
