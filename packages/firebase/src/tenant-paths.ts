import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { requireTenantContextTenantId } from "./tenant-context";

function normalizePathSegment(value: string | number, name: string): string {
  const segment = String(value)
    .trim()
    .replace(/^\/+|\/+$/g, "");

  if (!segment || segment === "." || segment === "..") {
    throw new Error(`Missing ${name} for tenant-scoped path.`);
  }

  if (segment.includes("/")) {
    throw new Error(`${name} must be a single path segment.`);
  }

  return segment;
}

function normalizePathFragment(value: string | number, name: string): string {
  const fragment = String(value)
    .trim()
    .replace(/^\/+|\/+$/g, "");

  if (
    !fragment ||
    fragment.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`Missing ${name} for tenant-scoped path.`);
  }

  return fragment;
}

function joinSegments(
  ...segments: Array<{ name: string; value: string | number }>
): string {
  return segments
    .map((segment) => normalizePathSegment(segment.value, segment.name))
    .join("/");
}

function joinStorageFragments(
  ...segments: Array<{ name: string; value: string | number }>
): string {
  return segments
    .map((segment) => normalizePathFragment(segment.value, segment.name))
    .join("/");
}

function requireTenantForPath(context: TenantContext, operationName: string) {
  return requireTenantContextTenantId(context, operationName);
}

function tenantStoragePrefix(context: TenantContext): string | undefined {
  if (context.deploymentMode !== "saas") {
    return;
  }

  return joinSegments(
    { name: "collection", value: "tenants" },
    {
      name: "tenantId",
      value: requireTenantForPath(context, "Storage path"),
    },
  );
}

export const tenantFirestorePaths = {
  customersCollection: (context: TenantContext) => {
    requireTenantForPath(context, "customers collection");
    return "customers";
  },
  customerDoc: (context: TenantContext, uid: string) =>
    joinSegments(
      {
        name: "collection",
        value: tenantFirestorePaths.customersCollection(context),
      },
      { name: "uid", value: uid },
    ),
  cartsCollection: (context: TenantContext) => {
    requireTenantForPath(context, "carts collection");
    return "carts";
  },
  cartDoc: (context: TenantContext, uid: string) =>
    joinSegments(
      {
        name: "collection",
        value: tenantFirestorePaths.cartsCollection(context),
      },
      { name: "uid", value: uid },
    ),
  cartItemsCollection: (context: TenantContext, uid: string) =>
    `${tenantFirestorePaths.cartDoc(context, uid)}/items`,
  cartPreflightCollection: (context: TenantContext, uid: string) =>
    `${tenantFirestorePaths.cartDoc(context, uid)}/preflight`,
  channelsCollection: (context: TenantContext) => {
    requireTenantForPath(context, "channels collection");
    return "channels";
  },
  channelDoc: (context: TenantContext, channelId: string) =>
    joinSegments(
      {
        name: "collection",
        value: tenantFirestorePaths.channelsCollection(context),
      },
      { name: "channelId", value: channelId },
    ),
  channelCollection: (
    context: TenantContext,
    channelId: string,
    collectionId: string,
  ) =>
    `${tenantFirestorePaths.channelDoc(context, channelId)}/${normalizePathSegment(
      collectionId,
      "collectionId",
    )}`,
  channelDocument: (
    context: TenantContext,
    channelId: string,
    collectionId: string,
    documentId: string,
  ) =>
    `${tenantFirestorePaths.channelCollection(
      context,
      channelId,
      collectionId,
    )}/${normalizePathSegment(documentId, "documentId")}`,
  productDoc: (context: TenantContext, channelId: string, productId: string) =>
    `${tenantFirestorePaths.channelCollection(
      context,
      channelId,
      "products",
    )}/${normalizePathSegment(productId, "productId")}`,
  orderDoc: (context: TenantContext, channelId: string, orderId: string) =>
    `${tenantFirestorePaths.channelCollection(
      context,
      channelId,
      "orders",
    )}/${normalizePathSegment(orderId, "orderId")}`,
  settingsDoc: (
    context: TenantContext,
    channelId: string,
    settingsId: string,
  ) =>
    `${tenantFirestorePaths.channelCollection(
      context,
      channelId,
      "settings",
    )}/${normalizePathSegment(settingsId, "settingsId")}`,
};

export const tenantStoragePaths = {
  withTenantPrefix: (context: TenantContext, legacyPath: string): string => {
    const normalizedLegacyPath = normalizePathFragment(
      legacyPath,
      "storagePath",
    );
    const prefix = tenantStoragePrefix(context);

    return prefix ? `${prefix}/${normalizedLegacyPath}` : normalizedLegacyPath;
  },
  cartItemFolder: (
    context: TenantContext,
    uid: string,
    itemId: string | number,
  ) =>
    tenantStoragePaths.withTenantPrefix(
      context,
      joinStorageFragments(
        { name: "collection", value: "carts" },
        { name: "uid", value: uid },
        { name: "collection", value: "items" },
        { name: "itemId", value: itemId },
      ),
    ),
  cartItemFile: (
    context: TenantContext,
    uid: string,
    itemId: string | number,
    filename: string,
  ) =>
    joinStorageFragments(
      {
        name: "folder",
        value: tenantStoragePaths.cartItemFolder(context, uid, itemId),
      },
      { name: "filename", value: filename },
    ),
  cartItemThumbnailFolder: (
    context: TenantContext,
    uid: string,
    itemId: string | number,
  ) =>
    tenantStoragePaths.withTenantPrefix(
      context,
      joinStorageFragments(
        { name: "collection", value: "thumb_carts" },
        { name: "uid", value: uid },
        { name: "collection", value: "items" },
        { name: "itemId", value: itemId },
      ),
    ),
  cartItemThumbnailFile: (
    context: TenantContext,
    uid: string,
    itemId: string | number,
    filename: string,
  ) =>
    joinStorageFragments(
      {
        name: "folder",
        value: tenantStoragePaths.cartItemThumbnailFolder(context, uid, itemId),
      },
      { name: "filename", value: filename },
    ),
  orderFolder: (
    context: TenantContext,
    channelId: string,
    customerId: string,
    orderId: string,
  ) =>
    context.deploymentMode === "saas"
      ? tenantStoragePaths.withTenantPrefix(
          context,
          joinStorageFragments(
            { name: "collection", value: "channels" },
            { name: "channelId", value: channelId },
            { name: "collection", value: "orders" },
            { name: "customerId", value: customerId },
            { name: "orderId", value: orderId },
          ),
        )
      : joinStorageFragments(
          { name: "collection", value: "orders" },
          { name: "customerId", value: customerId },
          { name: "orderId", value: orderId },
        ),
  orderItemFolder: (
    context: TenantContext,
    channelId: string,
    customerId: string,
    orderId: string,
    itemId: string | number,
  ) =>
    joinStorageFragments(
      {
        name: "folder",
        value: tenantStoragePaths.orderFolder(
          context,
          channelId,
          customerId,
          orderId,
        ),
      },
      { name: "collection", value: "items" },
      { name: "itemId", value: itemId },
    ),
  orderThumbnailFolder: (
    context: TenantContext,
    channelId: string,
    customerId: string,
    orderId: string,
  ) =>
    context.deploymentMode === "saas"
      ? tenantStoragePaths.withTenantPrefix(
          context,
          joinStorageFragments(
            { name: "collection", value: "channels" },
            { name: "channelId", value: channelId },
            { name: "collection", value: "thumb_orders" },
            { name: "customerId", value: customerId },
            { name: "orderId", value: orderId },
          ),
        )
      : joinStorageFragments(
          { name: "collection", value: "thumb_orders" },
          { name: "customerId", value: customerId },
          { name: "orderId", value: orderId },
        ),
  orderAttachmentFolder: (
    context: TenantContext,
    channelId: string,
    customerId: string,
    orderId: string,
  ) =>
    context.deploymentMode === "saas"
      ? tenantStoragePaths.withTenantPrefix(
          context,
          joinStorageFragments(
            { name: "collection", value: "channels" },
            { name: "channelId", value: channelId },
            { name: "collection", value: "attachments" },
            { name: "customerId", value: customerId },
            { name: "orderId", value: orderId },
          ),
        )
      : joinStorageFragments(
          { name: "collection", value: "attachments" },
          { name: "customerId", value: customerId },
          { name: "orderId", value: orderId },
        ),
  orderAttachmentFile: (
    context: TenantContext,
    channelId: string,
    customerId: string,
    orderId: string,
    filename: string,
  ) =>
    joinStorageFragments(
      {
        name: "folder",
        value: tenantStoragePaths.orderAttachmentFolder(
          context,
          channelId,
          customerId,
          orderId,
        ),
      },
      { name: "filename", value: filename },
    ),
  orderItemFile: (
    context: TenantContext,
    channelId: string,
    customerId: string,
    orderId: string,
    itemId: string | number,
    filename: string,
  ) =>
    joinStorageFragments(
      {
        name: "folder",
        value: tenantStoragePaths.orderItemFolder(
          context,
          channelId,
          customerId,
          orderId,
          itemId,
        ),
      },
      { name: "filename", value: filename },
    ),
  orderItemThumbnailFolder: (
    context: TenantContext,
    channelId: string,
    customerId: string,
    orderId: string,
    itemId: string | number,
  ) =>
    joinStorageFragments(
      {
        name: "folder",
        value: tenantStoragePaths.orderThumbnailFolder(
          context,
          channelId,
          customerId,
          orderId,
        ),
      },
      { name: "collection", value: "items" },
      { name: "itemId", value: itemId },
    ),
  orderItemThumbnailFile: (
    context: TenantContext,
    channelId: string,
    customerId: string,
    orderId: string,
    itemId: string | number,
    filename: string,
  ) =>
    joinStorageFragments(
      {
        name: "folder",
        value: tenantStoragePaths.orderItemThumbnailFolder(
          context,
          channelId,
          customerId,
          orderId,
          itemId,
        ),
      },
      { name: "filename", value: filename },
    ),
  socialPostMediaFolder: (context: TenantContext, postId: string) =>
    tenantStoragePaths.withTenantPrefix(
      context,
      joinStorageFragments(
        { name: "collection", value: "media" },
        { name: "collection", value: "socialPosts" },
        { name: "postId", value: postId },
      ),
    ),
  socialPostMediaFile: (
    context: TenantContext,
    postId: string,
    filename: string,
  ) =>
    joinStorageFragments(
      {
        name: "folder",
        value: tenantStoragePaths.socialPostMediaFolder(context, postId),
      },
      { name: "filename", value: filename },
    ),
  productMediaFolder: (
    context: TenantContext,
    channelId: string,
    productId: string,
  ) =>
    tenantStoragePaths.withTenantPrefix(
      context,
      joinStorageFragments(
        { name: "collection", value: "images" },
        { name: "collection", value: "channels" },
        { name: "channelId", value: channelId },
        { name: "collection", value: "products" },
        { name: "productId", value: productId },
      ),
    ),
  productMediaFile: (
    context: TenantContext,
    channelId: string,
    productId: string,
    filename: string,
  ) =>
    joinStorageFragments(
      {
        name: "folder",
        value: tenantStoragePaths.productMediaFolder(
          context,
          channelId,
          productId,
        ),
      },
      { name: "filename", value: filename },
    ),
  generatedAsset: (context: TenantContext, legacyPath: string) =>
    tenantStoragePaths.withTenantPrefix(context, legacyPath),
};
