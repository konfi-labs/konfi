/**
 * Client-safe utility functions for Microsoft integration
 * These functions don't require any server-side dependencies
 */

/**
 * Extract email message ID from Outlook web link
 * Format: https://outlook.office.com/mail/inbox/id/{messageId}
 * or: https://outlook.office365.com/mail/inbox/id/{messageId}
 */
export function extractEmailIdFromMailLink(mailLink: string): string | null {
  // Handle URL-encoded message IDs
  const decodedLink = decodeURIComponent(mailLink);

  // Pattern matches: /mail/{folder}/id/{messageId} or /mail/id/{messageId}
  const match = decodedLink.match(/\/mail(?:\/[^/]+)?\/id\/([^?&/]+)/);
  return match ? match[1] : null;
}
