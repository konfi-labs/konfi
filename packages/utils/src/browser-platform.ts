export { isElectron } from "./validators/is-electron";

export const PASSKEY_USERNAME_AUTOCOMPLETE = "username webauthn";

export interface BrowserPlatformCapabilities {
  badging: boolean;
  barcodeDetection: boolean;
  broadcastChannel: boolean;
  clipboardRead: boolean;
  clipboardWrite: boolean;
  credentialManagement: boolean;
  fedCm: boolean;
  fileSystemAccess: boolean;
  originPrivateFileSystem: boolean;
  passkeyAutofill: boolean;
  passkeyPlatformAuthenticator: boolean;
  paymentRequest: boolean;
  push: boolean;
  secureContext: boolean;
  serviceWorker: boolean;
  webAuthn: boolean;
  webAuthnSignals: boolean;
  webLocks: boolean;
  webShare: boolean;
}

export type ClipboardWriteResult =
  | { status: "copied" }
  | { reason: "empty" | "unavailable" | "denied"; status: "failed" };

export type ShareOrCopyResult =
  | { status: "shared" }
  | { status: "copied" }
  | { reason: "empty" | "unavailable" | "denied"; status: "failed" };

export interface SameOriginMessenger<Message> {
  close: () => void;
  post: (message: Message) => void;
  sourceId: string;
  supported: boolean;
  transport: "broadcast-channel" | "storage" | "none";
}

export type BrowserSessionApp = "admin" | "store";

export interface BrowserSessionMessage {
  app: BrowserSessionApp;
  issuedAt: number;
  reason: "manual";
  type: "auth:logout";
}

export interface BrowserSessionSync {
  close: () => void;
  notifyLogout: () => void;
  supported: boolean;
  transport: SameOriginMessenger<BrowserSessionMessage>["transport"];
}

type BrowserLockMode = "exclusive" | "shared";

interface BrowserLockOptions {
  ifAvailable?: boolean;
  mode?: BrowserLockMode;
  signal?: AbortSignal;
  steal?: boolean;
}

interface BrowserLockManager {
  request<T>(name: string, callback: () => T | Promise<T>): Promise<T>;
  request<T>(
    name: string,
    options: BrowserLockOptions,
    callback: (lock: unknown) => T | Promise<T>,
  ): Promise<T>;
}

export type BrowserPlatformNavigator = Navigator & {
  clearAppBadge?: () => Promise<void>;
  locks?: BrowserLockManager;
  setAppBadge?: (contents?: number) => Promise<void>;
  share?: (data: ShareData) => Promise<void>;
  storage?: StorageManager & {
    getDirectory?: () => Promise<unknown>;
  };
};

export type BrowserPlatformWindow = Window &
  typeof globalThis & {
    BarcodeDetector?: unknown;
    BroadcastChannel?: typeof BroadcastChannel;
    IdentityCredential?: unknown;
    PaymentRequest?: unknown;
    PublicKeyCredential?: WebAuthnPublicKeyCredential;
    PushManager?: unknown;
    showDirectoryPicker?: unknown;
    showOpenFilePicker?: unknown;
    showSaveFilePicker?: unknown;
  };

type WebAuthnClientCapabilities = {
  conditionalGet?: boolean;
  passkeyPlatformAuthenticator?: boolean;
  webAuthnSignalAllAcceptedCredentials?: boolean;
  webAuthnSignalCurrentUserDetails?: boolean;
  webAuthnSignalUnknownCredential?: boolean;
};

type WebAuthnPublicKeyCredential = typeof PublicKeyCredential & {
  getClientCapabilities?: () => Promise<WebAuthnClientCapabilities>;
  isConditionalMediationAvailable?: () => Promise<boolean>;
  signalAllAcceptedCredentials?: unknown;
  signalCurrentUserDetails?: unknown;
  signalUnknownCredential?: unknown;
};

type BrowserMessageEnvelope<Message> = {
  message: Message;
  sentAt: number;
  sourceId: string;
};

function getDefaultWindow(): BrowserPlatformWindow | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window as BrowserPlatformWindow;
}

function getNavigator(
  targetWindow?: BrowserPlatformWindow,
): BrowserPlatformNavigator | undefined {
  return targetWindow?.navigator as BrowserPlatformNavigator | undefined;
}

function resolveWindow(
  targetWindow?: BrowserPlatformWindow | null,
): BrowserPlatformWindow | undefined {
  return targetWindow === null
    ? undefined
    : (targetWindow ?? getDefaultWindow());
}

function resolveNavigator(
  targetNavigator?: BrowserPlatformNavigator | null,
): BrowserPlatformNavigator | undefined {
  return targetNavigator === null
    ? undefined
    : (targetNavigator ?? getNavigator(getDefaultWindow()));
}

function createSourceId(targetWindow?: BrowserPlatformWindow) {
  const crypto = targetWindow?.crypto;
  const randomUuid = crypto?.randomUUID;

  if (typeof randomUuid === "function") {
    return randomUuid.call(crypto);
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function hasFunctionProperty<T extends object>(
  target: T | undefined,
  key: keyof T,
) {
  return typeof target?.[key] === "function";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMessageEnvelope<Message>(
  value: unknown,
): value is BrowserMessageEnvelope<Message> {
  return (
    isObject(value) &&
    typeof value.sourceId === "string" &&
    typeof value.sentAt === "number" &&
    "message" in value
  );
}

function readStorageEnvelope<Message>(
  value: string,
): BrowserMessageEnvelope<Message> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return isMessageEnvelope<Message>(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getStorageKey(channelName: string) {
  return `konfi:broadcast:${channelName}`;
}

export async function detectBrowserPlatformCapabilities(
  targetWindow?: BrowserPlatformWindow | null,
): Promise<BrowserPlatformCapabilities> {
  const resolvedWindow = resolveWindow(targetWindow);
  const targetNavigator = getNavigator(resolvedWindow);
  const publicKeyCredential = resolvedWindow?.PublicKeyCredential;
  const credentialCapabilities = publicKeyCredential?.getClientCapabilities
    ? await publicKeyCredential.getClientCapabilities().catch(() => undefined)
    : undefined;
  const conditionalMediationAvailable =
    credentialCapabilities?.conditionalGet ??
    (publicKeyCredential?.isConditionalMediationAvailable
      ? await publicKeyCredential
          .isConditionalMediationAvailable()
          .catch(() => false)
      : false);

  return {
    badging:
      hasFunctionProperty(targetNavigator, "setAppBadge") &&
      hasFunctionProperty(targetNavigator, "clearAppBadge"),
    barcodeDetection: Boolean(resolvedWindow?.BarcodeDetector),
    broadcastChannel: Boolean(resolvedWindow?.BroadcastChannel),
    clipboardRead: hasFunctionProperty(targetNavigator?.clipboard, "readText"),
    clipboardWrite: hasFunctionProperty(
      targetNavigator?.clipboard,
      "writeText",
    ),
    credentialManagement: Boolean(targetNavigator?.credentials),
    fedCm: Boolean(resolvedWindow?.IdentityCredential),
    fileSystemAccess:
      hasFunctionProperty(resolvedWindow, "showOpenFilePicker") ||
      hasFunctionProperty(resolvedWindow, "showSaveFilePicker") ||
      hasFunctionProperty(resolvedWindow, "showDirectoryPicker"),
    originPrivateFileSystem: hasFunctionProperty(
      targetNavigator?.storage,
      "getDirectory",
    ),
    passkeyAutofill: Boolean(conditionalMediationAvailable),
    passkeyPlatformAuthenticator: Boolean(
      credentialCapabilities?.passkeyPlatformAuthenticator,
    ),
    paymentRequest: Boolean(resolvedWindow?.PaymentRequest),
    push: Boolean(resolvedWindow?.PushManager),
    secureContext: Boolean(resolvedWindow?.isSecureContext),
    serviceWorker: Boolean(targetNavigator?.serviceWorker),
    webAuthn: Boolean(publicKeyCredential),
    webAuthnSignals: Boolean(
      publicKeyCredential?.signalAllAcceptedCredentials ||
      publicKeyCredential?.signalCurrentUserDetails ||
      publicKeyCredential?.signalUnknownCredential ||
      credentialCapabilities?.webAuthnSignalAllAcceptedCredentials ||
      credentialCapabilities?.webAuthnSignalCurrentUserDetails ||
      credentialCapabilities?.webAuthnSignalUnknownCredential,
    ),
    webLocks: Boolean(targetNavigator?.locks),
    webShare: hasFunctionProperty(targetNavigator, "share"),
  };
}

export async function copyTextToClipboard(
  text: string,
  targetNavigator?: BrowserPlatformNavigator | null,
): Promise<ClipboardWriteResult> {
  const resolvedNavigator = resolveNavigator(targetNavigator);

  if (!text.trim()) {
    return { reason: "empty", status: "failed" };
  }

  if (!resolvedNavigator?.clipboard?.writeText) {
    return { reason: "unavailable", status: "failed" };
  }

  try {
    await resolvedNavigator.clipboard.writeText(text);
    return { status: "copied" };
  } catch {
    return { reason: "denied", status: "failed" };
  }
}

export async function shareOrCopyText(
  data: ShareData & { fallbackText?: string },
  targetNavigator?: BrowserPlatformNavigator | null,
): Promise<ShareOrCopyResult> {
  const resolvedNavigator = resolveNavigator(targetNavigator);
  const fallbackText = data.fallbackText ?? data.url ?? data.text ?? "";

  if (resolvedNavigator?.share) {
    const shareData: ShareData = {};
    if (data.files !== undefined) {
      shareData.files = data.files;
    }
    if (data.text !== undefined) {
      shareData.text = data.text;
    }
    if (data.title !== undefined) {
      shareData.title = data.title;
    }
    if (data.url !== undefined) {
      shareData.url = data.url;
    }

    try {
      await resolvedNavigator.share(shareData);
      return { status: "shared" };
    } catch {
      // Fall through to clipboard when native share is unavailable or cancelled.
    }
  }

  return copyTextToClipboard(fallbackText, resolvedNavigator);
}

export async function withBrowserLock<T>(
  name: string,
  callback: () => T | Promise<T>,
  options?: BrowserLockOptions,
  targetNavigator?: BrowserPlatformNavigator | null,
): Promise<T> {
  const resolvedNavigator = resolveNavigator(targetNavigator);

  if (!resolvedNavigator?.locks) {
    return callback();
  }

  if (!options) {
    return resolvedNavigator.locks.request(name, callback);
  }

  return resolvedNavigator.locks.request(name, options, () => callback());
}

export async function getOriginPrivateFileSystemDirectory(
  targetNavigator?: BrowserPlatformNavigator | null,
) {
  return resolveNavigator(targetNavigator)?.storage?.getDirectory?.() ?? null;
}

export function createSameOriginMessenger<Message>({
  channelName,
  onMessage,
  targetWindow,
}: {
  channelName: string;
  onMessage: (message: Message) => void;
  targetWindow?: BrowserPlatformWindow | null;
}): SameOriginMessenger<Message> {
  const resolvedWindow = resolveWindow(targetWindow);
  const sourceId = createSourceId(resolvedWindow);
  const storageKey = getStorageKey(channelName);
  let isClosed = false;

  const deliver = (envelope: BrowserMessageEnvelope<Message>) => {
    if (isClosed || envelope.sourceId === sourceId) {
      return;
    }

    onMessage(envelope.message);
  };

  if (!resolvedWindow) {
    return {
      close: () => {
        isClosed = true;
      },
      post: () => {},
      sourceId,
      supported: false,
      transport: "none",
    };
  }

  if (resolvedWindow.BroadcastChannel) {
    const channel = new resolvedWindow.BroadcastChannel(channelName);
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (isMessageEnvelope<Message>(event.data)) {
        deliver(event.data);
      }
    };

    channel.addEventListener("message", handleMessage);

    return {
      close: () => {
        isClosed = true;
        channel.removeEventListener("message", handleMessage);
        channel.close();
      },
      post: (message: Message) => {
        if (!isClosed) {
          channel.postMessage({ message, sentAt: Date.now(), sourceId });
        }
      },
      sourceId,
      supported: true,
      transport: "broadcast-channel",
    };
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== storageKey || !event.newValue) {
      return;
    }

    const envelope = readStorageEnvelope<Message>(event.newValue);
    if (envelope) {
      deliver(envelope);
    }
  };

  resolvedWindow.addEventListener("storage", handleStorage);

  return {
    close: () => {
      isClosed = true;
      resolvedWindow.removeEventListener("storage", handleStorage);
    },
    post: (message: Message) => {
      if (isClosed) {
        return;
      }

      try {
        resolvedWindow.localStorage.setItem(
          storageKey,
          JSON.stringify({ message, sentAt: Date.now(), sourceId }),
        );
        resolvedWindow.localStorage.removeItem(storageKey);
      } catch {
        // Storage events are a best-effort fallback for browsers without BroadcastChannel.
      }
    },
    sourceId,
    supported: true,
    transport: "storage",
  };
}

export function createBrowserSessionSync({
  app,
  onRemoteLogout,
  targetWindow,
}: {
  app: BrowserSessionApp;
  onRemoteLogout: () => void;
  targetWindow?: BrowserPlatformWindow | null;
}): BrowserSessionSync {
  const messenger = createSameOriginMessenger<BrowserSessionMessage>({
    channelName: `konfi:${app}:auth-session`,
    onMessage: (message) => {
      if (message.type === "auth:logout" && message.app === app) {
        onRemoteLogout();
      }
    },
    targetWindow,
  });

  return {
    close: messenger.close,
    notifyLogout: () => {
      messenger.post({
        app,
        issuedAt: Date.now(),
        reason: "manual",
        type: "auth:logout",
      });
    },
    supported: messenger.supported,
    transport: messenger.transport,
  };
}
