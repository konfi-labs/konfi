export const TENANT_PERMISSION_VERSION = 1 as const;

export const TENANT_PERMISSIONS = [
  "catalog.products.create",
  "catalog.products.update",
  "catalog.attributes.create",
  "catalog.attributes.update",
  "catalog.productTypes.create",
  "catalog.productTypes.update",
  "catalog.categories.create",
  "catalog.categories.update",
  "configuration.settings.manage",
  "configuration.cms.manage",
  "configuration.channels.create",
  "configuration.channels.update",
  "configuration.members.manage",
  "customers.manage",
  "orders.manage",
  "quotes.manage",
  "marketing.social.manage",
] as const;

export type TenantPermission = (typeof TENANT_PERMISSIONS)[number];

export const TENANT_PERMISSION_GROUPS = [
  {
    id: "catalog",
    permissions: [
      "catalog.products.create",
      "catalog.products.update",
      "catalog.attributes.create",
      "catalog.attributes.update",
      "catalog.productTypes.create",
      "catalog.productTypes.update",
      "catalog.categories.create",
      "catalog.categories.update",
    ],
  },
  {
    id: "configuration",
    permissions: [
      "configuration.settings.manage",
      "configuration.cms.manage",
      "configuration.channels.create",
      "configuration.channels.update",
      "configuration.members.manage",
    ],
  },
  {
    id: "operations",
    permissions: ["customers.manage", "orders.manage", "quotes.manage"],
  },
  {
    id: "marketing",
    permissions: ["marketing.social.manage"],
  },
] as const satisfies ReadonlyArray<{
  id: string;
  permissions: readonly TenantPermission[];
}>;

export function isTenantPermission(value: unknown): value is TenantPermission {
  return (
    typeof value === "string" &&
    (TENANT_PERMISSIONS as readonly string[]).includes(value)
  );
}
