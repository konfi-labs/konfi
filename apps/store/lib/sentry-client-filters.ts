type SentryStackFrameLike = {
  absPath?: string;
  filename?: string;
  function?: string;
  module?: string;
};

type SentryExceptionValueLike = {
  stacktrace?: {
    frames?: SentryStackFrameLike[];
  };
  type?: string;
  value?: string;
};

type SentryClientEventLike = {
  exception?: {
    values?: SentryExceptionValueLike[];
  };
  message?: string;
  request?: {
    url?: string;
  };
};

function collectClientEventText(event: SentryClientEventLike) {
  const values = event.exception?.values ?? [];
  const frames = values.flatMap((value) => value.stacktrace?.frames ?? []);

  return [
    event.message,
    event.request?.url,
    ...values.flatMap((value) => [value.type, value.value]),
    ...frames.flatMap((frame) => [
      frame.absPath,
      frame.filename,
      frame.function,
      frame.module,
    ]),
  ]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
}

function hasStackFrames(event: SentryClientEventLike) {
  return (event.exception?.values ?? []).some(
    (value) => (value.stacktrace?.frames?.length ?? 0) > 0,
  );
}

function includesFirebaseClientContext(text: string) {
  return /firebase|firestore|webchannel|google\.firestore|identitytoolkit|securetoken/i.test(
    text,
  );
}

function includesExpectedStoreAbortContext(text: string) {
  return /storefront-assistant|image-generation|\/api\/storefront-assistant|\/api\/image-generation|\/products\/[^/\s]+|\/help\/contact/i.test(
    text,
  );
}

function includesRecaptchaClientContext(text: string) {
  return /app:\/\/\/recaptcha\/releases\/[^/]+\/recaptcha__\w+\.js|google\.com\/recaptcha|gstatic\.com\/recaptcha/i.test(
    text,
  );
}

export function shouldDropNoisySentryClientEvent(event: SentryClientEventLike) {
  const text = collectClientEventText(event);

  if (/auth\/network-request-failed/i.test(text)) {
    return true;
  }

  if (/typeerror\s+load failed/i.test(text) && !hasStackFrames(event)) {
    return true;
  }

  if (
    /server components render.*specific message is omitted.*digest property/i.test(
      text,
    ) &&
    !hasStackFrames(event)
  ) {
    return true;
  }

  if (
    /attempted to assign to readonly property/i.test(text) &&
    /extractFilteredSchemaValuesFromMicroData|microdata/i.test(text)
  ) {
    return true;
  }

  if (
    /object not found matching id:\s*\d+,\s*methodname:\s*update,\s*paramcount:\s*\d+/i.test(
      text,
    )
  ) {
    return true;
  }

  if (
    /indexeddb.*deleted|database.*deleted by request of the user|database connection is closing/i.test(
      text,
    )
  ) {
    return true;
  }

  if (
    /aborterror|operation (?:was )?aborted|signal is aborted|request aborted/i.test(
      text,
    ) &&
    (includesFirebaseClientContext(text) ||
      includesExpectedStoreAbortContext(text))
  ) {
    return true;
  }

  if (
    /recaptcha has already been rendered|pending promise was never set/i.test(
      text,
    ) &&
    /app-check|recaptcha|firebase/i.test(text)
  ) {
    return true;
  }

  if (
    /cannot read properties of undefined/i.test(text) &&
    includesRecaptchaClientContext(text)
  ) {
    return true;
  }

  if (/webgl context creation failed/i.test(text)) {
    return true;
  }

  return false;
}
