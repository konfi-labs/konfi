import "server-only";

import { lookup } from "node:dns/promises";
import net from "node:net";

const DEFAULT_MAX_REDIRECTS = 5;
const IPV4_BITS = 32;
const IPV6_BITS = 128;
const IPV4_MAPPED_IPV6_PREFIX_BITS = 96;
const CLOUD_METADATA_IPV4_ADDRESSES = new Set([
  "100.100.100.200",
  "168.63.129.16",
  "169.254.169.254",
]);

type ResolvedAddress = {
  address: string;
  family: 4 | 6;
};

export type ProviderUrlResolver = (
  hostname: string,
) => Promise<readonly ResolvedAddress[]>;

export type ProviderFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class ProviderUrlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderUrlValidationError";
  }
}

async function resolveHostname(
  hostname: string,
): Promise<readonly ResolvedAddress[]> {
  const addresses = await lookup(hostname, { all: true, verbatim: true });

  return addresses
    .filter(
      (entry): entry is ResolvedAddress =>
        entry.family === 4 || entry.family === 6,
    )
    .map((entry) => ({
      address: entry.address,
      family: entry.family,
    }));
}

function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .replace(/^\[(.*)\]$/, "$1")
    .replace(/\.$/, "")
    .toLowerCase();
}

function parseIpv4(address: string): number | null {
  const parts = address.split(".");

  if (parts.length !== 4) {
    return null;
  }

  let value = 0;

  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return null;
    }

    const octet = Number(part);

    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      return null;
    }

    value = value * 256 + octet;
  }

  return value >>> 0;
}

function formatIpv4(value: number): string {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join(".");
}

function ipv4InCidr(
  value: number,
  baseAddress: string,
  prefixLength: number,
): boolean {
  const base = parseIpv4(baseAddress);

  if (base === null) {
    return false;
  }

  const mask =
    prefixLength === 0 ? 0 : (0xffffffff << (IPV4_BITS - prefixLength)) >>> 0;

  return (value & mask) === (base & mask);
}

function isBlockedIpv4(address: string): boolean {
  const value = parseIpv4(address);

  if (value === null) {
    return true;
  }

  return (
    CLOUD_METADATA_IPV4_ADDRESSES.has(address) ||
    value === 0 ||
    ipv4InCidr(value, "0.0.0.0", 8) ||
    ipv4InCidr(value, "10.0.0.0", 8) ||
    ipv4InCidr(value, "127.0.0.0", 8) ||
    ipv4InCidr(value, "100.64.0.0", 10) ||
    ipv4InCidr(value, "169.254.0.0", 16) ||
    ipv4InCidr(value, "172.16.0.0", 12) ||
    ipv4InCidr(value, "192.0.0.0", 24) ||
    ipv4InCidr(value, "192.0.2.0", 24) ||
    ipv4InCidr(value, "192.168.0.0", 16) ||
    ipv4InCidr(value, "198.18.0.0", 15) ||
    ipv4InCidr(value, "198.51.100.0", 24) ||
    ipv4InCidr(value, "203.0.113.0", 24) ||
    ipv4InCidr(value, "224.0.0.0", 4) ||
    ipv4InCidr(value, "240.0.0.0", 4)
  );
}

function expandIpv4EmbeddedParts(parts: string[]): string[] | null {
  const lastPart = parts[parts.length - 1];

  if (!lastPart?.includes(".")) {
    return parts;
  }

  const ipv4 = parseIpv4(lastPart);

  if (ipv4 === null) {
    return null;
  }

  return [
    ...parts.slice(0, -1),
    ((ipv4 >>> 16) & 0xffff).toString(16),
    (ipv4 & 0xffff).toString(16),
  ];
}

function parseIpv6Parts(address: string): number[] | null {
  const normalized = address.toLowerCase();

  if (normalized.length === 0 || normalized.split("::").length > 2) {
    return null;
  }

  const [leftRaw, rightRaw = ""] = normalized.split("::");
  const leftParts = leftRaw ? leftRaw.split(":") : [];
  const rightParts = rightRaw ? rightRaw.split(":") : [];
  const expandedLeft = expandIpv4EmbeddedParts(leftParts);
  const expandedRight = expandIpv4EmbeddedParts(rightParts);

  if (!expandedLeft || !expandedRight) {
    return null;
  }

  const missingPartCount = normalized.includes("::")
    ? 8 - expandedLeft.length - expandedRight.length
    : 0;

  if (missingPartCount < 0) {
    return null;
  }

  const parts = normalized.includes("::")
    ? [
        ...expandedLeft,
        ...Array.from({ length: missingPartCount }, () => "0"),
        ...expandedRight,
      ]
    : expandedLeft;

  if (parts.length !== 8) {
    return null;
  }

  return parts.map((part) => {
    if (!/^[0-9a-f]{1,4}$/.test(part)) {
      return Number.NaN;
    }

    return Number.parseInt(part, 16);
  });
}

function ipv6ToBigInt(address: string): bigint | null {
  const parts = parseIpv6Parts(address);

  if (!parts || parts.some((part) => !Number.isInteger(part))) {
    return null;
  }

  return parts.reduce((value, part) => (value << 16n) + BigInt(part), 0n);
}

function ipv6InCidr(
  value: bigint,
  baseAddress: string,
  prefixLength: number,
): boolean {
  const base = ipv6ToBigInt(baseAddress);

  if (base === null) {
    return false;
  }

  const mask =
    ((1n << BigInt(IPV6_BITS)) - 1n) ^
    ((1n << BigInt(IPV6_BITS - prefixLength)) - 1n);

  return (value & mask) === (base & mask);
}

function getIpv4FromIpv6(value: bigint): string | null {
  if (
    ipv6InCidr(value, "::ffff:0:0", IPV4_MAPPED_IPV6_PREFIX_BITS) ||
    (value > 0n && value <= 0xffffffffn)
  ) {
    return formatIpv4(Number(value & 0xffffffffn));
  }

  return null;
}

function isBlockedIpv6(address: string): boolean {
  const value = ipv6ToBigInt(address);

  if (value === null) {
    return true;
  }

  const embeddedIpv4 = getIpv4FromIpv6(value);

  if (embeddedIpv4 && isBlockedIpv4(embeddedIpv4)) {
    return true;
  }

  return (
    value === 0n ||
    value === 1n ||
    ipv6InCidr(value, "fc00::", 7) ||
    ipv6InCidr(value, "fe80::", 10) ||
    ipv6InCidr(value, "ff00::", 8) ||
    ipv6InCidr(value, "2001:db8::", 32)
  );
}

function isBlockedAddress(address: string, family: 4 | 6): boolean {
  return family === 4 ? isBlockedIpv4(address) : isBlockedIpv6(address);
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "metadata.google.internal"
  );
}

function parseProviderUrl(input: string | URL): URL {
  try {
    return input instanceof URL ? input : new URL(input);
  } catch {
    throw new ProviderUrlValidationError(
      "External provider URL must be an absolute URL",
    );
  }
}

export async function validateExternalProviderUrl(
  input: string | URL,
  options?: {
    resolver?: ProviderUrlResolver;
  },
): Promise<URL> {
  const url = parseProviderUrl(input);

  if (url.protocol !== "https:") {
    throw new ProviderUrlValidationError(
      "External provider URLs must use HTTPS",
    );
  }

  const hostname = normalizeHostname(url.hostname);

  if (!hostname) {
    throw new ProviderUrlValidationError(
      "External provider URL must include a hostname",
    );
  }

  if (isLocalHostname(hostname)) {
    throw new ProviderUrlValidationError(
      "External provider URL points to a local hostname",
    );
  }

  const literalFamily = net.isIP(hostname);

  if (literalFamily === 4 || literalFamily === 6) {
    if (isBlockedAddress(hostname, literalFamily)) {
      throw new ProviderUrlValidationError(
        "External provider URL points to a non-public address",
      );
    }

    return url;
  }

  const resolver = options?.resolver ?? resolveHostname;
  const addresses = await resolver(hostname);

  if (addresses.length === 0) {
    throw new ProviderUrlValidationError(
      "External provider hostname did not resolve",
    );
  }

  const blockedAddress = addresses.find((entry) =>
    isBlockedAddress(entry.address, entry.family),
  );

  if (blockedAddress) {
    throw new ProviderUrlValidationError(
      `External provider hostname resolves to a non-public address: ${blockedAddress.address}`,
    );
  }

  return url;
}

function isRedirectResponse(response: Response): boolean {
  return (
    response.status >= 300 &&
    response.status < 400 &&
    response.headers.has("location")
  );
}

export async function fetchExternalProviderUrl(
  input: string | URL,
  init?: RequestInit,
  options?: {
    fetchImpl?: ProviderFetch;
    maxRedirects?: number;
    resolver?: ProviderUrlResolver;
  },
): Promise<Response> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const maxRedirects = options?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let currentUrl = await validateExternalProviderUrl(input, {
    resolver: options?.resolver,
  });

  for (
    let redirectCount = 0;
    redirectCount <= maxRedirects;
    redirectCount += 1
  ) {
    const response = await fetchImpl(currentUrl, {
      ...init,
      redirect: "manual",
    });

    if (!isRedirectResponse(response)) {
      return response;
    }

    if (redirectCount === maxRedirects) {
      throw new ProviderUrlValidationError(
        "External provider URL exceeded the redirect limit",
      );
    }

    const location = response.headers.get("location");

    if (!location) {
      return response;
    }

    currentUrl = await validateExternalProviderUrl(
      new URL(location, currentUrl),
      {
        resolver: options?.resolver,
      },
    );
  }

  throw new ProviderUrlValidationError(
    "External provider URL exceeded the redirect limit",
  );
}
