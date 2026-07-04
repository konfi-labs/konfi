const VERCEL_DEPLOYMENT_HOST_PATTERN = /(?:^|\.)vercel\.app$/i;

type AdminServiceWorkerRegistrationPolicyInput = {
  enableOverride?: string;
  hostname: string;
  nodeEnv?: string;
};

type AdminServiceWorkerCleanupReloadInput = {
  cleanupReloaded: boolean;
  hadController: boolean;
  hadRegistrations: boolean;
};

export const ADMIN_SERVICE_WORKER_CLEANUP_RELOAD_KEY =
  "konfi-admin-sw-cleanup-reloaded";

export function shouldSkipAdminServiceWorkerForHostname(hostname: string) {
  return VERCEL_DEPLOYMENT_HOST_PATTERN.test(hostname);
}

export function shouldRegisterAdminServiceWorker({
  enableOverride,
  hostname,
  nodeEnv,
}: AdminServiceWorkerRegistrationPolicyInput) {
  if (shouldSkipAdminServiceWorkerForHostname(hostname)) {
    return false;
  }

  return nodeEnv === "production" || enableOverride === "true";
}

export function isUnavailableServiceWorkerScriptResponse(response: Response) {
  const isRedirectStatus = response.status >= 300 && response.status < 400;

  return (
    response.type === "opaqueredirect" ||
    isRedirectStatus ||
    response.status === 401 ||
    response.status === 403 ||
    !response.ok
  );
}

export function shouldReloadAfterAdminServiceWorkerCleanup({
  cleanupReloaded,
  hadController,
  hadRegistrations,
}: AdminServiceWorkerCleanupReloadInput) {
  return hadRegistrations && hadController && !cleanupReloaded;
}
