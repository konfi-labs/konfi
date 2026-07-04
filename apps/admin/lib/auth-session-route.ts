export interface AdminSessionRouteInput {
  currentPath: string;
  hasToken: boolean;
  pathname: string;
  safeRedirect: string | null;
}

export interface AdminSessionRouteResult {
  route: string;
  usedLoginRedirect: boolean;
}

export function resolveAdminSessionRoute({
  currentPath,
  hasToken,
  pathname,
  safeRedirect,
}: AdminSessionRouteInput): AdminSessionRouteResult {
  const isLoginPath = pathname.includes("/auth/login");
  const usedLoginRedirect = Boolean(safeRedirect) && isLoginPath;

  if (usedLoginRedirect && safeRedirect) {
    return {
      route: safeRedirect,
      usedLoginRedirect,
    };
  }

  if (hasToken && isLoginPath) {
    return {
      route: "/",
      usedLoginRedirect,
    };
  }

  return {
    route: currentPath,
    usedLoginRedirect,
  };
}
