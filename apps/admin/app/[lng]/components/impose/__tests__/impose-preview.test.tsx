// @vitest-environment jsdom

import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { imposeWorkspaceMode } from "@/lib/imposition/workspace";
import { ImposePreview } from "../impose-preview";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/i18n/client", () => ({
  useT: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

vi.mock("@konfi/wasm/browser", () => ({
  resolveImpositionPreview: vi.fn(
    () =>
      new Promise(() => {
        /* never resolves */
      }),
  ),
  imposeFilesToArchive: vi.fn(
    () =>
      new Promise(() => {
        /* never resolves */
      }),
  ),
}));

vi.mock("swr", () => ({
  default: vi.fn(() => ({
    data: undefined,
    error: undefined,
    isLoading: false,
  })),
}));

vi.mock("../preview/useImposedSheetPreview", () => ({
  useImposedSheetPreview: vi.fn(() => ({
    pageCount: 0,
    pageImages: {},
    isLoading: false,
    progressPercent: null,
    errorMessage: null,
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Realistic default form values — mirrors initialValuesImpose without firebase deps. */
const defaultFormValues = {
  customSheetSize: false,
  automaticSheetOrientation: true,
  sheetOrientation: "PORTRAIT",
  sheetSizeName: "A4",
  customSheetSizeWidth: undefined,
  customSheetSizeHeight: undefined,
  customItemSize: false,
  automaticItemOrientation: true,
  itemOrientation: "PORTRAIT",
  itemSizeName: "A5",
  customItemSizeWidth: undefined,
  customItemSizeHeight: undefined,
  automaticNumberOfHorizontalItems: true,
  automaticNumberOfVerticalItems: true,
  numItemsHorizontal: 2,
  numItemsVertical: 3,
  automaticSpacingHorizontal: true,
  automaticSpacingVertical: true,
  spacingHorizontal: "",
  spacingVertical: "",
  bleed: 3,
  bleedType: "BLEED_INCLUDED",
  sourceSizing: "PRESERVE_ORIGINAL_SIZE",
  cropMarks: true,
  layout: "STEP_AND_REPEAT",
  pagesPerSignature: 4,
  bindingEdge: "LEFT",
  duplexMode: "SIMPLEX",
  backPageRotation: "ROTATION_0",
  frontBackAlignment: false,
  mirrorBack: false,
  files: [],
  saveAsTemplate: false,
};

const emptyTemplateProps = {
  templates: [],
  isLoading: false,
  onLoadTemplate: vi.fn(),
  onRemoveTemplate: vi.fn(),
};

function renderWithChakra(ui: ReactNode) {
  return render(<ChakraProvider value={defaultSystem}>{ui}</ChakraProvider>);
}

/** Harness that wires a useForm instance into ImposePreview. */
function PreviewHarness({
  overrides = {},
}: {
  overrides?: Record<string, unknown>;
}) {
  const methods = useForm({
    defaultValues: { ...defaultFormValues, ...overrides },
  });

  return (
    <ImposePreview
      methods={methods as never}
      activeMode={imposeWorkspaceMode.LAYOUT}
      {...emptyTemplateProps}
    />
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ImposePreview — overlay count controls accessibility", () => {
  it("renders both role=group containers with correct aria-labels", () => {
    renderWithChakra(<PreviewHarness />);

    expect(
      screen.getByRole("group", { name: "Items across" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Items down" }),
    ).toBeInTheDocument();
  });

  it("renders all four overlay +/- buttons with correct aria-labels", () => {
    renderWithChakra(<PreviewHarness />);

    expect(
      screen.getByRole("button", { name: "Increase items across" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Decrease items across" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Increase items down" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Decrease items down" }),
    ).toBeInTheDocument();
  });

  it("clicking Increase items across turns off automaticNumberOfHorizontalItems and increments the count", () => {
    // Start with automatic=true so the resolved count is computed from sheet/item fit.
    // With A4 sheet and A5 items the auto-fit yields >=1 item across — we just need
    // to confirm the form field is set to (resolvedCount + 1) and the auto flag clears.
    let capturedMethods: ReturnType<typeof useForm> | null = null;

    function HarnessWithRef() {
      const methods = useForm({
        defaultValues: {
          ...defaultFormValues,
          automaticNumberOfHorizontalItems: true,
        },
      });
      capturedMethods = methods as never;

      return (
        <ChakraProvider value={defaultSystem}>
          <ImposePreview
            methods={methods as never}
            activeMode={imposeWorkspaceMode.LAYOUT}
            {...emptyTemplateProps}
          />
        </ChakraProvider>
      );
    }

    render(<HarnessWithRef />);

    const increaseBtn = screen.getByRole("button", {
      name: "Increase items across",
    });

    // Record what the component currently shows as the resolved count (the Badge text
    // inside the "Items across" group is the resolved horizontal item count).
    const groupContainer = screen.getByRole("group", { name: "Items across" });
    const badgeText = groupContainer.querySelector("p, span, [data-part]");
    const resolvedCountBefore = badgeText
      ? Number.parseInt(badgeText.textContent ?? "1", 10)
      : 1;

    fireEvent.click(increaseBtn);

    // After clicking, the auto flag should be cleared and the count set to
    // resolvedCount + 1.
    const formValues = capturedMethods!.getValues();
    expect(formValues.automaticNumberOfHorizontalItems).toBe(false);
    expect(formValues.numItemsHorizontal).toBe(
      Math.max(1, resolvedCountBefore) + 1,
    );
  });

  it("clicking Decrease items across with numItemsHorizontal=1 clamps to 1", () => {
    let capturedMethods: ReturnType<typeof useForm> | null = null;

    function HarnessWithRef() {
      const methods = useForm({
        defaultValues: {
          ...defaultFormValues,
          automaticNumberOfHorizontalItems: false,
          numItemsHorizontal: 1,
        },
      });
      capturedMethods = methods as never;

      return (
        <ChakraProvider value={defaultSystem}>
          <ImposePreview
            methods={methods as never}
            activeMode={imposeWorkspaceMode.LAYOUT}
            {...emptyTemplateProps}
          />
        </ChakraProvider>
      );
    }

    render(<HarnessWithRef />);

    fireEvent.click(
      screen.getByRole("button", { name: "Decrease items across" }),
    );

    const formValues = capturedMethods!.getValues();
    expect(formValues.numItemsHorizontal).toBe(1);
  });

  it("clicking Increase items down turns off automaticNumberOfVerticalItems and increments the count", () => {
    let capturedMethods: ReturnType<typeof useForm> | null = null;

    function HarnessWithRef() {
      const methods = useForm({
        defaultValues: {
          ...defaultFormValues,
          automaticNumberOfVerticalItems: true,
        },
      });
      capturedMethods = methods as never;

      return (
        <ChakraProvider value={defaultSystem}>
          <ImposePreview
            methods={methods as never}
            activeMode={imposeWorkspaceMode.LAYOUT}
            {...emptyTemplateProps}
          />
        </ChakraProvider>
      );
    }

    render(<HarnessWithRef />);

    const increaseBtn = screen.getByRole("button", {
      name: "Increase items down",
    });

    const groupContainer = screen.getByRole("group", { name: "Items down" });
    const badgeText = groupContainer.querySelector("p, span, [data-part]");
    const resolvedCountBefore = badgeText
      ? Number.parseInt(badgeText.textContent ?? "1", 10)
      : 1;

    fireEvent.click(increaseBtn);

    const formValues = capturedMethods!.getValues();
    expect(formValues.automaticNumberOfVerticalItems).toBe(false);
    expect(formValues.numItemsVertical).toBe(
      Math.max(1, resolvedCountBefore) + 1,
    );
  });

  it("clicking Decrease items down with numItemsVertical=1 clamps to 1", () => {
    let capturedMethods: ReturnType<typeof useForm> | null = null;

    function HarnessWithRef() {
      const methods = useForm({
        defaultValues: {
          ...defaultFormValues,
          automaticNumberOfVerticalItems: false,
          numItemsVertical: 1,
        },
      });
      capturedMethods = methods as never;

      return (
        <ChakraProvider value={defaultSystem}>
          <ImposePreview
            methods={methods as never}
            activeMode={imposeWorkspaceMode.LAYOUT}
            {...emptyTemplateProps}
          />
        </ChakraProvider>
      );
    }

    render(<HarnessWithRef />);

    fireEvent.click(
      screen.getByRole("button", { name: "Decrease items down" }),
    );

    const formValues = capturedMethods!.getValues();
    expect(formValues.numItemsVertical).toBe(1);
  });
});
