// @vitest-environment jsdom

import React from "react";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Timestamp } from "firebase/firestore";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Member } from "@konfi/types";
import { useConfiguration } from "@/context/configuration";
import { By } from "../By";

vi.mock("@/context/configuration", () => ({
  useConfiguration: vi.fn(),
}));

vi.mock("@/i18n/client", () => ({
  useT: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

const mockedUseConfiguration = vi.mocked(useConfiguration);

function createMember(id: string, name: string): Member {
  const timestamp = Timestamp.now();

  return {
    id,
    name,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function mockConfiguration(
  filteredMembers: Member[] | null,
  loadingMembers = false,
) {
  const configuration = {
    filteredMembers,
    loadingMembers,
  } satisfies Partial<ReturnType<typeof useConfiguration>>;

  mockedUseConfiguration.mockReturnValue(
    configuration as ReturnType<typeof useConfiguration>,
  );
}

function TestWrapper({
  children,
  defaultValues,
}: {
  children: React.ReactNode;
  defaultValues?: {
    createdBy?: { id: string; name: string };
    updatedBy?: { id: string; name: string };
    carriedOutBy?: string[];
  };
}) {
  const methods = useForm({
    defaultValues: {
      createdBy: { id: "", name: "" },
      updatedBy: { id: "", name: "" },
      carriedOutBy: [],
      ...defaultValues,
    },
  });

  return (
    <ChakraProvider value={defaultSystem}>
      <FormProvider {...methods}>{children}</FormProvider>
    </ChakraProvider>
  );
}

function CarriedOutByValue() {
  const carriedOutBy = useWatch({ name: "carriedOutBy" });

  return (
    <output data-testid="carried-out-by">
      {Array.isArray(carriedOutBy) ? carriedOutBy.join("|") : ""}
    </output>
  );
}

describe("By", () => {
  beforeEach(() => {
    localStorage.clear();
    mockedUseConfiguration.mockReset();
  });

  it("shows members that load after the field mounts", async () => {
    mockConfiguration(null);

    const user = userEvent.setup();
    const { rerender } = render(
      <TestWrapper>
        <By />
      </TestWrapper>,
    );

    mockConfiguration([createMember("member-1", "Alice Example")]);
    rerender(
      <TestWrapper>
        <By />
      </TestWrapper>,
    );

    await user.click(screen.getByRole("combobox"));

    expect(await screen.findByText("Alice Example")).toBeInTheDocument();
  });

  it("does not preselect updatedBy in edit mode", async () => {
    const member = createMember("member-1", "Alice Example");
    mockConfiguration([member]);

    const { container } = render(
      <TestWrapper
        defaultValues={{
          updatedBy: { id: member.id, name: member.name },
        }}
      >
        <By update />
      </TestWrapper>,
    );

    await waitFor(() => {
      const hiddenInput = container.querySelector<HTMLInputElement>(
        'input[type="hidden"][name="updatedBy"]',
      );

      expect(hiddenInput).not.toBeNull();
      expect(hiddenInput).toHaveValue("");
    });

    expect(screen.getByRole("combobox")).toHaveValue("");
  });

  it("allows reselecting the original updatedBy member in edit mode", async () => {
    const member = createMember("member-1", "Alice Example");
    mockConfiguration([member]);

    const user = userEvent.setup();
    const { container } = render(
      <TestWrapper
        defaultValues={{
          updatedBy: { id: member.id, name: member.name },
        }}
      >
        <By update />
      </TestWrapper>,
    );

    await waitFor(() => {
      const hiddenInput = container.querySelector<HTMLInputElement>(
        'input[type="hidden"][name="updatedBy"]',
      );

      expect(hiddenInput).not.toBeNull();
      expect(hiddenInput).toHaveValue("");
    });

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText(member.name));

    await waitFor(() => {
      const hiddenInput = container.querySelector<HTMLInputElement>(
        'input[type="hidden"][name="updatedBy"]',
      );

      expect(hiddenInput).not.toBeNull();
      expect(hiddenInput).toHaveValue(member.id);
    });

    expect(screen.getByRole("combobox")).toHaveValue(member.name);
  });

  it("keeps the first selected updatedBy member when the edit field starts empty", async () => {
    const alice = createMember("member-1", "Alice Example");
    const bob = createMember("member-2", "Bob Example");
    mockConfiguration([alice, bob]);

    const user = userEvent.setup();
    const { container } = render(
      <TestWrapper>
        <By update />
      </TestWrapper>,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText(bob.name));

    await waitFor(() => {
      const hiddenInput = container.querySelector<HTMLInputElement>(
        'input[type="hidden"][name="updatedBy"]',
      );

      expect(hiddenInput).not.toBeNull();
      expect(hiddenInput).toHaveValue(bob.id);
    });

    expect(screen.getByRole("combobox")).toHaveValue(bob.name);
  });

  it("keeps a different first selected updatedBy member after clearing the persisted editor", async () => {
    const alice = createMember("member-1", "Alice Example");
    const bob = createMember("member-2", "Bob Example");
    mockConfiguration([alice, bob]);

    const user = userEvent.setup();
    const { container } = render(
      <TestWrapper
        defaultValues={{
          updatedBy: { id: alice.id, name: alice.name },
        }}
      >
        <By update />
      </TestWrapper>,
    );

    await waitFor(() => {
      const hiddenInput = container.querySelector<HTMLInputElement>(
        'input[type="hidden"][name="updatedBy"]',
      );

      expect(hiddenInput).not.toBeNull();
      expect(hiddenInput).toHaveValue("");
    });

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText(bob.name));

    await waitFor(() => {
      const hiddenInput = container.querySelector<HTMLInputElement>(
        'input[type="hidden"][name="updatedBy"]',
      );

      expect(hiddenInput).not.toBeNull();
      expect(hiddenInput).toHaveValue(bob.id);
    });

    expect(screen.getByRole("combobox")).toHaveValue(bob.name);
  });

  it("does not preselect createdBy when localStorage byField holds a valid member id", async () => {
    const alice = createMember("member-1", "Alice Example");
    mockConfiguration([alice]);

    localStorage.setItem("byField", alice.id);

    const { container } = render(
      <TestWrapper>
        <By />
      </TestWrapper>,
    );

    await waitFor(() => {
      const hiddenInput = container.querySelector<HTMLInputElement>(
        'input[type="hidden"][name="createdBy"]',
      );

      expect(hiddenInput).not.toBeNull();
      expect(hiddenInput).toHaveValue("");
    });

    expect(screen.getByRole("combobox")).toHaveValue("");
  });

  it("does not preselect the first member in create mode when localStorage is empty", async () => {
    const alice = createMember("member-1", "Alice Example");
    const bob = createMember("member-2", "Bob Example");
    mockConfiguration([alice, bob]);

    const { container } = render(
      <TestWrapper>
        <By />
      </TestWrapper>,
    );

    await waitFor(() => {
      const hiddenInput = container.querySelector<HTMLInputElement>(
        'input[type="hidden"][name="createdBy"]',
      );

      expect(hiddenInput).not.toBeNull();
      expect(hiddenInput).toHaveValue("");
    });

    expect(screen.getByRole("combobox")).toHaveValue("");
  });

  it("adds create order by members to carriedOutBy without removing manual values", async () => {
    const alice = createMember("member-1", "Alice Example");
    const bob = createMember("member-2", "Bob Example");
    mockConfiguration([alice, bob]);

    const user = userEvent.setup();
    render(
      <TestWrapper
        defaultValues={{
          carriedOutBy: ["Manual Member"],
        }}
      >
        <By autoAddToCarriedOutBy />
        <CarriedOutByValue />
      </TestWrapper>,
    );

    expect(screen.getByTestId("carried-out-by")).toHaveTextContent(
      "Manual Member",
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText(alice.name));

    await waitFor(() => {
      expect(screen.getByTestId("carried-out-by")).toHaveTextContent(
        "Manual Member|Alice Example",
      );
    });

    expect(localStorage.getItem("byField")).toBe(alice.id);

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText(bob.name));

    await waitFor(() => {
      expect(screen.getByTestId("carried-out-by")).toHaveTextContent(
        "Manual Member|Alice Example|Bob Example",
      );
    });

    expect(localStorage.getItem("byField")).toBe(bob.id);
  });
});
