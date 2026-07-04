import crypto from "node:crypto";

import { DEFAULT_LOCALE } from "@konfi/types";

import {
  getPrzelewy24ApiKey,
  getPrzelewy24Crc,
  getPrzelewy24NotificationUrl,
  getPrzelewy24PosId,
  getStoreBaseUrl,
} from "../env";
import type {
  Przelewy24CheckoutSessionCreator,
  Przelewy24PaymentCredentials,
} from "../types";

export function calculateSHA384(data: string): string {
  return crypto.createHash("sha384").update(data, "utf8").digest("hex");
}

function createPrzelewy24Headers(apiKey: string, posId: string) {
  const headers = new Headers();
  headers.set(
    "Authorization",
    `Basic ${Buffer.from(`${posId}:${apiKey}`).toString("base64")}`,
  );
  headers.set("Content-Type", "application/json");

  return headers;
}

function getPrzelewy24BaseUrl(isTest: boolean) {
  return `https://${isTest ? "sandbox" : "secure"}.przelewy24.pl`;
}

function getPrzelewy24Credentials(
  isTest: boolean,
  credentials?: Przelewy24PaymentCredentials,
): Przelewy24PaymentCredentials {
  return {
    apiKey: credentials?.apiKey ?? getPrzelewy24ApiKey(isTest),
    crc: credentials?.crc ?? getPrzelewy24Crc(isTest),
    posId: credentials?.posId ?? getPrzelewy24PosId(isTest),
  };
}

function getPrzelewy24ApiCredentials(
  isTest: boolean,
  credentials?: Przelewy24PaymentCredentials,
): Pick<Przelewy24PaymentCredentials, "apiKey" | "posId"> {
  return {
    apiKey: credentials?.apiKey ?? getPrzelewy24ApiKey(isTest),
    posId: credentials?.posId ?? getPrzelewy24PosId(isTest),
  };
}

export type Przelewy24TransactionBySessionId = {
  statement?: string;
  orderId: number;
  sessionId?: string;
  status?: number;
  amount?: number;
  currency?: string;
  date?: string;
  dateOfTransaction?: string;
  clientEmail?: string;
  accountMD5?: string;
  paymentMethod?: number;
  description?: string;
  clientName?: string;
  clientAddress?: string;
  clientCity?: string;
  clientPostcode?: string;
  batchId?: number;
  fee?: string;
};

type Przelewy24ApiResponse<TData> = {
  code?: string | number;
  data?: TData;
  error?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function normalizePrzelewy24Body<TData>(
  value: unknown,
): Przelewy24ApiResponse<TData> {
  if (!isRecord(value)) {
    return {};
  }

  return value as Przelewy24ApiResponse<TData>;
}

async function readPrzelewy24Json<TData>(
  response: Response,
  operation: string,
): Promise<Przelewy24ApiResponse<TData>> {
  let body: Przelewy24ApiResponse<TData>;

  try {
    body = normalizePrzelewy24Body<TData>(await response.json());
  } catch (error) {
    const status = response.status || "unknown";
    const statusText = response.statusText || "non-JSON response";
    throw new Error(
      `Przelewy24 ${operation} failed: ${statusText} (Code: ${status})`,
      { cause: error },
    );
  }

  if (response.ok === false || body.error) {
    throw new Error(
      `Przelewy24 ${operation} failed: ${body.error || response.statusText || "Request failed"} (Code: ${body.code || response.status || "unknown"})`,
    );
  }

  return body;
}

export const createPrzelewy24CheckoutSession: Przelewy24CheckoutSessionCreator =
  async (isTest, amount, email, orderPath, options) => {
    const { apiKey, crc, posId } = getPrzelewy24Credentials(
      isTest,
      options?.credentials,
    );
    const merchantId = Number.parseInt(posId, 10);
    const headers = createPrzelewy24Headers(apiKey, posId);

    const hashData = {
      sessionId: orderPath,
      merchantId,
      amount,
      // This integration registers Przelewy24 transactions in PLN. Callers
      // must convert/snapshot any non-PLN order before choosing this provider.
      currency: "PLN",
      crc,
    };

    const response = await fetch(
      `${getPrzelewy24BaseUrl(isTest)}/api/v1/transaction/register`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...hashData,
          posId: merchantId,
          description: "Zamówienie",
          email,
          country: "PL",
          language: "pl",
          urlReturn: new URL(
            `/${DEFAULT_LOCALE}/account/orders`,
            `${getStoreBaseUrl(options?.storeBaseUrl)}/`,
          ).toString(),
          urlStatus:
            options?.notificationUrl ??
            getPrzelewy24NotificationUrl(undefined, options?.adminBaseUrl),
          timeLimit: 15,
          regulationAccept: true,
          sign: calculateSHA384(JSON.stringify(hashData)),
          encoding: "UTF-8",
        }),
      },
    );

    const body = await readPrzelewy24Json<{ token?: string }>(
      response,
      "transaction register",
    );

    if (!body.data?.token) {
      throw new Error(
        `Invalid API response: Missing token in response data: ${JSON.stringify(body)}`,
      );
    }

    return {
      id: body.data.token,
      url: `${getPrzelewy24BaseUrl(isTest)}/trnRequest/${body.data.token}`,
      payment_intent: "",
    };
  };

export async function getPrzelewy24TransactionBySessionId(params: {
  isTest: boolean;
  sessionId: string;
  credentials?: Przelewy24PaymentCredentials;
}): Promise<Przelewy24TransactionBySessionId> {
  const { apiKey, posId } = getPrzelewy24ApiCredentials(
    params.isTest,
    params.credentials,
  );
  const response = await fetch(
    `${getPrzelewy24BaseUrl(params.isTest)}/api/v1/transaction/by/sessionId/${encodeURIComponent(params.sessionId)}`,
    {
      method: "GET",
      headers: createPrzelewy24Headers(apiKey, posId),
    },
  );

  const body = await readPrzelewy24Json<{ orderId?: number }>(
    response,
    "transaction lookup",
  );

  if (typeof body.data?.orderId !== "number") {
    throw new Error("Invalid API response: Missing orderId");
  }

  return body.data as Przelewy24TransactionBySessionId;
}

export async function refundPrzelewy24Payment(params: {
  isTest: boolean;
  sessionId: string;
  amount: number;
  credentials?: Przelewy24PaymentCredentials;
  description: string;
  requestId: string;
  refundsUrlStatus?: string;
}) {
  const { apiKey, crc, posId } = getPrzelewy24Credentials(
    params.isTest,
    params.credentials,
  );
  const merchantId = Number.parseInt(posId, 10);
  const transaction = await getPrzelewy24TransactionBySessionId({
    isTest: params.isTest,
    sessionId: params.sessionId,
    credentials: params.credentials,
  });
  const refundsUuid = crypto.randomUUID();
  const refundAmount = Math.floor(params.amount);

  if (refundAmount < 1) {
    throw new Error("Refund amount must be greater than 0");
  }
  const sign = calculateSHA384(
    JSON.stringify({
      sessionId: params.sessionId,
      orderId: transaction.orderId,
      amount: refundAmount,
      crc,
    }),
  );

  const response = await fetch(
    `${getPrzelewy24BaseUrl(params.isTest)}/api/v1/transaction/refund`,
    {
      method: "POST",
      headers: createPrzelewy24Headers(apiKey, posId),
      body: JSON.stringify({
        requestId: params.requestId,
        refundsUuid,
        refunds: [
          {
            orderId: transaction.orderId,
            sessionId: params.sessionId,
            amount: refundAmount,
            description: params.description,
            merchantId,
            posId: merchantId,
            sign,
          },
        ],
        ...(params.refundsUrlStatus
          ? { urlStatus: params.refundsUrlStatus }
          : {}),
      }),
    },
  );

  const body = await readPrzelewy24Json<{
    refundsUuid?: string;
    status?: string;
  }>(response, "transaction refund");

  return {
    refundsUuid: body.data?.refundsUuid ?? refundsUuid,
    status: body.data?.status ?? "success",
    orderId: transaction.orderId,
  };
}
