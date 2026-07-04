// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://localhost/en"}

import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VisualOnboarding, { getSpotlightCornerMask } from "../VisualOnboarding";
import {
  VISUAL_ONBOARDING_RESTART_EVENT,
  VISUAL_ONBOARDING_STORAGE_KEY,
  VISUAL_ONBOARDING_STORAGE_VERSION,
  VISUAL_ONBOARDING_TARGETS,
} from "../visual-onboarding-targets";

let pathname = "/en";

vi.mock("next/navigation", () => ({
  useParams: () => ({ lng: "en" }),
  usePathname: () => pathname,
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string | { pathname?: string };
  }) => (
    <a
      href={typeof href === "string" ? href : (href.pathname ?? "")}
      {...props}
    >
      {children}
    </a>
  ),
}));

vi.mock("@/i18n/client", () => ({
  useT: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (
      _key: string,
      options?: {
        count?: number;
        current?: number;
        defaultValue?: string;
        total?: number;
      },
    ) => {
      const defaultValue = options?.defaultValue ?? _key;

      return defaultValue
        .replace("{{current}}", String(options?.current ?? ""))
        .replace("{{total}}", String(options?.total ?? ""))
        .replace("{{count}}", String(options?.count ?? ""));
    },
  }),
}));

type TestRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

const targetRects = new Map<string, TestRect>();

function createStorageMock(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

function createRect({ height, left, top, width }: TestRect): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function setTargetRect(id: string, rect: Partial<TestRect> = {}) {
  targetRects.set(id, {
    height: rect.height ?? 48,
    left: rect.left ?? 120,
    top: rect.top ?? 120,
    width: rect.width ?? 120,
  });
}

function setViewportSize(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
  });
}

function bindTargetRect(node: HTMLElement | null, id: string) {
  if (!node) return;

  Object.defineProperty(node, "getBoundingClientRect", {
    configurable: true,
    value: () =>
      createRect(
        targetRects.get(id) ?? {
          height: 0,
          left: 0,
          top: 0,
          width: 0,
        },
      ),
  });
}

function Target({ id, label }: { id: string; label: string }) {
  return (
    <button
      ref={(node) => bindTargetRect(node, id)}
      data-onboarding-id={id}
      type="button"
    >
      {label}
    </button>
  );
}

function DelayedTarget({
  delayMs,
  id,
  label,
}: {
  delayMs: number;
  id: string;
  label: string;
}) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setIsVisible(true), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs]);

  if (!isVisible) return null;

  return <Target id={id} label={label} />;
}

function renderTour(children: ReactNode, paused = false) {
  return render(
    <ChakraProvider value={defaultSystem}>
      {children}
      <VisualOnboarding paused={paused} />
    </ChakraProvider>,
  );
}

async function waitForTourEffects() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  pathname = "/en";
  setViewportSize(1024, 768);
  targetRects.clear();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: createStorageMock(),
  });
  window.localStorage.clear();
  window.requestAnimationFrame = ((callback: FrameRequestCallback) =>
    window.setTimeout(
      () => callback(Date.now()),
      0,
    )) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = ((id: number) =>
    window.clearTimeout(id)) as typeof window.cancelAnimationFrame;

  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });

  const getBoundingClientRectMock = function getBoundingClientRectMock(
    this: Element,
  ) {
    const targetId = this.getAttribute("data-onboarding-id");
    const rect = targetId ? targetRects.get(targetId) : undefined;

    return createRect(
      rect ?? {
        height: 0,
        left: 0,
        top: 0,
        width: 0,
      },
    );
  };

  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    getBoundingClientRectMock,
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    getBoundingClientRectMock,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("VisualOnboarding", () => {
  it("anchors spotlight corner masks to the highlighted element corners", () => {
    expect(getSpotlightCornerMask("top-left", 18)).toBe(
      "radial-gradient(circle at bottom right, transparent 0 18px, black 18px)",
    );
    expect(getSpotlightCornerMask("top-right", 18)).toBe(
      "radial-gradient(circle at bottom left, transparent 0 18px, black 18px)",
    );
    expect(getSpotlightCornerMask("bottom-left", 18)).toBe(
      "radial-gradient(circle at top right, transparent 0 18px, black 18px)",
    );
    expect(getSpotlightCornerMask("bottom-right", 18)).toBe(
      "radial-gradient(circle at top left, transparent 0 18px, black 18px)",
    );
  });

  it("auto-opens on first browser visit", async () => {
    setTargetRect(VISUAL_ONBOARDING_TARGETS.settingsTrigger);

    renderTour(
      <Target
        id={VISUAL_ONBOARDING_TARGETS.settingsTrigger}
        label="Settings"
      />,
    );

    expect(await screen.findByText("Start with Settings")).toBeInTheDocument();
    expect(screen.getByText("1 of 15")).toBeInTheDocument();
  });

  it("waits to initialize while paused by another dialog", async () => {
    setTargetRect(VISUAL_ONBOARDING_TARGETS.settingsTrigger);

    const target = (
      <Target id={VISUAL_ONBOARDING_TARGETS.settingsTrigger} label="Settings" />
    );
    const view = renderTour(target, true);

    await waitForTourEffects();

    expect(screen.queryByText("Start with Settings")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(VISUAL_ONBOARDING_STORAGE_KEY)).toBe(
      null,
    );

    view.rerender(
      <ChakraProvider value={defaultSystem}>
        {target}
        <VisualOnboarding paused={false} />
      </ChakraProvider>,
    );

    expect(await screen.findByText("Start with Settings")).toBeInTheDocument();

    view.rerender(
      <ChakraProvider value={defaultSystem}>
        {target}
        <VisualOnboarding paused />
      </ChakraProvider>,
    );

    expect(screen.queryByText("Start with Settings")).not.toBeInTheDocument();
  });

  it("persists skip state in localStorage", async () => {
    const user = userEvent.setup();
    setTargetRect(VISUAL_ONBOARDING_TARGETS.settingsTrigger);

    renderTour(
      <Target
        id={VISUAL_ONBOARDING_TARGETS.settingsTrigger}
        label="Settings"
      />,
    );

    await screen.findByText("Start with Settings");
    await user.click(screen.getByRole("button", { name: "Skip" }));

    await waitFor(() =>
      expect(screen.queryByText("Start with Settings")).not.toBeInTheDocument(),
    );
    expect(
      JSON.parse(
        window.localStorage.getItem(VISUAL_ONBOARDING_STORAGE_KEY) ?? "{}",
      ).status,
    ).toBe("skipped");
  });

  it("keeps the first-step panel clear of a top settings trigger", async () => {
    setViewportSize(1024, 640);
    setTargetRect(VISUAL_ONBOARDING_TARGETS.settingsTrigger, {
      height: 44,
      left: 940,
      top: 12,
      width: 44,
    });

    renderTour(
      <Target
        id={VISUAL_ONBOARDING_TARGETS.settingsTrigger}
        label="Settings"
      />,
    );

    await screen.findByText("Start with Settings");

    const panel = document.querySelector<HTMLElement>(
      "[data-onboarding-panel='true']",
    );

    expect(Number(panel?.dataset.onboardingPanelTop)).toBeGreaterThanOrEqual(
      56,
    );
  });

  it("keeps the panel clear of a low settings trigger", async () => {
    setViewportSize(1024, 640);
    setTargetRect(VISUAL_ONBOARDING_TARGETS.settingsTrigger, {
      height: 44,
      left: 940,
      top: 560,
      width: 44,
    });

    renderTour(
      <Target
        id={VISUAL_ONBOARDING_TARGETS.settingsTrigger}
        label="Settings"
      />,
    );

    await screen.findByText("Start with Settings");

    const panel = document.querySelector<HTMLElement>(
      "[data-onboarding-panel='true']",
    );
    const panelTop = Number(panel?.dataset.onboardingPanelTop);
    const panelMaxHeight = Number(panel?.dataset.onboardingPanelMaxHeight);

    expect(panelTop + panelMaxHeight).toBeLessThanOrEqual(560);
  });

  it("can restart after being skipped", async () => {
    setTargetRect(VISUAL_ONBOARDING_TARGETS.settingsTrigger);
    window.localStorage.setItem(
      VISUAL_ONBOARDING_STORAGE_KEY,
      JSON.stringify({
        status: "skipped",
        version: VISUAL_ONBOARDING_STORAGE_VERSION,
      }),
    );

    renderTour(
      <Target
        id={VISUAL_ONBOARDING_TARGETS.settingsTrigger}
        label="Settings"
      />,
    );

    expect(screen.queryByText("Start with Settings")).not.toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event(VISUAL_ONBOARDING_RESTART_EVENT));
    });

    expect(await screen.findByText("Start with Settings")).toBeInTheDocument();
  });

  it("advances when the highlighted target is clicked", async () => {
    setTargetRect(VISUAL_ONBOARDING_TARGETS.settingsTrigger);
    setTargetRect(VISUAL_ONBOARDING_TARGETS.settingsConfiguration);

    renderTour(
      <>
        <Target
          id={VISUAL_ONBOARDING_TARGETS.settingsTrigger}
          label="Settings"
        />
        <Target
          id={VISUAL_ONBOARDING_TARGETS.settingsConfiguration}
          label="Configuration"
        />
      </>,
    );

    await screen.findByText("Start with Settings");
    await waitForTourEffects();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    expect(await screen.findByText("Open Configuration")).toBeInTheDocument();
  });

  it("shows a recovery panel when the user is on the wrong route", async () => {
    pathname = "/en/customers";
    window.localStorage.setItem(
      VISUAL_ONBOARDING_STORAGE_KEY,
      JSON.stringify({
        status: "active",
        stepId: "configChannels",
        version: VISUAL_ONBOARDING_STORAGE_VERSION,
      }),
    );

    renderTour(
      <Target id={VISUAL_ONBOARDING_TARGETS.configChannels} label="Channels" />,
    );

    expect(
      await screen.findByText("Let's get back to the tour"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Return to Configuration" }),
    ).toBeInTheDocument();
  });

  it("waits for configuration targets that render after navigation", async () => {
    pathname = "/en/configuration";
    setTargetRect(VISUAL_ONBOARDING_TARGETS.configChannels);
    window.localStorage.setItem(
      VISUAL_ONBOARDING_STORAGE_KEY,
      JSON.stringify({
        status: "active",
        stepId: "configChannels",
        version: VISUAL_ONBOARDING_STORAGE_VERSION,
      }),
    );

    renderTour(
      <DelayedTarget
        delayMs={350}
        id={VISUAL_ONBOARDING_TARGETS.configChannels}
        label="Channels"
      />,
    );

    expect(
      screen.queryByText("Let's get back to the tour"),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByText("Create sales channels", {}, { timeout: 2500 }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Let's get back to the tour"),
    ).not.toBeInTheDocument();
  });

  it("completes when the final catalog target is clicked", async () => {
    pathname = "/en/configuration";
    setTargetRect(VISUAL_ONBOARDING_TARGETS.settingsCatalog);
    window.localStorage.setItem(
      VISUAL_ONBOARDING_STORAGE_KEY,
      JSON.stringify({
        status: "active",
        stepId: "settingsCatalog",
        version: VISUAL_ONBOARDING_STORAGE_VERSION,
      }),
    );

    renderTour(
      <Target id={VISUAL_ONBOARDING_TARGETS.settingsCatalog} label="Catalog" />,
    );

    await screen.findByText("Finish in Catalog");
    await waitForTourEffects();
    fireEvent.click(screen.getByText("Catalog"));

    await waitFor(() =>
      expect(
        JSON.parse(
          window.localStorage.getItem(VISUAL_ONBOARDING_STORAGE_KEY) ?? "{}",
        ).status,
      ).toBe("completed"),
    );
  });
});
