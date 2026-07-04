const STRIPE_API_VERSION = "2025-11-17.clover";

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not defined`);
  }

  return value;
}

function getOptionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

function normalizeBaseUrl(value: string): string {
  const normalizedValue = value.replace(/\/+$/u, "");
  const parsed = new URL(
    normalizedValue.includes("://")
      ? normalizedValue
      : `https://${normalizedValue}`,
  );

  return parsed.origin;
}

function buildUrl(baseUrl: string, pathname: string): string {
  return new URL(pathname, `${normalizeBaseUrl(baseUrl)}/`).toString();
}

export function getStoreBaseUrl(runtimeStoreUrl?: string): string {
  const storeUrl =
    runtimeStoreUrl ??
    process.env.STORE_URL ??
    process.env.NEXT_PUBLIC_STORE_URL;

  if (!storeUrl) {
    throw new Error("STORE_URL or NEXT_PUBLIC_STORE_URL is not defined");
  }

  return normalizeBaseUrl(storeUrl);
}

export function getAdminBaseUrl(runtimeAdminUrl?: string): string {
  const adminUrl =
    runtimeAdminUrl ??
    process.env.ADMIN_URL ??
    process.env.NEXT_PUBLIC_ADMIN_URL;

  if (!adminUrl) {
    throw new Error("ADMIN_URL or NEXT_PUBLIC_ADMIN_URL is not defined");
  }

  return normalizeBaseUrl(adminUrl);
}

export function getStoreOrdersSuccessUrl(runtimeStoreUrl?: string): string {
  return buildUrl(getStoreBaseUrl(runtimeStoreUrl), "/en/account/orders");
}

export function getPrzelewy24NotificationUrl(
  _isTest?: boolean,
  runtimeAdminUrl?: string,
): string {
  return buildUrl(
    getAdminBaseUrl(runtimeAdminUrl),
    "/api/payments/przelewy24/webhook",
  );
}

export function getStripeWebhookPath(_isTest?: boolean): string {
  return "/api/payments/stripe/webhook";
}

export function getStripeSecretKey(isTest: boolean): string {
  return getRequiredEnv(isTest ? "STRIPE_SECRET_KEY_DEV" : "STRIPE_SECRET_KEY");
}

export function getStripeWebhookSecret(): string {
  return getRequiredEnv("STRIPE_WEBHOOK_SECRET");
}

export function getPrzelewy24WebhookApiKey(): string {
  return getRequiredEnv("PRZELEWY24_API_KEY");
}

export function getPrzelewy24WebhookCrc(): string {
  return getRequiredEnv("PRZELEWY24_CRC");
}

export function getPrzelewy24ApiKey(isTest: boolean): string {
  return getRequiredEnv(
    isTest ? "PRZELEWY24_API_KEY_DEV" : "PRZELEWY24_API_KEY",
  );
}

export function getPrzelewy24Crc(isTest: boolean): string {
  return getRequiredEnv(isTest ? "PRZELEWY24_CRC_DEV" : "PRZELEWY24_CRC");
}

export function getPrzelewy24PosId(isTest = false): string {
  if (isTest) {
    const devPosId = getOptionalEnv("PRZELEWY24_POS_ID_DEV");

    if (devPosId) {
      return devPosId;
    }
  }

  return getRequiredEnv("PRZELEWY24_POS_ID");
}

export { STRIPE_API_VERSION };
