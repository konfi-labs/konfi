import {
  Channel,
  Member,
  NotificationType,
  ChannelNotificationSettings,
  MemberNotificationSettings,
} from "@konfi/types";

/**
 * Parses a string of emails separated by commas, newlines, or semicolons into an array
 */
export function parseEmailString(emailString: string): string[] {
  if (!emailString || typeof emailString !== "string") {
    return [];
  }

  const emails: string[] = [];
  const seenEmails = new Set<string>();

  for (const email of emailString.split(/[,;\n\r]+/)) {
    addUniqueNotificationEmail(emails, seenEmails, email);
  }

  return emails;
}

/**
 * Adds a trimmed email to the recipient list only when it looks valid and has
 * not been seen before. `emails` preserves recipient order while `seenEmails`
 * provides duplicate detection for the current parse/normalization pass.
 */
function addUniqueNotificationEmail(
  emails: string[],
  seenEmails: Set<string>,
  email: string,
) {
  const normalizedEmail = email.trim();

  if (
    normalizedEmail.length > 0 &&
    normalizedEmail.includes("@") &&
    !seenEmails.has(normalizedEmail)
  ) {
    seenEmails.add(normalizedEmail);
    emails.push(normalizedEmail);
  }
}

/**
 * Determines if a notification type is enabled for a member, considering both member and channel settings
 */
export function isNotificationEnabled(
  notificationType: NotificationType,
  member: Member,
  channel: Channel,
): boolean {
  const memberNotificationSettings = member.notifications?.[notificationType];
  const channelNotificationSettings = channel.notifications;

  // If member has explicit setting for this notification type
  if (memberNotificationSettings !== undefined) {
    return memberNotificationSettings.enabled;
  }

  // If channel has settings, check if this type is enabled
  if (channelNotificationSettings) {
    return channelNotificationSettings.enabledTypes.includes(notificationType);
  }

  // Default to enabled if no settings are configured
  return true;
}

/**
 * Gets the appropriate email address for a notification, considering member and channel settings
 */
export function getNotificationEmail(
  notificationType: NotificationType,
  member: Member,
  channel: Channel,
  fallbackEmail?: string,
): string | undefined {
  const memberNotificationSettings = member.notifications?.[notificationType];
  const channelNotificationSettings = channel.notifications;

  // Priority order: member-specific email > member general email > channel email > fallback
  if (memberNotificationSettings?.email) {
    return memberNotificationSettings.email;
  }

  if (member.email) {
    return member.email;
  }

  if (channelNotificationSettings?.email) {
    return channelNotificationSettings.email;
  }

  return fallbackEmail;
}

/**
 * Gets the appropriate email addresses for channel-level notifications (e.g., complaints, notes)
 */
export function getChannelNotificationEmails(
  channel: Channel,
  fallbackEmail?: string,
): string[] {
  const channelNotificationSettings = channel.notifications;
  const allEmails: string[] = [];
  const seenEmails = new Set<string>();

  // Handle multiple emails (can be array or string)
  if (channelNotificationSettings?.emails) {
    if (Array.isArray(channelNotificationSettings.emails)) {
      // If it's already an array, use it
      for (const email of channelNotificationSettings.emails) {
        addUniqueNotificationEmail(allEmails, seenEmails, email);
      }
    } else if (typeof channelNotificationSettings.emails === "string") {
      // If it's a string, parse it
      for (const email of parseEmailString(
        channelNotificationSettings.emails,
      )) {
        addUniqueNotificationEmail(allEmails, seenEmails, email);
      }
    }
  }

  // Add single email if configured and not already included
  if (channelNotificationSettings?.email) {
    addUniqueNotificationEmail(
      allEmails,
      seenEmails,
      channelNotificationSettings.email,
    );
  }

  // Use fallback email as last resort if no other emails found
  if (allEmails.length === 0 && fallbackEmail) {
    addUniqueNotificationEmail(allEmails, seenEmails, fallbackEmail);
  }

  return allEmails;
}

/**
 * Gets the appropriate email address for channel-level notifications (e.g., complaints, notes)
 * @deprecated Use getChannelNotificationEmails instead for multiple email support
 */
export function getChannelNotificationEmail(
  channel: Channel,
  fallbackEmail?: string,
): string | undefined {
  const emails = getChannelNotificationEmails(channel, fallbackEmail);
  return emails.length > 0 ? emails[0] : undefined;
}

/**
 * Checks if a notification type is enabled for a channel
 */
export function isChannelNotificationEnabled(
  notificationType: NotificationType,
  channel: Channel,
): boolean {
  const channelNotificationSettings = channel.notifications;

  if (channelNotificationSettings) {
    return channelNotificationSettings.enabledTypes.includes(notificationType);
  }

  // Default to enabled if no settings are configured
  return true;
}

/**
 * Returns all contact emails for a warehouse, deduplicated.
 */
export function getWarehouseContactEmails(warehouse: {
  contacts?: Array<{ email?: string }>;
}): string[] {
  const emails = (warehouse.contacts || [])
    .map((c) => c.email)
    .filter((e): e is string => typeof e === "string" && e.includes("@"));
  return Array.from(new Set(emails));
}
