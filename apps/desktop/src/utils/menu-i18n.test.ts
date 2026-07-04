import { beforeEach, describe, expect, it, vi } from "vitest";

const getLocale = vi.fn(() => "en-US");

vi.mock("electron", () => ({
  app: {
    getLocale,
  },
}));

describe("menu i18n", () => {
  beforeEach(() => {
    vi.resetModules();
    getLocale.mockReturnValue("en-US");
  });

  it("returns English menu labels", async () => {
    const { getMenuLabel } = await import("./menu-i18n");
    expect(getMenuLabel("fileMenu")).toBe("File");
    expect(getMenuLabel("openLink")).toBe("Open Link");
  });

  it("returns Polish menu labels", async () => {
    getLocale.mockReturnValue("pl-PL");
    const { getMenuLabel } = await import("./menu-i18n");
    expect(getMenuLabel("fileMenu")).toBe("Plik");
    expect(getMenuLabel("openLink")).toBe("Otwórz link");
  });
});
