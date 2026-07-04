import type { StoreRuntimeConfig } from "./runtime-config";

const maintenancePathPattern = /^\/[a-z]{2}\/maintenance\/?$/;
const storefrontEditorSessionPathPattern =
  /^\/[a-z]{2}\/storefront-editor\/session\/?$/;

export function isStoreMaintenancePath(pathname: string | null | undefined) {
  return maintenancePathPattern.test(pathname ?? "");
}

export function isStorefrontEditorSessionPath(
  pathname: string | null | undefined,
) {
  return storefrontEditorSessionPathPattern.test(pathname ?? "");
}

export function shouldRedirectToStoreMaintenance({
  hasEditorSession,
  pathname,
  runtimeConfig,
}: {
  hasEditorSession: boolean;
  pathname: string | null | undefined;
  runtimeConfig: StoreRuntimeConfig;
}) {
  if (!pathname) {
    return false;
  }

  return Boolean(
    runtimeConfig.maintenance.enabled &&
    !hasEditorSession &&
    !isStoreMaintenancePath(pathname) &&
    !isStorefrontEditorSessionPath(pathname),
  );
}
