const absoluteHttpUrlPattern = /^https?:\/\//iu;

function firstNonBlank(...values: (string | undefined)[]): string | undefined {
  return values.map((value) => value?.trim()).find(Boolean);
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/u, "");

  if (!trimmed) {
    throw new Error("Revalidation base URL is empty.");
  }

  if (absoluteHttpUrlPattern.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed.replace(/^\/+/u, "")}`;
}

export function getRevalidateApiBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (env.NODE_ENV === "development") {
    return "http://localhost:3000/api/revalidate";
  }

  const explicitRevalidateUrl = env.FRONTEND_REVALIDATE_URL?.trim();

  if (explicitRevalidateUrl) {
    return normalizeBaseUrl(explicitRevalidateUrl);
  }

  const storeUrl = firstNonBlank(env.STORE_URL, env.NEXT_PUBLIC_STORE_URL);

  if (!storeUrl) {
    throw new Error(
      "FRONTEND_REVALIDATE_URL or STORE_URL or NEXT_PUBLIC_STORE_URL is not set in environment variables.",
    );
  }

  return new URL("api/revalidate", `${normalizeBaseUrl(storeUrl)}/`).toString();
}

export function buildRevalidateTagUrlFromApiBaseUrl(
  tag: string,
  apiBaseUrl: string,
): string {
  const trimmedTag = tag.trim();

  if (!trimmedTag) {
    throw new Error("Revalidation tag is required.");
  }

  return new URL(
    encodeURIComponent(trimmedTag),
    `${apiBaseUrl.replace(/\/+$/u, "")}/`,
  ).toString();
}

export function buildRevalidateTagUrl(
  tag: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return buildRevalidateTagUrlFromApiBaseUrl(tag, getRevalidateApiBaseUrl(env));
}

export function buildRevalidateRouteUrlFromApiBaseUrl(
  tag: string,
  path: string,
  apiBaseUrl: string,
): string {
  const trimmedPath = path.trim();

  if (!trimmedPath) {
    throw new Error("Revalidation path is required.");
  }

  const url = new URL(buildRevalidateTagUrlFromApiBaseUrl(tag, apiBaseUrl));
  url.searchParams.set("path", trimmedPath);

  return url.toString();
}

export function buildRevalidateRouteUrl(
  tag: string,
  path: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return buildRevalidateRouteUrlFromApiBaseUrl(
    tag,
    path,
    getRevalidateApiBaseUrl(env),
  );
}
