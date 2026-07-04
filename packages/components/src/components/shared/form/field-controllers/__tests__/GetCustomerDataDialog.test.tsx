// @vitest-environment jsdom

import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { AddressTypeEnum } from "@konfi/types";
import { DONE_TYPING_INTERVAL } from "@konfi/utils";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { TFunction } from "i18next";
import { type ReactNode, useState } from "react";
import {
  FormProvider,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GetCustomerDataDialog } from "../GetCustomerDataDialog";

const t = ((key: string, options?: Record<string, unknown>) =>
  typeof options?.defaultValue === "string"
    ? options.defaultValue
    : key) as TFunction;

const fetchedSubject = {
  name: "Example Company Sp. z o.o.",
  nip: "0000000000",
  regon: "000000000",
  krs: "0000123456",
  workingAddress: "Example Street 1, 00-000 Example City",
};

const createLookupResponse = () => ({
  source: "fakturownia-gus" as const,
  subject: fetchedSubject,
  errors: [],
  notices: [],
});

const createExistingClientLookupResponse = () => ({
  source: "fakturownia-client" as const,
  subject: {
    description: "Requires purchase order before invoicing.",
    name: "Example Saved Client",
    nip: fetchedSubject.nip,
    workingAddress: "Example Street 1, 00-000 Example City",
  },
  errors: [],
  notices: [],
});

const createMultipleClientLookupResponse = () => ({
  source: "fakturownia-client" as const,
  subject: null,
  matches: [
    {
      id: "12",
      email: "sales@example.com",
      subject: {
        name: "Example Saved Client",
        nip: fetchedSubject.nip,
        workingAddress: "Example Street 1, 00-000 Example City",
      },
    },
    {
      id: "19",
      email: "billing@example.com",
      subject: {
        description: "Use warehouse billing profile.",
        name: "Example Warehouse",
        nip: fetchedSubject.nip,
        workingAddress: "Example Avenue 5, 00-001 Example City",
      },
    },
  ],
  errors: [],
  notices: [],
});

const emptyBilling = {
  name: "",
  type: AddressTypeEnum.BILLING,
  nip: "",
  companyName: "",
  street: "",
  zip: "",
  city: "",
  country: "",
  active: true,
};

type BillingFormValues = {
  billing: typeof emptyBilling;
};

type RootFormValues = {
  nip: string;
  name: string;
  companyName: string;
  regon: string;
  krs: string;
  addresses: [typeof emptyBilling];
};

function BillingOutputs() {
  const billing = useWatch({
    name: "billing",
  }) as BillingFormValues["billing"];

  return (
    <>
      <div data-testid="billing-company">{billing?.companyName ?? ""}</div>
      <div data-testid="billing-nip">{billing?.nip ?? ""}</div>
      <div data-testid="billing-street">{billing?.street ?? ""}</div>
      <div data-testid="billing-zip">{billing?.zip ?? ""}</div>
      <div data-testid="billing-city">{billing?.city ?? ""}</div>
    </>
  );
}

function PrefillBillingButton() {
  const { setValue } = useFormContext<BillingFormValues>();

  return (
    <button
      type="button"
      onClick={() =>
        setValue(
          "billing",
          {
            ...emptyBilling,
            nip: fetchedSubject.nip,
            companyName: "Existing Customer",
          },
          {
            shouldDirty: false,
            shouldTouch: false,
            shouldValidate: false,
          },
        )
      }
    >
      Prefill billing
    </button>
  );
}

function SelectExistingBillingAddressButton() {
  const { setValue } = useFormContext<BillingFormValues>();

  return (
    <button
      type="button"
      onClick={() =>
        setValue(
          "billing",
          {
            ...emptyBilling,
            nip: "1111111111",
            companyName: "Saved Customer Address",
            street: "Example Avenue 5",
            zip: "00-001",
            city: "Example City",
          },
          {
            shouldDirty: true,
            shouldTouch: true,
            shouldValidate: true,
          },
        )
      }
    >
      Select existing billing
    </button>
  );
}

function BillingTestForm({ children }: { children?: ReactNode }) {
  const methods = useForm<BillingFormValues>({
    defaultValues: {
      billing: emptyBilling,
    },
  });
  const [lookupSequence, setLookupSequence] = useState(0);
  const billingNipRegistration = methods.register("billing.nip", {
    onChange: () => {
      setLookupSequence((current) => current + 1);
    },
  });

  return (
    <ChakraProvider value={defaultSystem}>
      <FormProvider {...methods}>
        <input aria-label="Billing NIP" {...billingNipRegistration} />
        <GetCustomerDataDialog
          fieldName="billing.nip"
          lookupSequence={lookupSequence}
          t={t}
        />
        <BillingOutputs />
        {children}
      </FormProvider>
    </ChakraProvider>
  );
}

function RootTestForm({
  defaultValues,
  prefilledFakturowniaCustomerDescription,
}: {
  defaultValues?: Partial<RootFormValues>;
  prefilledFakturowniaCustomerDescription?: string;
}) {
  const methods = useForm<RootFormValues>({
    defaultValues: {
      nip: "",
      name: "",
      companyName: "",
      regon: "",
      krs: "",
      addresses: [{ ...emptyBilling }],
      ...defaultValues,
    },
  });
  const [lookupSequence, setLookupSequence] = useState(0);
  const nipRegistration = methods.register("nip", {
    onChange: () => {
      setLookupSequence((current) => current + 1);
    },
  });

  return (
    <ChakraProvider value={defaultSystem}>
      <FormProvider {...methods}>
        <input aria-label="NIP" {...nipRegistration} />
        <GetCustomerDataDialog
          fieldName="nip"
          lookupSequence={lookupSequence}
          prefilledFakturowniaCustomerDescription={
            prefilledFakturowniaCustomerDescription
          }
          t={t}
        />
      </FormProvider>
    </ChakraProvider>
  );
}

describe("GetCustomerDataDialog", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("loads only Fakturownia descriptions when a persisted top-level NIP is present on mount", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        source: "fakturownia-client",
        descriptions: ["Persisted Fakturownia note."],
      }),
    }));

    vi.stubGlobal("fetch", fetchMock);

    render(<RootTestForm defaultValues={{ nip: fetchedSubject.nip }} />);

    await act(async () => {
      vi.advanceTimersByTime(DONE_TYPING_INTERVAL + 1);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/customer-data/nip/description",
      expect.objectContaining({
        body: JSON.stringify({ nip: fetchedSubject.nip }),
      }),
    );
    expect(screen.getByText("Persisted Fakturownia note.")).toBeInTheDocument();
    expect(screen.queryByText("Company data loaded")).not.toBeInTheDocument();
  });

  it("shows a prefilled Fakturownia customer description without autofilling company data", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        source: "fakturownia-client",
        descriptions: [],
      }),
    }));

    vi.stubGlobal("fetch", fetchMock);

    render(
      <RootTestForm
        defaultValues={{ nip: fetchedSubject.nip }}
        prefilledFakturowniaCustomerDescription="Prefilled customer note."
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(DONE_TYPING_INTERVAL + 1);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/customer-data/nip/description",
      expect.objectContaining({
        body: JSON.stringify({ nip: fetchedSubject.nip }),
      }),
    );
    expect(
      screen.getByText("Fakturownia customer description"),
    ).toBeInTheDocument();
    expect(
      screen
        .getByText("Fakturownia customer description")
        .closest("[aria-live='polite']"),
    ).toHaveTextContent("Prefilled customer note.");
    expect(screen.queryByText("Company data loaded")).not.toBeInTheDocument();
  });

  it("fetches and applies company data after manual NIP entry", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => createLookupResponse(),
    }));

    vi.stubGlobal("fetch", fetchMock);

    render(<BillingTestForm />);

    fireEvent.change(screen.getByRole("textbox", { name: "Billing NIP" }), {
      target: { value: fetchedSubject.nip },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DONE_TYPING_INTERVAL + 1);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("billing-company")).toHaveTextContent(
      "Example Company Sp. z o.o.",
    );
    expect(screen.getByTestId("billing-street")).toHaveTextContent(
      "Example Street 1",
    );
    expect(screen.getByTestId("billing-zip")).toHaveTextContent("00-000");
    expect(screen.getByTestId("billing-city")).toHaveTextContent(
      "Example City",
    );

    expect(screen.getByText("Company data loaded")).toBeInTheDocument();
  });

  it("does not run full company-data lookup when billing data is autofilled programmatically", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        source: "fakturownia-client",
        descriptions: ["Billing Fakturownia note."],
      }),
    }));

    vi.stubGlobal("fetch", fetchMock);

    render(
      <BillingTestForm>
        <PrefillBillingButton />
      </BillingTestForm>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Prefill billing" }));

    await act(async () => {
      vi.advanceTimersByTime(DONE_TYPING_INTERVAL + 1);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/customer-data/nip/description",
      expect.objectContaining({
        body: JSON.stringify({ nip: fetchedSubject.nip }),
      }),
    );
    expect(
      screen
        .getByText("Fakturownia customer description")
        .closest("[aria-live='polite']"),
    ).toHaveTextContent("Billing Fakturownia note.");
    expect(screen.queryByText("Company data loaded")).not.toBeInTheDocument();
  });

  it("prefers an existing Fakturownia client returned by the admin lookup route", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => createExistingClientLookupResponse(),
    }));

    vi.stubGlobal("fetch", fetchMock);

    render(<BillingTestForm />);

    fireEvent.change(screen.getByRole("textbox", { name: "Billing NIP" }), {
      target: { value: fetchedSubject.nip },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DONE_TYPING_INTERVAL + 1);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("billing-company")).toHaveTextContent(
      "Example Saved Client",
    );
    expect(screen.getByTestId("billing-street")).toHaveTextContent(
      "Example Street 1",
    );
    expect(screen.getByTestId("billing-zip")).toHaveTextContent("00-000");
    expect(screen.getByTestId("billing-city")).toHaveTextContent(
      "Example City",
    );
    expect(
      screen.getByText(
        "Fields were filled automatically from an existing Fakturownia client.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Fakturownia customer description"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Requires purchase order before invoicing."),
    ).toBeInTheDocument();
  });

  it("merges prefilled and fetched Fakturownia customer descriptions", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => createExistingClientLookupResponse(),
    }));

    vi.stubGlobal("fetch", fetchMock);

    render(
      <RootTestForm prefilledFakturowniaCustomerDescription="Check customer credit limit." />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "NIP" }), {
      target: { value: fetchedSubject.nip },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DONE_TYPING_INTERVAL + 1);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const descriptionAlert = screen
      .getByText("Fakturownia customer description")
      .closest("[aria-live='polite']");
    expect(descriptionAlert).toHaveTextContent("Check customer credit limit.");
    expect(descriptionAlert).toHaveTextContent(
      "Requires purchase order before invoicing.",
    );
  });

  it("lets the user choose between multiple existing Fakturownia clients", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => createMultipleClientLookupResponse(),
    }));

    vi.stubGlobal("fetch", fetchMock);

    render(<BillingTestForm />);

    fireEvent.change(screen.getByRole("textbox", { name: "Billing NIP" }), {
      target: { value: fetchedSubject.nip },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DONE_TYPING_INTERVAL + 1);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Select client" }),
    ).toBeInTheDocument();

    const dialog = screen.getByRole("dialog");

    await act(async () => {
      fireEvent.click(
        within(dialog).getAllByRole("button", { name: "Select" })[1],
      );
      await Promise.resolve();
    });

    expect(screen.getByTestId("billing-company")).toHaveTextContent(
      "Example Warehouse",
    );
    expect(screen.getByTestId("billing-street")).toHaveTextContent(
      "Example Avenue 5",
    );
    expect(screen.getByTestId("billing-zip")).toHaveTextContent("00-001");
    expect(screen.getByTestId("billing-city")).toHaveTextContent(
      "Example City",
    );
    expect(
      screen.getByText(
        "Fields were filled automatically from an existing Fakturownia client.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Use warehouse billing profile."),
    ).toBeInTheDocument();
  });

  it("does not refetch when an existing billing address card replaces the NIP", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => createLookupResponse(),
    }));

    vi.stubGlobal("fetch", fetchMock);

    render(
      <BillingTestForm>
        <SelectExistingBillingAddressButton />
      </BillingTestForm>,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Billing NIP" }), {
      target: { value: fetchedSubject.nip },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DONE_TYPING_INTERVAL + 1);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Select existing billing" }),
      );
      vi.advanceTimersByTime(DONE_TYPING_INTERVAL + 1);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("billing-company")).toHaveTextContent(
      "Saved Customer Address",
    );
    expect(screen.getByTestId("billing-nip")).toHaveTextContent("1111111111");
    expect(screen.getByTestId("billing-city")).toHaveTextContent(
      "Example City",
    );
  });
});
