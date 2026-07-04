export function formatSenderAddress(from: string | undefined): string {
  const normalizedFrom = from?.trim();

  if (!normalizedFrom) {
    throw new Error("No valid sender provided");
  }

  const senderName = process.env.NEXT_PUBLIC_SHORT_COMPANY_NAME?.trim();

  if (!senderName || normalizedFrom.includes("<")) {
    return normalizedFrom;
  }

  return `${senderName} <${normalizedFrom}>`;
}
