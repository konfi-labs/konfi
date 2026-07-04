import type { Metadata } from "next";

type SearchParamsValue = string | string[] | undefined;
type SearchParamsInput =
  | URLSearchParams
  | Record<string, SearchParamsValue>
  | undefined;

const defaultRemovedCanonicalParams = new Set([
  "adminPreview",
  "channelId",
  "cursor",
]);

function normalizePath(pathname: string): string {
  const trimmed = pathname.trim();

  if (!trimmed) {
    return "/";
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;

  if (withLeadingSlash === "/") {
    return withLeadingSlash;
  }

  return withLeadingSlash.replace(/\/+$/g, "");
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/g, "");
}

function appendSearchParam(
  params: URLSearchParams,
  key: string,
  value: string,
) {
  const trimmed = value.trim();

  if (!trimmed) {
    return;
  }

  params.append(key, trimmed);
}

function toSearchParams(input: SearchParamsInput): URLSearchParams {
  if (!input) {
    return new URLSearchParams();
  }

  if (input instanceof URLSearchParams) {
    return new URLSearchParams(input);
  }

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        appendSearchParam(params, key, item);
      }
      continue;
    }

    appendSearchParam(params, key, value);
  }

  return params;
}

export function buildCanonicalPath(
  pathname: string,
  searchParams?: SearchParamsInput,
  options?: {
    removeParams?: Iterable<string>;
  },
): string {
  const params = toSearchParams(searchParams);
  const removeParams = new Set([
    ...defaultRemovedCanonicalParams,
    ...(options?.removeParams ?? []),
  ]);

  for (const key of removeParams) {
    params.delete(key);
  }

  const emptyKeys: string[] = [];

  for (const key of params.keys()) {
    if (params.getAll(key).every((value) => !value.trim())) {
      emptyKeys.push(key);
    }
  }

  for (const key of emptyKeys) {
    params.delete(key);
  }

  const query = params.toString();
  const normalizedPath = normalizePath(pathname);

  return query ? `${normalizedPath}?${query}` : normalizedPath;
}

export function buildCanonicalUrl(params: {
  baseUrl: string;
  pathname: string;
  searchParams?: SearchParamsInput;
  removeParams?: Iterable<string>;
}): string {
  return `${trimTrailingSlash(params.baseUrl)}${buildCanonicalPath(
    params.pathname,
    params.searchParams,
    { removeParams: params.removeParams },
  )}`;
}

export function buildAlternates(params: {
  baseUrl?: string;
  pathname: string;
  searchParams?: SearchParamsInput;
  removeParams?: Iterable<string>;
}): Metadata["alternates"] {
  const canonicalPath = buildCanonicalPath(
    params.pathname,
    params.searchParams,
    { removeParams: params.removeParams },
  );

  return {
    canonical: params.baseUrl
      ? `${trimTrailingSlash(params.baseUrl)}${canonicalPath}`
      : canonicalPath,
  };
}

export function buildOpenGraph(params: {
  description?: string;
  images?: Metadata["openGraph"] extends { images?: infer Images }
    ? Images
    : never;
  siteName?: string;
  title: string;
  type?: "article" | "website";
  url: string;
}): Metadata["openGraph"] {
  return {
    description: params.description,
    images: params.images,
    siteName: params.siteName,
    title: params.title,
    type: params.type ?? "website",
    url: params.url,
  };
}
