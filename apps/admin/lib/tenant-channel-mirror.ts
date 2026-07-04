import type { Channel } from "@konfi/types";
import { toSlug } from "@konfi/utils";

export type ChannelMirrorStatus = "active" | "disabled";

export interface TenantChannelMirrorDocument {
  createdAt?: unknown;
  currency?: string;
  name: string;
  slug: string;
  status: ChannelMirrorStatus;
  storefrontEnabled: boolean;
  tenantId: string;
  updatedAt?: unknown;
}

function normalizeRequiredString(value: string, label: string): string {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    throw new Error(`${label} is required.`);
  }

  return trimmedValue;
}

export function buildTenantChannelMirrorDocument(input: {
  channel: Pick<Channel, "active" | "currency" | "name">;
  storefrontEnabled: boolean;
  tenantId: string;
}): TenantChannelMirrorDocument {
  const name = normalizeRequiredString(input.channel.name, "Channel name");
  const slug = toSlug(name) || toSlug(input.tenantId) || "channel";

  return {
    currency: input.channel.currency,
    name,
    slug,
    status: input.channel.active === false ? "disabled" : "active",
    storefrontEnabled: input.storefrontEnabled,
    tenantId: input.tenantId,
  };
}
