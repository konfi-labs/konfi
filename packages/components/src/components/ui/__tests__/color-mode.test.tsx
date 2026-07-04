import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ColorModeProvider, useColorMode } from "../color-mode";

const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    clear: () => {
      store = {};
    },
    getItem: (key: string) => store[key] ?? null,
    key: (index: number) => Object.keys(store)[index] ?? null,
    removeItem: (key: string) => {
      delete store[key];
    },
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
  } satisfies Pick<Storage, "clear" | "getItem" | "key" | "removeItem" | "setItem">;
})();

function ThemeReader() {
  const { colorMode, toggleColorMode } = useColorMode();

  return (
    <>
      <span>{colorMode}</span>
      <button onClick={toggleColorMode} type="button">
        toggle
      </button>
    </>
  );
}

function mockMatchMedia(isDark: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: isDark,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("ColorModeProvider", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: localStorageMock,
    });

    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.removeProperty("color-scheme");
    window.localStorage.clear();
    mockMatchMedia(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.removeProperty("color-scheme");
    window.localStorage.clear();
  });

  it("applies the system color mode to the html class", async () => {
    mockMatchMedia(true);

    render(
      <ColorModeProvider>
        <ThemeReader />
      </ColorModeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("dark")).toBeInTheDocument();
      expect(document.documentElement.classList.contains("dark")).toBe(true);
      expect(document.documentElement.style.colorScheme).toBe("dark");
    });
  });

  it("persists explicit user toggles", async () => {
    const user = userEvent.setup();

    render(
      <ColorModeProvider defaultTheme="light" enableSystem={false}>
        <ThemeReader />
      </ColorModeProvider>,
    );

    await user.click(screen.getByRole("button", { name: "toggle" }));

    await waitFor(() => {
      expect(screen.getByText("dark")).toBeInTheDocument();
      expect(document.documentElement.classList.contains("dark")).toBe(true);
      expect(window.localStorage.getItem("theme")).toBe("dark");
    });
  });

  it("keeps forced themes stable even when toggled", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("theme", "dark");

    render(
      <ColorModeProvider forcedTheme="light">
        <ThemeReader />
      </ColorModeProvider>,
    );

    await user.click(screen.getByRole("button", { name: "toggle" }));

    await waitFor(() => {
      expect(screen.getByText("light")).toBeInTheDocument();
      expect(document.documentElement.classList.contains("light")).toBe(true);
      expect(window.localStorage.getItem("theme")).toBe("dark");
    });
  });
});