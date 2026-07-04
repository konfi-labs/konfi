import { describe, expect, it, vi } from "vitest";
import {
  copyTextToClipboard,
  createSameOriginMessenger,
  detectBrowserPlatformCapabilities,
  shareOrCopyText,
  type BrowserPlatformNavigator,
  type BrowserPlatformWindow,
  withBrowserLock,
} from "../browser-platform";

class TestBroadcastChannel extends EventTarget {
  static channels = new Map<string, Set<TestBroadcastChannel>>();

  readonly name: string;

  constructor(name: string) {
    super();
    this.name = name;
    const channels = TestBroadcastChannel.channels.get(name) ?? new Set();
    channels.add(this);
    TestBroadcastChannel.channels.set(name, channels);
  }

  close() {
    TestBroadcastChannel.channels.get(this.name)?.delete(this);
  }

  postMessage(message: unknown) {
    TestBroadcastChannel.channels.get(this.name)?.forEach((channel) => {
      channel.dispatchEvent(new MessageEvent("message", { data: message }));
    });
  }
}

function createWindowStub(
  overrides: Partial<BrowserPlatformWindow> = {},
): BrowserPlatformWindow {
  return {
    addEventListener: vi.fn(),
    crypto: { randomUUID: vi.fn(() => "source-id") } as unknown as Crypto,
    isSecureContext: true,
    localStorage: {
      removeItem: vi.fn(),
      setItem: vi.fn(),
    } as unknown as Storage,
    navigator: {} as Navigator,
    removeEventListener: vi.fn(),
    ...overrides,
  } as unknown as BrowserPlatformWindow;
}

describe("detectBrowserPlatformCapabilities", () => {
  it("returns false capabilities outside the browser", async () => {
    await expect(detectBrowserPlatformCapabilities(null)).resolves.toEqual({
      badging: false,
      barcodeDetection: false,
      broadcastChannel: false,
      clipboardRead: false,
      clipboardWrite: false,
      credentialManagement: false,
      fedCm: false,
      fileSystemAccess: false,
      originPrivateFileSystem: false,
      passkeyAutofill: false,
      passkeyPlatformAuthenticator: false,
      paymentRequest: false,
      push: false,
      secureContext: false,
      serviceWorker: false,
      webAuthn: false,
      webAuthnSignals: false,
      webLocks: false,
      webShare: false,
    });
  });

  it("detects passkeys, FedCM, storage, and operator workflow APIs", async () => {
    const targetWindow = createWindowStub({
      BarcodeDetector: class {},
      BroadcastChannel:
        TestBroadcastChannel as unknown as typeof BroadcastChannel,
      IdentityCredential: class {},
      PaymentRequest: class {},
      PublicKeyCredential: {
        getClientCapabilities: vi.fn().mockResolvedValue({
          conditionalGet: true,
          passkeyPlatformAuthenticator: true,
          webAuthnSignalUnknownCredential: true,
        }),
      } as unknown as BrowserPlatformWindow["PublicKeyCredential"],
      PushManager: class {},
      navigator: {
        clearAppBadge: vi.fn(),
        clipboard: {
          readText: vi.fn(),
          writeText: vi.fn(),
        },
        credentials: {},
        locks: {},
        serviceWorker: {},
        setAppBadge: vi.fn(),
        share: vi.fn(),
        storage: {
          getDirectory: vi.fn(),
        },
      } as unknown as Navigator,
      showOpenFilePicker: vi.fn(),
    });

    const capabilities = await detectBrowserPlatformCapabilities(targetWindow);

    expect(capabilities).toMatchObject({
      badging: true,
      barcodeDetection: true,
      broadcastChannel: true,
      clipboardRead: true,
      clipboardWrite: true,
      credentialManagement: true,
      fedCm: true,
      fileSystemAccess: true,
      originPrivateFileSystem: true,
      passkeyAutofill: true,
      passkeyPlatformAuthenticator: true,
      paymentRequest: true,
      push: true,
      secureContext: true,
      serviceWorker: true,
      webAuthn: true,
      webAuthnSignals: true,
      webLocks: true,
      webShare: true,
    });
  });
});

describe("copyTextToClipboard", () => {
  it("copies non-empty text with the Clipboard API", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const result = await copyTextToClipboard("order-123", {
      clipboard: { writeText },
    } as unknown as BrowserPlatformNavigator);

    expect(result).toEqual({ status: "copied" });
    expect(writeText).toHaveBeenCalledWith("order-123");
  });

  it("reports empty and unavailable copy attempts", async () => {
    await expect(copyTextToClipboard(" ")).resolves.toEqual({
      reason: "empty",
      status: "failed",
    });
    await expect(copyTextToClipboard("value", null)).resolves.toEqual({
      reason: "unavailable",
      status: "failed",
    });
  });
});

describe("shareOrCopyText", () => {
  it("uses native sharing before falling back to clipboard", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();

    await expect(
      shareOrCopyText(
        { fallbackText: "https://example.test", title: "Konfi" },
        {
          clipboard: { writeText },
          share,
        } as unknown as BrowserPlatformNavigator,
      ),
    ).resolves.toEqual({ status: "shared" });
    expect(share).toHaveBeenCalledWith({
      title: "Konfi",
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies fallback text when sharing fails", async () => {
    const share = vi.fn().mockRejectedValue(new Error("cancelled"));
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(
      shareOrCopyText({ fallbackText: "quote-link", title: "Quote" }, {
        clipboard: { writeText },
        share,
      } as unknown as BrowserPlatformNavigator),
    ).resolves.toEqual({ status: "copied" });
    expect(writeText).toHaveBeenCalledWith("quote-link");
  });
});

describe("withBrowserLock", () => {
  it("runs under Web Locks when available", async () => {
    const request = vi
      .fn()
      .mockImplementation(
        async (
          _name: string,
          _options: unknown,
          callback: () => Promise<string>,
        ) => callback(),
      );

    await expect(
      withBrowserLock(
        "konfi-upload",
        async () => "done",
        { mode: "exclusive" },
        { locks: { request } } as unknown as BrowserPlatformNavigator,
      ),
    ).resolves.toBe("done");
    expect(request).toHaveBeenCalledWith(
      "konfi-upload",
      { mode: "exclusive" },
      expect.any(Function),
    );
  });

  it("runs directly when Web Locks are unavailable", async () => {
    const callback = vi.fn(() => "done");

    await expect(withBrowserLock("konfi-upload", callback)).resolves.toBe(
      "done",
    );
    expect(callback).toHaveBeenCalledOnce();
  });
});

describe("createSameOriginMessenger", () => {
  it("broadcasts messages to other instances and ignores its own source", () => {
    TestBroadcastChannel.channels.clear();
    const targetWindow = createWindowStub({
      BroadcastChannel:
        TestBroadcastChannel as unknown as typeof BroadcastChannel,
      crypto: {
        randomUUID: vi
          .fn()
          .mockReturnValueOnce("source-a")
          .mockReturnValueOnce("source-b"),
      } as unknown as Crypto,
    });
    const receivedByA = vi.fn();
    const receivedByB = vi.fn();
    const messengerA = createSameOriginMessenger({
      channelName: "konfi:test",
      onMessage: receivedByA,
      targetWindow,
    });
    const messengerB = createSameOriginMessenger({
      channelName: "konfi:test",
      onMessage: receivedByB,
      targetWindow,
    });

    messengerA.post({ type: "logout" });

    expect(receivedByA).not.toHaveBeenCalled();
    expect(receivedByB).toHaveBeenCalledWith({ type: "logout" });

    messengerA.close();
    messengerB.close();
  });
});
