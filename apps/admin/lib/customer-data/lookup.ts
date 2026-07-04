import "server-only";

import { getFakturowniaClient } from "@/lib/fakturownia/client";
import type {
  Client,
  FakturowniaGusLookupRequest,
  FakturowniaGusLookupResponse,
  FakturowniaGusLookupResult,
} from "@konfi/fakturownia/client/models";

export type CustomerDataSource =
  | "fakturownia-client"
  | "fakturownia-gus"
  | "wl";

export interface CustomerDataSubject {
  description?: string;
  krs?: string;
  name?: string;
  nip?: string;
  regon?: string;
  residenceAddress?: string;
  workingAddress?: string;
}

export interface CustomerDataMatch {
  email?: string;
  id: string;
  subject: CustomerDataSubject;
}

export interface CustomerDataLookupResult {
  errors?: string[];
  matches?: CustomerDataMatch[];
  notices?: string[];
  source: CustomerDataSource;
  subject: CustomerDataSubject | null;
}

export interface FakturowniaCustomerDescriptionLookupResult {
  descriptions: string[];
  source: "fakturownia-client";
}

interface WLResponse {
  code?: string;
  message?: string;
  result: {
    subject: CustomerDataSubject | null;
  };
}

const NIP_SEPARATOR_RE = /[\s-]/g;

function normalizeNip(value?: string): string {
  return value?.replace(NIP_SEPARATOR_RE, "") ?? "";
}

function getNormalizedTaxId(value?: string | null): string {
  return value?.replace(/\D/g, "") ?? "";
}

function normalizeMessageList(
  messages?: Array<string | null | undefined> | null,
): string[] | undefined {
  const normalizedMessages = messages
    ?.map((message) => message?.trim())
    .filter((message): message is string => Boolean(message));

  if (!normalizedMessages || normalizedMessages.length === 0) {
    return undefined;
  }

  return normalizedMessages;
}

function normalizeOptionalString(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeOptionalUnknownString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return normalizeOptionalString(value);
}

function buildClientDisplayName(client: Client): string | undefined {
  const name = normalizeOptionalString(client.name);
  if (name) {
    return name;
  }

  const fullName = normalizeOptionalString(
    [client.firstName, client.lastName].filter(Boolean).join(" "),
  );
  if (fullName) {
    return fullName;
  }

  return (
    normalizeOptionalString(client.email) ??
    getClientTaxNo(client) ??
    (client.id !== undefined && client.id !== null
      ? `#${client.id}`
      : undefined)
  );
}

function getClientTaxNo(client: Client): string | undefined {
  return (
    normalizeOptionalString(client.taxNo) ??
    normalizeOptionalUnknownString(client.additionalData?.tax_no)
  );
}

function buildClientAddressLine(client: Client): string | undefined {
  const street = normalizeOptionalString(client.street);
  const postCode = normalizeOptionalString(client.postCode);
  const city = normalizeOptionalString(client.city);

  if (!street && !postCode && !city) {
    return undefined;
  }

  const locality = [postCode, city].filter(Boolean).join(" ");
  return [street, locality].filter(Boolean).join(", ");
}

function mapFakturowniaClientSubject(client: Client): CustomerDataSubject {
  const description = normalizeOptionalString(client.note);

  return {
    ...(description ? { description } : {}),
    name: buildClientDisplayName(client),
    nip: getClientTaxNo(client),
    workingAddress: buildClientAddressLine(client),
  };
}

function mapFakturowniaClientMatch(client: Client): CustomerDataMatch {
  return {
    email: normalizeOptionalString(client.email),
    id:
      client.id !== undefined && client.id !== null
        ? String(client.id)
        : [
            "client",
            buildClientDisplayName(client) ?? "",
            getNormalizedTaxId(getClientTaxNo(client)),
          ].join("-"),
    subject: mapFakturowniaClientSubject(client),
  };
}

function buildAddressLine(
  result?: FakturowniaGusLookupResult | null,
): string | undefined {
  const street = normalizeOptionalString(result?.street);
  const postCode = normalizeOptionalString(result?.postCode);
  const city = normalizeOptionalString(result?.city);

  if (!street && !postCode && !city) {
    return undefined;
  }

  const locality = [postCode, city].filter(Boolean).join(" ");
  return [street, locality].filter(Boolean).join(", ");
}

function mapFakturowniaGusSubject(
  result?: FakturowniaGusLookupResult | null,
): CustomerDataSubject | null {
  if (!result) {
    return null;
  }

  const subject: CustomerDataSubject = {
    krs: normalizeOptionalString(result.krs),
    name: normalizeOptionalString(result.name),
    nip: normalizeOptionalString(result.nip),
    regon: normalizeOptionalString(result.regon),
    workingAddress: buildAddressLine(result),
  };

  const hasValue = Object.values(subject).some(
    (value) => typeof value === "string" && value.length > 0,
  );

  return hasValue ? subject : null;
}

function mergeMessages(
  ...messageGroups: Array<string[] | undefined>
): string[] | undefined {
  const mergedMessages = messageGroups.flatMap((messages) => messages ?? []);
  if (mergedMessages.length === 0) {
    return undefined;
  }

  return Array.from(new Set(mergedMessages));
}

function isFakturowniaConfigured(): boolean {
  return Boolean(
    process.env.FAKTUROWNIA_API_KEY && process.env.FAKTUROWNIA_SUBDOMAIN,
  );
}

export async function lookupFakturowniaClientData(
  nip: string,
): Promise<CustomerDataLookupResult | undefined> {
  if (!isFakturowniaConfigured()) {
    return undefined;
  }

  const client = await getFakturowniaClient();

  try {
    const clients =
      (await client.clientsJson.get({
        queryParameters: {
          taxNo: nip,
        },
      })) ?? [];

    const exactMatches = clients.filter(
      (candidate) => getNormalizedTaxId(getClientTaxNo(candidate)) === nip,
    );

    if (exactMatches.length === 0) {
      return undefined;
    }

    if (exactMatches.length === 1) {
      return {
        source: "fakturownia-client",
        subject: mapFakturowniaClientSubject(exactMatches[0]),
      };
    }

    return {
      source: "fakturownia-client",
      matches: exactMatches.map((candidate) =>
        mapFakturowniaClientMatch(candidate),
      ),
      subject: null,
    };
  } catch (error) {
    console.error("[lookupFakturowniaClientData] Error:", error);
    return undefined;
  }
}

export async function lookupFakturowniaCustomerDescriptionsByNip(
  nip: string,
): Promise<FakturowniaCustomerDescriptionLookupResult> {
  const normalizedNip = normalizeNip(nip);

  if (!isFakturowniaConfigured()) {
    return {
      source: "fakturownia-client",
      descriptions: [],
    };
  }

  const client = await getFakturowniaClient();

  try {
    const clients =
      (await client.clientsJson.get({
        queryParameters: {
          taxNo: normalizedNip,
        },
      })) ?? [];

    const descriptions = clients
      .filter(
        (candidate) =>
          getNormalizedTaxId(getClientTaxNo(candidate)) === normalizedNip,
      )
      .map((candidate) => normalizeOptionalString(candidate.note))
      .filter((description): description is string => Boolean(description));

    return {
      source: "fakturownia-client",
      descriptions: Array.from(new Set(descriptions)),
    };
  } catch (error) {
    console.error("[lookupFakturowniaCustomerDescriptionsByNip] Error:", error);
    return {
      source: "fakturownia-client",
      descriptions: [],
    };
  }
}

export async function lookupFakturowniaGusCustomerData(
  nip: string,
): Promise<CustomerDataLookupResult | undefined> {
  if (!isFakturowniaConfigured()) {
    return undefined;
  }

  const client = await getFakturowniaClient();
  const body: FakturowniaGusLookupRequest = {
    type: "nip",
    numer: nip,
    code: "",
    mode: "",
  };

  try {
    const response = (await client.clients.gus_dataJson.post(body)) as
      | FakturowniaGusLookupResponse
      | undefined;

    return {
      source: "fakturownia-gus",
      subject: mapFakturowniaGusSubject(response?.results),
      errors: normalizeMessageList(response?.errors),
      notices: normalizeMessageList(response?.notices),
    };
  } catch (error) {
    console.error("[lookupFakturowniaGusCustomerData] Error:", error);
    return undefined;
  }
}

export async function lookupWlCustomerData(
  nip: string,
): Promise<CustomerDataLookupResult> {
  const date = new Date().toISOString().slice(0, 10);

  try {
    const response = await fetch(
      `https://wl-api.mf.gov.pl/api/search/nip/${nip}?date=${date}`,
      {
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return {
        source: "wl",
        subject: null,
        errors: [`HTTP ${response.status}`],
      };
    }

    const body = (await response.json()) as WLResponse;

    if (body.code) {
      return {
        source: "wl",
        subject: null,
        errors: [body.message ?? body.code],
      };
    }

    return {
      source: "wl",
      subject: body.result.subject,
    };
  } catch (error) {
    console.error("[lookupWlCustomerData] Error:", error);
    return {
      source: "wl",
      subject: null,
      errors: [
        error instanceof Error ? error.message : "Unknown WL lookup error",
      ],
    };
  }
}

export async function lookupCustomerDataByNip(
  nip: string,
): Promise<CustomerDataLookupResult> {
  const normalizedNip = normalizeNip(nip);

  const fakturowniaClientLookup =
    await lookupFakturowniaClientData(normalizedNip);

  if (fakturowniaClientLookup) {
    return fakturowniaClientLookup;
  }

  const fakturowniaLookup =
    await lookupFakturowniaGusCustomerData(normalizedNip);

  if (fakturowniaLookup?.subject) {
    return fakturowniaLookup;
  }

  const wlLookup = await lookupWlCustomerData(normalizedNip);

  if (wlLookup.subject) {
    return wlLookup;
  }

  return {
    source: fakturowniaLookup?.source ?? wlLookup.source,
    subject: null,
    errors: mergeMessages(fakturowniaLookup?.errors, wlLookup.errors),
    notices: mergeMessages(fakturowniaLookup?.notices, wlLookup.notices),
  };
}
