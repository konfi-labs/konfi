// @vitest-environment jsdom

import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import type { SelectOption } from "@konfi/types";
import {
  BleedSizingSection,
  FinishingSection,
  LayoutSection,
  SpacingSection,
} from "./ImposeWorkspaceSections";

vi.mock("@/i18n/client", () => ({
  useT: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (
      key: string,
      options?: { defaultValue?: string; [key: string]: unknown },
    ) =>
      (options?.defaultValue ?? key).replaceAll(
        /\{\{(\w+)\}\}/g,
        (_, token: string) => String(options?.[token] ?? ""),
      ),
  }),
}));

const orientationOptions: SelectOption[] = [
  { label: "Portrait", value: "PORTRAIT" },
  { label: "Landscape", value: "LANDSCAPE" },
];

const layoutOptions: SelectOption[] = [
  { label: "Step and repeat", value: "STEP_AND_REPEAT" },
];
const duplexOptions: SelectOption[] = [{ label: "Simplex", value: "SIMPLEX" }];
const backRotationOptions: SelectOption[] = [
  { label: "0°", value: "ROTATION_0" },
];
const bleedOptions: SelectOption[] = [
  { label: "Bleed included", value: "BLEED_INCLUDED" },
];
const sourceSizingOptions: SelectOption[] = [{ label: "Auto", value: "AUTO" }];

/** Realistic default form values — mirrors initialValuesImpose without firebase deps. */
const defaultFormValues = {
  customSheetSize: false,
  automaticSheetOrientation: true,
  sheetOrientation: "PORTRAIT",
  sheetSizeName: "",
  customItemSize: false,
  automaticItemOrientation: true,
  itemOrientation: "PORTRAIT",
  itemSizeName: "",
  automaticNumberOfHorizontalItems: true,
  automaticNumberOfVerticalItems: true,
  automaticSpacingHorizontal: true,
  automaticSpacingVertical: true,
  spacingHorizontal: "",
  spacingVertical: "",
  bleed: 3,
  bleedType: "BLEED_INCLUDED",
  sourceSizing: "AUTO",
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

function renderWithChakra(ui: ReactNode) {
  return render(<ChakraProvider value={defaultSystem}>{ui}</ChakraProvider>);
}

function LayoutHarness({
  overrides = {},
}: {
  overrides?: Record<string, unknown>;
}) {
  const methods = useForm({
    defaultValues: { ...defaultFormValues, ...overrides },
  });

  return (
    <LayoutSection
      methods={methods as never}
      layoutOptions={layoutOptions}
      orientationOptions={orientationOptions}
    />
  );
}

function SpacingHarness({
  overrides = {},
}: {
  overrides?: Record<string, unknown>;
}) {
  const methods = useForm({
    defaultValues: { ...defaultFormValues, ...overrides },
  });

  return <SpacingSection methods={methods as never} />;
}

function FinishingHarness({
  overrides = {},
}: {
  overrides?: Record<string, unknown>;
}) {
  const methods = useForm({
    defaultValues: { ...defaultFormValues, ...overrides },
  });

  return (
    <FinishingSection
      methods={methods as never}
      duplexOptions={duplexOptions}
      backRotationOptions={backRotationOptions}
    />
  );
}

function BleedHarness({
  overrides = {},
}: {
  overrides?: Record<string, unknown>;
}) {
  const methods = useForm({
    defaultValues: { ...defaultFormValues, ...overrides },
  });

  return (
    <BleedSizingSection
      methods={methods as never}
      bleedOptions={bleedOptions}
      sourceSizingOptions={sourceSizingOptions}
    />
  );
}

describe("LayoutSection", () => {
  it("hides count inputs and orientation comboboxes when all automatic flags are true", () => {
    renderWithChakra(<LayoutHarness />);

    expect(
      screen.queryByRole("spinbutton", { name: "Items across" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Items across")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("spinbutton", { name: "Items down" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Items down")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Sheet orientation"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Item orientation")).not.toBeInTheDocument();
  });

  it("shows 'Items across' input when automaticNumberOfHorizontalItems is false, updates form on change, and clamps to 1 on zero", () => {
    renderWithChakra(
      <LayoutHarness
        overrides={{
          automaticNumberOfHorizontalItems: false,
          numItemsHorizontal: 2,
        }}
      />,
    );

    const input = screen.getByLabelText("Items across");
    expect(input).toBeInTheDocument();

    // Typing 4 should update the form
    fireEvent.change(input, { target: { value: "4" } });
    expect(input).toHaveValue(4);

    // Typing 0 triggers the onChange which clamps to 1
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);
    // After blur NumberField syncs back to the form value (which was clamped to 1).
    expect(input).toHaveValue(1);
  });

  it("shows the sheet-orientation combobox when automaticSheetOrientation is false", () => {
    renderWithChakra(
      <LayoutHarness overrides={{ automaticSheetOrientation: false }} />,
    );

    const combobox = screen.getByRole("combobox", {
      name: "Sheet orientation",
    });
    expect(combobox).toBeInTheDocument();
  });

  it("shows the 'Items across' input after toggling the Auto across switch off", async () => {
    const user = userEvent.setup();
    renderWithChakra(<LayoutHarness />);

    const autoAcrossSwitch = screen.getByLabelText("Auto across");
    expect(autoAcrossSwitch).toBeChecked();

    await user.click(autoAcrossSwitch);

    expect(await screen.findByLabelText("Items across")).toBeInTheDocument();
  });
});

describe("SpacingSection", () => {
  it("renders auto-spacing switches in the on state by default", () => {
    renderWithChakra(<SpacingHarness />);

    expect(screen.getByLabelText("Auto horizontal spacing")).toBeChecked();
    expect(screen.getByLabelText("Auto vertical spacing")).toBeChecked();
  });

  it("renders a Reset spacing button", () => {
    renderWithChakra(<SpacingHarness />);

    expect(
      screen.getByRole("button", { name: /reset spacing/i }),
    ).toBeInTheDocument();
  });

  it("shows spacing badge text with default zero values", () => {
    renderWithChakra(<SpacingHarness />);

    expect(screen.getByText(/H spacing: 0/i)).toBeInTheDocument();
    expect(screen.getByText(/V spacing: 0/i)).toBeInTheDocument();
  });
});

describe("FinishingSection", () => {
  it("hides back-page controls when duplexMode is SIMPLEX", () => {
    renderWithChakra(<FinishingHarness />);

    // Back page rotation combobox should not appear
    expect(
      screen.queryByLabelText("Back page rotation"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Front back alignment"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Mirror back")).not.toBeInTheDocument();
  });

  it("shows back-page controls when duplexMode is not SIMPLEX", () => {
    renderWithChakra(
      <FinishingHarness overrides={{ duplexMode: "DUPLEX_LONG_EDGE" }} />,
    );

    expect(
      screen.getByRole("combobox", { name: "Back page rotation" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Front back alignment")).toBeInTheDocument();
    expect(screen.getByLabelText("Mirror back")).toBeInTheDocument();
  });
});

describe("BleedSizingSection", () => {
  it("renders bleed input and bleed type combobox", () => {
    renderWithChakra(<BleedHarness />);

    expect(screen.getByLabelText("Bleed")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Bleed type" }),
    ).toBeInTheDocument();
  });

  it("renders crop marks switch", () => {
    renderWithChakra(<BleedHarness />);

    expect(screen.getByLabelText("Crop marks")).toBeInTheDocument();
  });
});
