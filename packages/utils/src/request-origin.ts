const ALLOWED_FETCH_SITES = new Set(["same-origin", "same-site", "none"]);

export function isSameOriginRequest({
  headers,
  requestOrigin,
  allowMissingHeaders = false,
}: {
  headers: Pick<Headers, "get">;
  requestOrigin: string;
  allowMissingHeaders?: boolean;
}) {
  const fetchSite = headers.get("sec-fetch-site");

  if (fetchSite && !ALLOWED_FETCH_SITES.has(fetchSite)) {
    return false;
  }

  const originHeader = headers.get("origin");

  if (originHeader) {
    return originHeader === requestOrigin;
  }

  const refererHeader = headers.get("referer");

  if (refererHeader) {
    try {
      return new URL(refererHeader).origin === requestOrigin;
    } catch {
      return false;
    }
  }

  return allowMissingHeaders;
}
