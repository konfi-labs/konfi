import { afterEach, describe, expect, it, vi } from "vitest";
import { getRandomId } from "../../getters/get-random-id";

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("getRandomId", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should prefer crypto.randomUUID when available", () => {
    const nativeUuid = "00000000-0000-4000-8000-000000000000";
    const randomUUID = vi.fn(() => nativeUuid);

    vi.stubGlobal(
      "crypto",
      { randomUUID } as unknown as Crypto,
    );

    expect(getRandomId()).toBe(nativeUuid);
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it("should use crypto.getRandomValues when randomUUID is unavailable", () => {
    const getRandomValues = vi.fn((target: Uint8Array) => {
      target.set([
        0x00, 0x11, 0x22, 0x33,
        0x44, 0x55, 0x66, 0x77,
        0x88, 0x99, 0xaa, 0xbb,
        0xcc, 0xdd, 0xee, 0xff,
      ]);

      return target;
    });

    vi.stubGlobal(
      "crypto",
      { getRandomValues } as unknown as Crypto,
    );

    expect(getRandomId()).toBe("00112233-4455-4677-8899-aabbccddeeff");
    expect(getRandomValues).toHaveBeenCalledTimes(1);
  });

  it("should fall back to a UUID-shaped random value without crypto", () => {
    vi.stubGlobal("crypto", undefined);

    expect(getRandomId()).toMatch(UUID_V4_REGEX);
  });
});