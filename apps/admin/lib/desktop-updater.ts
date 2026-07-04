const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const NO_STORE_CACHE_CONTROL = "no-store, no-cache, must-revalidate, max-age=0";

type DesktopPlatform = "darwin" | "linux" | "win32";

interface GitHubReleaseAsset {
  id: number;
  name: string;
  content_type: string;
  size: number;
  url: string;
}

interface GitHubRelease {
  tag_name: string;
  assets: GitHubReleaseAsset[];
}

interface LatestDesktopMetadataAsset {
  name: string;
  url: string;
}

export class DesktopUpdaterError extends Error {
  public readonly status: number;

  public constructor(message: string, status: number) {
    super(message);
    this.name = "DesktopUpdaterError";
    this.status = status;
  }
}

const getDesktopUpdaterConfig = () => {
  const token = process.env.DESKTOP_UPDATER_GITHUB_TOKEN?.trim();
  const owner = process.env.DESKTOP_UPDATER_REPO_OWNER?.trim();
  const repo = process.env.DESKTOP_UPDATER_REPO_NAME?.trim();

  if (!token || !owner || !repo) {
    throw new DesktopUpdaterError(
      "Desktop updater configuration is incomplete.",
      500,
    );
  }

  return { token, owner, repo };
};

const getGitHubHeaders = (accept: string) => {
  const { token } = getDesktopUpdaterConfig();

  return {
    Accept: accept,
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  };
};

const getGitHubErrorMessage = async (response: Response) => {
  const responseText = await response.text();

  if (!responseText) {
    return `${response.status} ${response.statusText}`;
  }

  return `${response.status} ${response.statusText}: ${responseText}`;
};

const getLatestReleaseUrl = () => {
  const { owner, repo } = getDesktopUpdaterConfig();

  return `${GITHUB_API_BASE}/repos/${owner}/${repo}/releases/latest`;
};

const normalizeReleaseVersion = (tagName: string) => {
  return tagName
    .replace(/^desktop-/i, "")
    .replace(/^v/i, "")
    .trim();
};

const extractVersionFromYaml = (yamlText: string) => {
  const versionMatch = yamlText.match(
    /^version:\s*["']?([^"'\r\n]+)["']?\s*$/m,
  );

  return versionMatch?.[1]?.trim() ?? null;
};

const getNoStoreHeaders = () => {
  return {
    "Cache-Control": NO_STORE_CACHE_CONTROL,
  };
};

const getAssetResponseHeaders = (
  responseHeaders: Headers,
  fileName: string,
) => {
  const headers = new Headers(getNoStoreHeaders());

  const passthroughHeaders = [
    "accept-ranges",
    "content-disposition",
    "content-length",
    "content-range",
    "content-type",
    "etag",
    "last-modified",
  ] as const;

  for (const headerName of passthroughHeaders) {
    const headerValue = responseHeaders.get(headerName);
    if (headerValue) {
      headers.set(headerName, headerValue);
    }
  }

  if (!headers.has("content-type") && fileName.endsWith(".yml")) {
    headers.set("content-type", "text/yaml; charset=utf-8");
  }

  return headers;
};

const getAssetRequestHeaders = (requestHeaders: Headers) => {
  const headers = new Headers(getGitHubHeaders("application/octet-stream"));

  const passthroughHeaders = [
    "if-match",
    "if-none-match",
    "if-modified-since",
    "if-unmodified-since",
    "range",
  ] as const;

  for (const headerName of passthroughHeaders) {
    const headerValue = requestHeaders.get(headerName);
    if (headerValue) {
      headers.set(headerName, headerValue);
    }
  }

  return headers;
};

const getMetadataAssetNamesForPlatform = (platform: DesktopPlatform | null) => {
  switch (platform) {
    case "darwin":
      return ["latest-mac.yml", "latest.yml"];
    case "linux":
      return ["latest-linux.yml", "latest.yml"];
    case "win32":
      return ["latest.yml"];
    default:
      return ["latest.yml", "latest-mac.yml", "latest-linux.yml"];
  }
};

const getLatestDesktopMetadataAsset = (
  release: GitHubRelease,
  platform: DesktopPlatform | null,
): LatestDesktopMetadataAsset | null => {
  const preferredAssetNames = getMetadataAssetNamesForPlatform(platform);
  const latestYmlAsset =
    preferredAssetNames
      .map((assetName) =>
        release.assets.find(
          (asset) => asset.name.toLowerCase() === assetName,
        ),
      )
      .find((asset) => asset !== undefined) ??
    release.assets.find((asset) => asset.name.toLowerCase().endsWith(".yml"));

  if (!latestYmlAsset) {
    return null;
  }

  return {
    name: latestYmlAsset.name,
    url: latestYmlAsset.url,
  };
};

const normalizeReleaseAssetLookupName = (assetName: string) => {
  return assetName.toLowerCase().replace(/[^a-z0-9]/gu, "");
};

const normalizeDesktopPlatform = (
  platform: string | null | undefined,
): DesktopPlatform | null => {
  if (!platform) {
    return null;
  }

  switch (platform.toLowerCase()) {
    case "darwin":
    case "mac":
    case "macos":
    case "osx":
      return "darwin";
    case "linux":
      return "linux";
    case "win":
    case "windows":
    case "win32":
      return "win32";
    default:
      return null;
  }
};

export const resolveDesktopPlatformFromUserAgent = (
  userAgent: string | null,
): DesktopPlatform | null => {
  if (!userAgent) {
    return null;
  }

  const normalizedUserAgent = userAgent.toLowerCase();

  if (normalizedUserAgent.includes("mac os x")) {
    return "darwin";
  }

  if (normalizedUserAgent.includes("windows")) {
    return "win32";
  }

  if (normalizedUserAgent.includes("linux")) {
    return "linux";
  }

  return null;
};

const isInstallerAssetForPlatform = (
  assetName: string,
  platform: DesktopPlatform,
) => {
  const normalizedAssetName = assetName.toLowerCase();

  if (
    normalizedAssetName.endsWith(".blockmap") ||
    normalizedAssetName.endsWith(".yml") ||
    normalizedAssetName.endsWith(".yaml")
  ) {
    return false;
  }

  switch (platform) {
    case "darwin":
      return (
        normalizedAssetName.endsWith(".dmg") ||
        normalizedAssetName.endsWith(".pkg") ||
        normalizedAssetName.endsWith(".zip")
      );
    case "linux":
      return (
        normalizedAssetName.endsWith(".appimage") ||
        normalizedAssetName.endsWith(".deb") ||
        normalizedAssetName.endsWith(".rpm")
      );
    case "win32":
      return normalizedAssetName.endsWith(".exe");
  }
};

const findInstallerAsset = (
  release: GitHubRelease,
  platform: DesktopPlatform | null,
) => {
  if (platform) {
    const matchedAsset = release.assets.find((asset) =>
      isInstallerAssetForPlatform(asset.name, platform),
    );
    if (matchedAsset) {
      return matchedAsset;
    }
  }

  const fallbackPlatforms: DesktopPlatform[] = ["win32", "darwin", "linux"];

  for (const fallbackPlatform of fallbackPlatforms) {
    const matchedAsset = release.assets.find((asset) =>
      isInstallerAssetForPlatform(asset.name, fallbackPlatform),
    );
    if (matchedAsset) {
      return matchedAsset;
    }
  }

  return null;
};

export const getLatestDesktopRelease = async (): Promise<GitHubRelease> => {
  const response = await fetch(getLatestReleaseUrl(), {
    cache: "no-store",
    headers: getGitHubHeaders("application/vnd.github+json"),
  });

  if (!response.ok) {
    throw new DesktopUpdaterError(
      `Failed to fetch the latest desktop release: ${await getGitHubErrorMessage(response)}`,
      response.status,
    );
  }

  return (await response.json()) as GitHubRelease;
};

export const getLatestDesktopVersion = async (
  platformHint?: string | null,
): Promise<string> => {
  const release = await getLatestDesktopRelease();
  const metadataAsset = getLatestDesktopMetadataAsset(
    release,
    normalizeDesktopPlatform(platformHint),
  );

  if (!metadataAsset) {
    return normalizeReleaseVersion(release.tag_name);
  }

  try {
    const response = await fetch(metadataAsset.url, {
      cache: "no-store",
      headers: getGitHubHeaders("application/octet-stream"),
      redirect: "follow",
    });

    if (!response.ok) {
      return normalizeReleaseVersion(release.tag_name);
    }

    const latestMetadata = await response.text();
    return (
      extractVersionFromYaml(latestMetadata) ??
      normalizeReleaseVersion(release.tag_name)
    );
  } catch (error) {
    console.error(
      `Failed to parse the latest desktop metadata asset "${metadataAsset.name}":`,
      error,
    );

    return normalizeReleaseVersion(release.tag_name);
  }
};

export const getLatestDesktopReleaseAsset = async (
  fileName: string,
): Promise<GitHubReleaseAsset> => {
  const release = await getLatestDesktopRelease();
  const asset =
    release.assets.find((releaseAsset) => releaseAsset.name === fileName) ??
    release.assets.find(
      (releaseAsset) =>
        normalizeReleaseAssetLookupName(releaseAsset.name) ===
        normalizeReleaseAssetLookupName(fileName),
    );

  if (!asset) {
    throw new DesktopUpdaterError(
      `Desktop release asset "${fileName}" was not found.`,
      404,
    );
  }

  return asset;
};

export const getLatestDesktopInstallerFileName = async (
  platformHint?: string | null,
) => {
  const release = await getLatestDesktopRelease();
  const normalizedPlatform = normalizeDesktopPlatform(platformHint);
  const installerAsset = findInstallerAsset(release, normalizedPlatform);

  if (!installerAsset) {
    throw new DesktopUpdaterError(
      "No desktop installer asset was found in the latest release.",
      404,
    );
  }

  return installerAsset.name;
};

export const fetchLatestDesktopReleaseAsset = async (
  fileName: string,
  requestHeaders: Headers,
) => {
  const asset = await getLatestDesktopReleaseAsset(fileName);

  const response = await fetch(asset.url, {
    cache: "no-store",
    headers: getAssetRequestHeaders(requestHeaders),
    redirect: "follow",
  });

  if (!response.ok && response.status !== 304) {
    throw new DesktopUpdaterError(
      `Failed to fetch the desktop release asset "${fileName}": ${await getGitHubErrorMessage(response)}`,
      response.status,
    );
  }

  return new Response(response.body, {
    headers: getAssetResponseHeaders(response.headers, fileName),
    status: response.status,
    statusText: response.statusText,
  });
};
