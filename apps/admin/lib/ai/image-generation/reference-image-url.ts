import "server-only";

const FIREBASE_STORAGE_HOSTNAME = "firebasestorage.googleapis.com";

function parseCsvLower(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function assertAllowedReferenceImageUrl(
  referenceImageUrl: string,
  params: { bucketName: string },
): void {
  let url: URL;
  try {
    url = new URL(referenceImageUrl);
  } catch {
    throw new Error("Invalid reference image URL.");
  }

  // Only allow https to avoid SSRF via plain http and to match Firebase download URLs.
  if (url.protocol !== "https:") {
    throw new Error("Reference image URL must use https.");
  }

  // Avoid URLs like https://user:pass@host/...
  if (url.username || url.password) {
    throw new Error("Reference image URL must not contain credentials.");
  }

  const hostname = url.hostname.toLowerCase();
  const bucketName = params.bucketName;

  // Default allowlist: ONLY Firebase Storage download URLs for our configured bucket.
  const firebasePathPrefix = `/v0/b/${bucketName}/o/`;
  const isFirebaseStorageDownloadUrl =
    hostname === FIREBASE_STORAGE_HOSTNAME &&
    url.pathname.startsWith(firebasePathPrefix);

  if (isFirebaseStorageDownloadUrl) {
    return;
  }

  // Optional allowlist: additional trusted hostnames.
  // Configure as comma-separated hostnames in AI_REFERENCE_IMAGE_ALLOWED_HOSTS.
  const allowedHosts = new Set<string>(
    parseCsvLower(process.env.AI_REFERENCE_IMAGE_ALLOWED_HOSTS),
  );
  if (allowedHosts.has(hostname)) {
    return;
  }

  throw new Error(
    `Reference image URL host is not allowed (${url.hostname}). ` +
      "Upload the image to the Reference Image Library (Firebase Storage) " +
      "or configure AI_REFERENCE_IMAGE_ALLOWED_HOSTS to allow additional domains.",
  );
}
