export const toKonfiPreviewUrl = (filePath?: string | null): string => {
  if (!filePath) {
    return "";
  }

  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.startsWith("//")) {
    return "";
  }

  // Match Windows drive letter (C:, c:, C/, c/)
  const driveMatch = normalized.match(/^([a-zA-Z]):?\/(.*)$/);
  if (driveMatch) {
    const [, drive, rest] = driveMatch;
    // Format: konfi-preview://DRIVE/path/to/file.png (drive letter without colon as hostname)
    // Encode the path while preserving slashes
    const encodedRest = rest
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
    return `konfi-preview://${drive.toUpperCase()}/${encodedRest}`;
  }

  // POSIX path
  const pathWithLeadingSlash = normalized.startsWith("/")
    ? normalized
    : `/${normalized}`;
  const encodedPath = pathWithLeadingSlash
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `konfi-preview://localhost${encodedPath}`;
};
