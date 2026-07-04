import "server-only";

const requiredFakturowniaReportEnvironmentVariables = [
  "FAKTUROWNIA_API_KEY",
  "FAKTUROWNIA_SUBDOMAIN",
  "NO_REPLY_EMAIL",
  "REPORT_EMAIL",
  "RESEND_API_KEY",
] as const;

export function getMissingRequiredFakturowniaReportEnvironmentVariable():
  | string
  | undefined {
  const missingVariable = requiredFakturowniaReportEnvironmentVariables.find(
    (name) => !process.env[name]?.trim(),
  );

  if (missingVariable) {
    return missingVariable;
  }

  if (
    !process.env.ADMIN_URL?.trim() &&
    !process.env.NEXT_PUBLIC_ADMIN_URL?.trim()
  ) {
    return "ADMIN_URL or NEXT_PUBLIC_ADMIN_URL";
  }
}
