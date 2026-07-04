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

function getStackFrames(event: SentryClientEventLike) {
  return (event.exception?.values ?? []).flatMap(
    (value) => value.stacktrace?.frames ?? [],
  );
}

function hasFirstPartyStackFrame(event: SentryClientEventLike) {
  return getStackFrames(event).some((frame) => {
    const frameText = [frame.absPath, frame.filename, frame.module]
      .filter((value): value is string => typeof value === "string")
      .join("\n");

    return (
      frameText.length > 0 &&
      !/node_modules|next\/dist|next\\dist|react-server-dom|@sentry|webpack\/bootstrap/i.test(
        frameText,
      )
    );
  });
}

function includesFirebaseClientContext(text: string) {
  return /firebase|firestore|webchannel|google\.firestore|identitytoolkit|securetoken/i.test(
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
    /failed to update a serviceworker/i.test(text) &&
    /\/sw\.js/i.test(text) &&
    /bad http response code \(?(?:401|403)\)?/i.test(text)
  ) {
    return true;
  }

  if (
    /error\s+connection closed\.?/i.test(text) &&
    /react-server-dom-(?:turbopack|webpack)-client\.browser/i.test(text) &&
    !hasFirstPartyStackFrame(event)
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
    includesFirebaseClientContext(text)
  ) {
    return true;
  }

  return false;
}
