import type { Channel, Member, NestedMember } from "@konfi/types";

const EMAIL_ADDRESS_PATTERN =
  /^(?:"?([^"<]*)"?\s*)?<([^<>@\s]+@[^<>@\s]+\.[^<>@\s]+)>$/;
const LOOSE_EMAIL_PATTERN = /([^<>\s,;]+@[^<>\s,;]+\.[^<>\s,;]+)/;
const DIACRITIC_PATTERN = /[\u0300-\u036f]/g;
const INBOUND_ALIAS_LOCAL_PART = "konfi";

export interface ParsedEmailAddress {
  email: string;
  name: string;
  raw: string;
}

export interface ForwardingAdminRecipient {
  email: string;
  member: NestedMember;
}

export interface ChannelForwardingRecipientMatch {
  channel: Channel;
  email: string;
}

export function normalizeEmailAddress(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function normalizeIdentityText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(DIACRITIC_PATTERN, "")
    .toLowerCase()
    .replace(/[^a-z0-9@._+-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function parseEmailAddress(value: string): ParsedEmailAddress {
  const raw = value.trim();
  const mailboxMatch = raw.match(EMAIL_ADDRESS_PATTERN);

  if (mailboxMatch) {
    return {
      email: normalizeEmailAddress(mailboxMatch[2]),
      name: mailboxMatch[1]?.trim().replace(/^"|"$/g, "") ?? "",
      raw,
    };
  }

  const looseMatch = raw.match(LOOSE_EMAIL_PATTERN);
  const email = normalizeEmailAddress(looseMatch?.[1] ?? raw);

  return {
    email,
    name:
      email === normalizeEmailAddress(raw) ? "" : raw.replace(email, "").trim(),
    raw,
  };
}

export function parseEmailAddressList(values: readonly string[]) {
  return values
    .map((value) => parseEmailAddress(value))
    .filter((address) => address.email.includes("@"));
}

function toNestedMember(member: Member): NestedMember {
  return {
    id: member.id,
    name: member.name,
  };
}

function splitEmailValues(values: string[] | string | undefined) {
  if (Array.isArray(values)) {
    return values;
  }

  return (values ?? "")
    .split(/[,;\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeChannelAliasToken(value: string | null | undefined) {
  return normalizeIdentityText(value).replace(/[^a-z0-9]+/g, "");
}

function getChannelAliasTokens(channel: Pick<Channel, "id" | "name">) {
  return [
    normalizeChannelAliasToken(channel.id),
    normalizeChannelAliasToken(channel.name),
  ].filter(Boolean);
}

function getInboundRecipientAliasToken(email: string) {
  const [localPart] = email.split("@");
  const [mailbox, aliasToken] = localPart.split("+");

  if (
    normalizeEmailAddress(mailbox) !== INBOUND_ALIAS_LOCAL_PART ||
    !aliasToken
  ) {
    return null;
  }

  const normalizedAliasToken = normalizeChannelAliasToken(aliasToken);
  return normalizedAliasToken.length > 0 ? normalizedAliasToken : null;
}

export function getInboundRecipientAliasTokens(recipients: readonly string[]) {
  return parseEmailAddressList(recipients)
    .map((address) => getInboundRecipientAliasToken(address.email))
    .filter((aliasToken): aliasToken is string => aliasToken !== null);
}

export function getChannelNotificationEmails(
  channel: Pick<Channel, "notifications">,
) {
  return parseEmailAddressList([
    ...splitEmailValues(channel.notifications?.email),
    ...splitEmailValues(channel.notifications?.emails),
  ]).map((address) => address.email);
}

export function resolveChannelForwardingRecipientMatch({
  channels,
  recipients,
}: {
  channels: readonly Channel[];
  recipients: readonly string[];
}): ChannelForwardingRecipientMatch | null {
  const recipientEmails = new Set(
    parseEmailAddressList(recipients).map((address) => address.email),
  );
  const matches = channels
    .toSorted((left, right) => left.id.localeCompare(right.id))
    .flatMap((channel) =>
      getChannelNotificationEmails(channel)
        .filter((email) => recipientEmails.has(email))
        .map((email) => ({ channel, email })),
    );
  const matchesByChannelId = new Map(
    matches.map((match) => [match.channel.id, match]),
  );

  return matchesByChannelId.size === 1
    ? Array.from(matchesByChannelId.values())[0]
    : null;
}

export function resolveChannelForwardingAliasRecipientMatch({
  channels,
  recipients,
}: {
  channels: readonly Channel[];
  recipients: readonly string[];
}): ChannelForwardingRecipientMatch | null {
  const recipientAliases = parseEmailAddressList(recipients)
    .map((address) => ({
      aliasToken: getInboundRecipientAliasToken(address.email),
      email: address.email,
    }))
    .filter(
      (address): address is { aliasToken: string; email: string } =>
        address.aliasToken !== null,
    );

  const matches = channels
    .toSorted((left, right) => left.id.localeCompare(right.id))
    .flatMap((channel) => {
      const channelAliasTokens = new Set(getChannelAliasTokens(channel));
      return recipientAliases
        .filter((address) => channelAliasTokens.has(address.aliasToken))
        .map((address) => ({ channel, email: address.email }));
    });
  const matchesByChannelId = new Map(
    matches.map((match) => [match.channel.id, match]),
  );

  return matchesByChannelId.size === 1
    ? Array.from(matchesByChannelId.values())[0]
    : null;
}

export function resolveChannelForwardingSenderMatch({
  allowedChannelIds,
  channels,
  sender,
}: {
  allowedChannelIds?: readonly string[];
  channels: readonly Channel[];
  sender: string;
}): ChannelForwardingRecipientMatch | null {
  const allowedChannelIdSet =
    allowedChannelIds && allowedChannelIds.length > 0
      ? new Set(allowedChannelIds)
      : null;

  return resolveChannelForwardingRecipientMatch({
    channels: allowedChannelIdSet
      ? channels.filter((channel) => allowedChannelIdSet.has(channel.id))
      : channels,
    recipients: [sender],
  });
}

export function resolveInboundEmailChannel({
  channelId,
  channels,
  memberChannelIds = [],
  recipients = [],
  sender,
}: {
  channelId?: string;
  channels: readonly Channel[];
  memberChannelIds?: readonly string[];
  recipients?: readonly string[];
  sender?: string;
}): Channel | null {
  const memberChannels = channels.filter((candidate) =>
    memberChannelIds.includes(candidate.id),
  );
  const senderChannel =
    memberChannels.length === 1
      ? memberChannels[0]
      : memberChannelIds.length === 0 && channels.length === 1
        ? channels[0]
        : null;
  const recipientChannel = resolveChannelForwardingRecipientMatch({
    channels,
    recipients,
  })?.channel;
  const aliasRecipientChannel = resolveChannelForwardingAliasRecipientMatch({
    channels,
    recipients,
  })?.channel;
  const senderNotificationChannel = sender
    ? resolveChannelForwardingSenderMatch({
        allowedChannelIds: memberChannelIds,
        channels,
        sender,
      })?.channel
    : null;

  return typeof channelId === "string" && channelId.trim().length > 0
    ? (channels.find((candidate) => candidate.id === channelId) ?? null)
    : (aliasRecipientChannel ??
        recipientChannel ??
        senderNotificationChannel ??
        senderChannel);
}

export function resolveChannelForwardingAdminRecipient({
  channel,
  members,
  recipients,
}: {
  channel: Pick<Channel, "notifications">;
  members: readonly Member[];
  recipients: readonly string[];
}): ForwardingAdminRecipient | null {
  const recipientEmails = new Set(
    parseEmailAddressList(recipients).map((address) => address.email),
  );
  const matchedChannelEmail = getChannelNotificationEmails(channel).find(
    (email) => recipientEmails.has(email),
  );

  if (!matchedChannelEmail) {
    return null;
  }

  const matchedMember = members.find(
    (member) => normalizeEmailAddress(member.email) === matchedChannelEmail,
  );

  return {
    email: matchedChannelEmail,
    member: matchedMember
      ? toNestedMember(matchedMember)
      : {
          id: "inbound-email-agent",
          name: "Inbound email agent",
        },
  };
}

export function resolveInboundForwardingAdmin({
  channel,
  members,
  recipients,
  sender,
}: {
  channel: Pick<Channel, "notifications"> | null;
  members: readonly Member[];
  recipients: readonly string[];
  sender: string;
}): ForwardingAdminRecipient | null {
  return (
    resolveAdminForwardingSender({
      members,
      sender,
    }) ??
    (channel
      ? resolveChannelForwardingAdminRecipient({
          channel,
          members,
          recipients: [sender, ...recipients],
        })
      : null)
  );
}

export function resolveAdminForwardingSender({
  members,
  sender,
}: {
  members: readonly Member[];
  sender: string;
}): ForwardingAdminRecipient | null {
  const senderEmail = parseEmailAddress(sender).email;
  const matchedMember = members.find(
    (member) => normalizeEmailAddress(member.email) === senderEmail,
  );

  if (!matchedMember?.email) {
    return null;
  }

  return {
    email: normalizeEmailAddress(matchedMember.email),
    member: toNestedMember(matchedMember),
  };
}
