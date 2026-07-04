// @vitest-environment jsdom

import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ExternalProduct } from "@konfi/types";
import AttributeOptionMappings from "../AttributeOptionMappings";

vi.mock("@konfi/components", () => ({
  MaterialSymbol: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
  Tooltip: ({
    children,
  }: {
    children: ReactNode;
    content?: ReactNode;
  }) => <>{children}</>,
}));

const t = (
  _key: string,
  options?: { defaultValue?: string; label?: string },
): string => {
  const defaultValue = options?.defaultValue ?? _key;

  return options?.label
    ? defaultValue.replace("{{label}}", options.label)
    : defaultValue;
};

const externalAttribute: ExternalProduct["attributes"][number] = {
  name: "Finish",
  values: ["matte"],
  options: [{ value: "matte", label: "Matte" }],
  affectsPricing: true,
};

const internalOptions = [
  {
    label: "Glossy",
    value: "glossy",
    customFormat: false,
    hidden: false,
  },
];

describe("AttributeOptionMappings", () => {
  it("shows a create action for an unmapped option row", async () => {
    const user = userEvent.setup();
    const onCreateOption = vi.fn();

    render(
      <ChakraProvider value={defaultSystem}>
        <AttributeOptionMappings
          externalAttribute={externalAttribute}
          internalAttributeId="attr-finish"
          internalOptions={internalOptions}
          optionMappings={{}}
          creatingOptions={{}}
          getAiOptionSuggestion={() => undefined}
          onAutoMatchOptions={() => {}}
          onUpdateOptionMapping={() => {}}
          onCreateOption={onCreateOption}
          t={t}
        />
      </ChakraProvider>,
    );

    const createButton = screen.getByRole("button", {
      name: 'Create "Matte"',
    });

    expect(createButton).toBeInTheDocument();

    await user.click(createButton);

    expect(onCreateOption).toHaveBeenCalledWith(
      "attr-finish",
      "Finish",
      "matte",
      {
        label: "Matte",
        value: "matte",
      },
    );
  });

  it("hides the create action after the option is mapped", () => {
    render(
      <ChakraProvider value={defaultSystem}>
        <AttributeOptionMappings
          externalAttribute={externalAttribute}
          internalAttributeId="attr-finish"
          internalOptions={internalOptions}
          optionMappings={{ matte: "glossy" }}
          creatingOptions={{}}
          getAiOptionSuggestion={() => undefined}
          onAutoMatchOptions={() => {}}
          onUpdateOptionMapping={() => {}}
          onCreateOption={() => {}}
          t={t}
        />
      </ChakraProvider>,
    );

    expect(
      screen.queryByRole("button", { name: 'Create "Matte"' }),
    ).not.toBeInTheDocument();
  });
});
