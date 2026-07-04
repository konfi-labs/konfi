import { normalizeEmailAddress, parseEmailAddress } from "./addressing";

export type SenderAuthVerdict = "trusted" | "untrusted";
export type SenderAuthResult = "pass" | "fail" | "neutral" | "none" | "unknown";

export interface SenderAuthentication {
  dkim: SenderAuthResult;
  dmarc: SenderAuthResult;
  spf: SenderAuthResult;
  reasons: string[];
  verdict: SenderAuthVerdict;
}

function getHeaderValue(
  headers: Record<string, string | string[] | undefined>,
  headerName: string,
) {
  const expected = headerName.toLowerCase();

  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() !== expected) {
      continue;
    }

    return Array.isArray(value) ? value.join(" ") : (value ?? "");
  }

  return "";
}

function getAuthenticationResults(
  headers: Record<string, string | string[] | undefined>,
) {
  return [
    getHeaderValue(headers, "authentication-results"),
    getHeaderValue(headers, "arc-authentication-results"),
  ]
    .filter(Boolean)
    .join("; ");
}

function getAuthenticationDomainCandidates({
  authenticationResults,
  headers,
}: {
  authenticationResults: string;
  headers: Record<string, string | string[] | undefined>;
}) {
  return [
    getEmailOrDomain(getAuthDomain(authenticationResults, "smtp.mailfrom=")),
    getEmailOrDomain(getAuthDomain(authenticationResults, "envelope-from=")),
    getEmailOrDomain(getHeaderValue(headers, "return-path")),
  ].filter(
    (domain): domain is string =>
      typeof domain === "string" && domain.length > 0,
  );
}

function parseAuthResult(value: string, mechanism: "dkim" | "dmarc" | "spf") {
  const normalized = value.toLowerCase();
  const marker = `${mechanism}=`;
  const index = normalized.indexOf(marker);

  if (index < 0) {
    return "none" satisfies SenderAuthResult;
  }

  const result = normalized
    .slice(index + marker.length)
    .split(/[;\s]/)[0]
    .trim();

  if (
    result === "pass" ||
    result === "fail" ||
    result === "neutral" ||
    result === "none"
  ) {
    return result;
  }

  return "unknown";
}

export function parseSenderAuthenticationHeaders(
  headers: Record<string, string | string[] | undefined>,
): SenderAuthentication {
  const authenticationResults = getAuthenticationResults(headers);

  const spf = parseAuthResult(authenticationResults, "spf");
  const dkim = parseAuthResult(authenticationResults, "dkim");
  const dmarc = parseAuthResult(authenticationResults, "dmarc");
  const reasons: string[] = [];

  if (!authenticationResults) {
    reasons.push("No sender authentication headers were present.");
  }

  if (dmarc === "fail" || spf === "fail" || dkim === "fail") {
    reasons.push("At least one sender authentication mechanism failed.");
  }

  const verdict =
    dmarc === "pass" || (spf === "pass" && dkim === "pass")
      ? "trusted"
      : "untrusted";

  if (verdict === "untrusted" && reasons.length === 0) {
    reasons.push(
      "Sender authentication did not include DMARC pass or combined SPF/DKIM pass.",
    );
  }

  return { dkim, dmarc, spf, reasons, verdict };
}

function getEmailOrDomain(value: string | null | undefined) {
  const normalized = normalizeEmailAddress(value).replace(/^<|>$/g, "");

  if (!normalized) {
    return "";
  }

  if (!normalized.includes("@")) {
    return normalized;
  }

  const email = parseEmailAddress(normalized).email;
  return normalizeEmailAddress(email).split("@").at(1) ?? "";
}

function getAuthDomain(value: string, marker: string) {
  const normalized = value.toLowerCase();
  const index = normalized.indexOf(marker);

  if (index < 0) {
    return "";
  }

  return normalized
    .slice(index + marker.length)
    .split(/[;\s]/)[0]
    .trim()
    .replace(/^<|>$/g, "");
}

function domainsAlign(left: string, right: string) {
  return Boolean(left) && Boolean(right) && left === right;
}

export function evaluateInboundSenderAuthentication({
  from,
  headers,
}: {
  from: string;
  headers: Record<string, string | string[] | undefined>;
}): SenderAuthentication {
  const parsed = parseSenderAuthenticationHeaders(headers);

  if (parsed.verdict !== "trusted") {
    return parsed;
  }

  const authenticationResults = getAuthenticationResults(headers);
  const fromDomain = getEmailOrDomain(from);
  const dmarcFromDomain = getAuthDomain(authenticationResults, "header.from=");

  if (
    parsed.dmarc === "pass" &&
    (!dmarcFromDomain || domainsAlign(fromDomain, dmarcFromDomain))
  ) {
    return parsed;
  }

  const dkimDomain = getAuthDomain(authenticationResults, "header.d=");
  const spfDomains = getAuthenticationDomainCandidates({
    authenticationResults,
    headers,
  });
  const hasAlignedAuthenticatedDomain =
    domainsAlign(fromDomain, dkimDomain) ||
    spfDomains.some((domain) => domainsAlign(fromDomain, domain));

  if (
    parsed.spf === "pass" &&
    parsed.dkim === "pass" &&
    hasAlignedAuthenticatedDomain
  ) {
    return parsed;
  }

  return {
    ...parsed,
    reasons: [
      ...parsed.reasons,
      "Sender authentication passed but did not align with the visible From domain.",
    ],
    verdict: "untrusted",
  };
}

export function evaluateInboundAdminForwarderAuthentication({
  adminEmail,
  from,
  headers,
}: {
  adminEmail: string;
  from: string;
  headers: Record<string, string | string[] | undefined>;
}): SenderAuthentication {
  const direct = evaluateInboundSenderAuthentication({ from, headers });

  if (direct.verdict === "trusted") {
    return direct;
  }

  const senderEmail = parseEmailAddress(from).email;
  if (normalizeEmailAddress(adminEmail) !== senderEmail) {
    return direct;
  }

  const authenticationResults = getAuthenticationResults(headers);
  const parsed = parseSenderAuthenticationHeaders(headers);
  const fromDomain = getEmailOrDomain(from);
  const hasAlignedSpfPass =
    parsed.spf === "pass" &&
    getAuthenticationDomainCandidates({
      authenticationResults,
      headers,
    }).some((domain) => domainsAlign(fromDomain, domain));

  if (!hasAlignedSpfPass) {
    return direct;
  }

  return {
    ...parsed,
    reasons: ["Known admin forwarder passed aligned SPF authentication."],
    verdict: "trusted",
  };
}

export function normalizeHeaders(
  headers: Record<string, string | string[] | undefined> | undefined,
) {
  const normalized: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers ?? {})) {
    const headerName = name.toLowerCase();
    normalized[headerName] = Array.isArray(value)
      ? value.join(", ")
      : String(value ?? "");
  }

  return normalized;
}

export function isSenderDomainAligned({
  fromEmail,
  returnPath,
}: {
  fromEmail: string;
  returnPath?: string;
}) {
  const senderDomain = normalizeEmailAddress(fromEmail).split("@").at(1);
  const returnPathDomain = normalizeEmailAddress(returnPath).split("@").at(1);

  if (!senderDomain || !returnPathDomain) {
    return false;
  }

  return senderDomain === returnPathDomain;
}
