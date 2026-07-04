type SentryRequestErrorContextLike = {
  request?: {
    method?: string;
    path?: string;
    url?: string;
  };
  routerKind?: string;
  routerPath?: string;
  routeType?: string;
};

function errorText(error: unknown) {
  if (typeof error === "string") {
    return error;
  }

  if (typeof error !== "object" || error === null) {
    return "";
  }

  return [
    (error as { code?: unknown }).code,
    (error as { digest?: unknown }).digest,
    (error as { message?: unknown }).message,
    (error as { name?: unknown }).name,
    (error as { stack?: unknown }).stack,
  ]
    .filter((value): value is string | number => {
      return typeof value === "string" || typeof value === "number";
    })
    .join("\n");
}

function contextText(context: SentryRequestErrorContextLike | undefined) {
  return [
    context?.request?.method,
    context?.request?.path,
    context?.request?.url,
    context?.routerKind,
    context?.routerPath,
    context?.routeType,
  ]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
}

export function shouldDropNoisySentryServerRequestError(
  error: unknown,
  context?: SentryRequestErrorContextLike,
) {
  const text = `${errorText(error)}\n${contextText(context)}`;

  if (
    /connection closed/i.test(text) &&
    /react-server-dom|\.rsc|router_kind|app router|\/\[lng\]/i.test(text)
  ) {
    return true;
  }

  if (
    /(?:load failed|networkerror|aborterror|operation (?:was )?aborted|request aborted)/i.test(
      text,
    ) &&
    /(?:\.rsc|\/\[lng\]|app router|render)/i.test(text)
  ) {
    return true;
  }

  return false;
}
