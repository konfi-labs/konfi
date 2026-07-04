import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { createInstance } from "i18next";
import { type ReactNode } from "react";
import { useForm, useFormContext } from "react-hook-form";
import {
  Address,
  AddressTypeEnum,
  Contact,
  FormData,
  OrderItem,
  ShippingOptions,
  ShippingTypes,
  Unit,
  type Warehouse,
} from "@konfi/types";
import { type FormControllerProps, FormController } from "../FormController";

const testI18n = createInstance();

beforeAll(async () => {
  await testI18n.init({
    lng: "en",
    resources: {
      en: {
        translation: {},
      },
    },
  });
});

const formData: FormData = {
  allowMultiple: false,
  allowToggle: false,
  sections: [
    {
      fieldArray: false,
      fields: [
        {
          name: "name",
          label: "Name",
        },
      ],
    },
  ],
};

const updateDisabledTextFormData: FormData = {
  allowMultiple: false,
  allowToggle: false,
  sections: [
    {
      fieldArray: false,
      fields: [
        {
          name: "id",
          label: "Identifier",
          updateDisabled: true,
        },
      ],
    },
  ],
};

type ShippingAddressFormValues = {
  customer: {
    addresses: Address[];
  };
  shipping: Address;
  shippingOption: ShippingOptions;
};

type CustomerContactFormValues = {
  customer: {
    id?: string;
    name?: string;
    contacts?: Contact[];
  };
  contact: Contact;
};

type BillingAddressFormValues = {
  customer: {
    addresses: Address[];
  };
  billing: Address | null;
};

type ToggleFormValues = {
  name: string;
  notes: string;
};

type WatchedTextareaFormValues = {
  notes: string;
};

type WatchedInputFormValues = {
  nip: string;
};

type ShippingOptionFormValues = {
  items: OrderItem[];
  shippingOption: ShippingOptions;
};

const savedShippingAddress: Address = {
  name: "Office",
  type: AddressTypeEnum.SHIPPING,
  street: "Example Street",
  number: "12",
  local: "3",
  zip: "00-001",
  city: "Example City",
  country: "Poland",
  active: true,
};

const emptyShippingAddress: Address = {
  name: "",
  type: AddressTypeEnum.SHIPPING,
  street: "",
  number: "",
  local: "",
  zip: "",
  city: "",
  country: "Poland",
  active: true,
};

const emptyBillingAddress: Address = {
  name: "",
  type: AddressTypeEnum.BILLING,
  street: "",
  number: "",
  local: "",
  zip: "",
  city: "",
  country: "Poland",
  active: true,
};

const pickupWarehouse = {
  id: "warehouse-1",
  name: "Main Pickup Warehouse",
  active: true,
  address: {
    name: "Pickup Desk",
    type: AddressTypeEnum.BILLING,
    street: "Warehouse Street",
    number: "10",
    zip: "00-001",
    city: "Example City",
    country: "Poland",
  },
} as unknown as Warehouse;

const addressFormData: FormData = {
  allowMultiple: false,
  allowToggle: false,
  sections: [
    {
      fieldArray: false,
      fields: [
        {
          name: "shipping",
          label: "Shipping Address",
          isObject: true,
          optionsKey: "shippingAddresses",
          type: "radioGrid",
        },
      ],
    },
  ],
};

const savedCustomerAContact: Contact = {
  name: "Alice Example",
  email: "alice@example.com",
  phone: "111111111",
  active: true,
};

const savedCustomerBContact: Contact = {
  name: "Bob Example",
  email: "bob@example.com",
  phone: "222222222",
  active: true,
};

const manualContact: Contact = {
  name: "Manual Person",
  email: "manual@example.com",
  phone: "333333333",
  active: true,
};

const customerContactFormData: FormData = {
  allowMultiple: false,
  allowToggle: false,
  sections: [
    {
      fieldArray: false,
      fields: [
        {
          name: "contact",
          label: "Contact",
          isObject: true,
          optionsKey: "contacts",
          type: "radioGrid",
        },
        {
          name: "contact.name",
          label: "Full Name",
        },
        {
          name: "contact.email",
          label: "Email",
        },
        {
          name: "contact.phone",
          label: "Phone",
        },
      ],
    },
  ],
};

const billingAddressFormData: FormData = {
  allowMultiple: false,
  allowToggle: false,
  sections: [
    {
      fieldArray: false,
      fields: [
        {
          name: "billing",
          label: "Billing Address",
          isObject: true,
          optionsKey: "billingAddresses",
          type: "radioGrid",
        },
        {
          name: "billing.companyName",
          label: "Company Name",
        },
      ],
    },
  ],
};

const toggleFormData: FormData = {
  allowMultiple: true,
  allowToggle: true,
  sections: [
    {
      fieldArray: false,
      heading: "Main",
      isDefaultExpanded: true,
      fields: [
        {
          name: "name",
          label: "Name",
        },
      ],
    },
    {
      fieldArray: false,
      heading: "Advanced",
      isDefaultExpanded: false,
      fields: [
        {
          name: "notes",
          label: "Notes",
        },
      ],
    },
  ],
};

const watchedTextareaFormData: FormData = {
  allowMultiple: false,
  allowToggle: false,
  sections: [
    {
      fieldArray: false,
      fields: [
        {
          name: "notes",
          label: "Notes",
          type: "textarea",
          watch: true,
        },
      ],
    },
  ],
};

const watchedInputFormData: FormData = {
  allowMultiple: false,
  allowToggle: false,
  sections: [
    {
      fieldArray: false,
      fields: [
        {
          name: "nip",
          label: "NIP",
          watch: true,
          placeholder: "1234567890",
        },
      ],
    },
  ],
};

const shippingOptionFormData: FormData = {
  allowMultiple: false,
  allowToggle: false,
  sections: [
    {
      fieldArray: false,
      fields: [
        {
          name: "shippingOption",
          label: "Delivery",
          type: "radioGrid",
          options: [
            { label: "Custom courier", value: ShippingOptions.CUSTOM },
            { label: "DHL courier", value: ShippingOptions.DHL },
            {
              label: "Pickup",
              value: ShippingOptions.PERSONAL_COLLECTION,
            },
          ],
        },
      ],
    },
  ],
};

const productFilteredShippingOptionFormData: FormData = {
  ...shippingOptionFormData,
  sections: shippingOptionFormData.sections.map((section) => ({
    ...section,
    fields: section.fields.map((field) =>
      field.name === "shippingOption"
        ? { ...field, filterShippingOptionsByProduct: true }
        : field,
    ),
  })),
};

const compactSavedOrderItem = {
  id: "item-1",
  name: "Item 1",
  product: {
    id: "product-1",
    name: "Compact saved product",
    channelId: "channel-1",
    spec: {
      images: [],
    },
  },
  description: "",
  customFormat: false,
  totalPrice: 0,
  customPrice: null,
  quantity: 1,
  discount: {
    discountType: null,
    percent: 0,
    amount: 0,
  },
  unit: Unit.PCS,
} as OrderItem;

const fullSavedOrderItem = {
  ...compactSavedOrderItem,
  product: {
    ...compactSavedOrderItem.product,
    shipping: {
      types: [ShippingTypes.PERSONAL_COLLECTION],
    },
  },
} as OrderItem;

function SetCustomerButtons() {
  const { setValue } = useFormContext<CustomerContactFormValues>();

  return (
    <>
      <button
        type="button"
        onClick={() =>
          setValue(
            "customer",
            {
              id: "customer-a",
              name: "Customer A",
              contacts: [savedCustomerAContact],
            },
            {
              shouldDirty: true,
              shouldTouch: true,
            },
          )
        }
      >
        Set customer A
      </button>
      <button
        type="button"
        onClick={() =>
          setValue(
            "customer",
            {
              id: "customer-b",
              name: "Customer B",
              contacts: [savedCustomerBContact],
            },
            {
              shouldDirty: true,
              shouldTouch: true,
            },
          )
        }
      >
        Set customer B
      </button>
    </>
  );
}

function TestForm({
  handleSubmit,
  submitOnEnter = false,
  submitDisabled = false,
  submitLoading = false,
  submitLoadingLabel,
  renderAfterField,
  children,
}: {
  handleSubmit: (data: { name: string }) => Promise<void>;
  submitOnEnter?: boolean;
  submitDisabled?: boolean;
  submitLoading?: boolean;
  submitLoadingLabel?: string;
  renderAfterField?: FormControllerProps["renderAfterField"];
  children?: ReactNode;
}) {
  const methods = useForm({
    defaultValues: {
      name: "",
    },
  });

  return (
    <ChakraProvider value={defaultSystem}>
      <FormController
        methods={methods}
        buttonLeftIcon="save"
        buttonLabel="Save"
        formData={formData}
        handleSubmit={handleSubmit}
        submitOnEnter={submitOnEnter}
        submitDisabled={submitDisabled}
        submitLoading={submitLoading}
        submitLoadingLabel={submitLoadingLabel}
        renderAfterField={renderAfterField}
        t={testI18n.t.bind(testI18n)}
        i18n={testI18n}
      >
        {children}
      </FormController>
    </ChakraProvider>
  );
}

function UpdateDisabledTextForm() {
  const methods = useForm({
    defaultValues: {
      id: "paperType",
    },
  });

  return (
    <ChakraProvider value={defaultSystem}>
      <FormController
        methods={methods}
        buttonLeftIcon="save"
        buttonLabel="Save"
        formData={updateDisabledTextFormData}
        handleSubmit={async () => undefined}
        update
        t={testI18n.t.bind(testI18n)}
        i18n={testI18n}
      />
    </ChakraProvider>
  );
}

function ResetShippingButton() {
  const { setValue } = useFormContext<ShippingAddressFormValues>();

  return (
    <button
      type="button"
      onClick={() =>
        setValue("shipping", emptyShippingAddress, {
          shouldDirty: true,
          shouldTouch: true,
        })
      }
    >
      Clear shipping
    </button>
  );
}

function SetPickupShippingButton() {
  const { setValue } = useFormContext<ShippingAddressFormValues>();

  return (
    <button
      type="button"
      onClick={() =>
        setValue("shippingOption", ShippingOptions.PERSONAL_COLLECTION, {
          shouldDirty: true,
          shouldTouch: true,
        })
      }
    >
      Set pickup shipping
    </button>
  );
}

function ResetWatchedTextareaButton() {
  const { reset } = useFormContext<WatchedTextareaFormValues>();

  return (
    <button
      type="button"
      onClick={() =>
        reset({
          notes: "Reset note",
        })
      }
    >
      Reset notes
    </button>
  );
}

function WatchedTextareaForm({
  handleSubmit,
}: {
  handleSubmit: (data: WatchedTextareaFormValues) => Promise<void>;
}) {
  const methods = useForm<WatchedTextareaFormValues>({
    defaultValues: {
      notes: "",
    },
  });

  return (
    <ChakraProvider value={defaultSystem}>
      <FormController
        methods={methods}
        buttonLeftIcon="save"
        buttonLabel="Save"
        formData={watchedTextareaFormData}
        handleSubmit={handleSubmit}
        t={testI18n.t.bind(testI18n)}
        i18n={testI18n}
      >
        <ResetWatchedTextareaButton />
      </FormController>
    </ChakraProvider>
  );
}

function WatchedInputForm({
  handleSubmit,
}: {
  handleSubmit: (data: WatchedInputFormValues) => Promise<void>;
}) {
  const methods = useForm<WatchedInputFormValues>({
    defaultValues: {
      nip: "",
    },
  });

  return (
    <ChakraProvider value={defaultSystem}>
      <FormController
        methods={methods}
        buttonLeftIcon="save"
        buttonLabel="Save"
        formData={watchedInputFormData}
        handleSubmit={handleSubmit}
        t={testI18n.t.bind(testI18n)}
        i18n={testI18n}
      />
    </ChakraProvider>
  );
}

function ShippingAddressForm({
  handleSubmit,
  children,
  warehouses,
}: {
  handleSubmit: (data: ShippingAddressFormValues) => Promise<void>;
  children?: ReactNode;
  warehouses?: Warehouse[];
}) {
  const methods = useForm<ShippingAddressFormValues>({
    defaultValues: {
      customer: {
        addresses: [savedShippingAddress],
      },
      shipping: emptyShippingAddress,
      shippingOption: ShippingOptions.DHL,
    },
  });

  return (
    <ChakraProvider value={defaultSystem}>
      <FormController
        methods={methods}
        buttonLeftIcon="save"
        buttonLabel="Save"
        formData={addressFormData}
        handleSubmit={handleSubmit}
        warehouses={warehouses}
        t={testI18n.t.bind(testI18n)}
        i18n={testI18n}
      >
        {children}
      </FormController>
    </ChakraProvider>
  );
}

function CustomerContactForm({
  handleSubmit,
  defaultValues,
  children,
}: {
  handleSubmit: (data: CustomerContactFormValues) => Promise<void>;
  defaultValues?: Partial<CustomerContactFormValues>;
  children?: ReactNode;
}) {
  const methods = useForm<CustomerContactFormValues>({
    defaultValues: {
      customer: {
        id: "",
        name: "",
        contacts: [],
      },
      contact: {
        name: "",
        email: "",
        phone: "",
        active: true,
      },
      ...defaultValues,
    },
  });

  return (
    <ChakraProvider value={defaultSystem}>
      <FormController
        methods={methods}
        buttonLeftIcon="save"
        buttonLabel="Save"
        formData={customerContactFormData}
        handleSubmit={handleSubmit}
        t={testI18n.t.bind(testI18n)}
        i18n={testI18n}
      >
        {children}
      </FormController>
    </ChakraProvider>
  );
}

function FlagBillingErrorButton() {
  const { setError } = useFormContext<BillingAddressFormValues>();

  return (
    <button
      type="button"
      onClick={() =>
        setError("billing", {
          type: "required",
          message: "Billing address is required.",
        })
      }
    >
      Flag billing error
    </button>
  );
}

function BillingAddressForm({
  handleSubmit,
  children,
}: {
  handleSubmit: (data: BillingAddressFormValues) => Promise<void>;
  children?: ReactNode;
}) {
  const methods = useForm<BillingAddressFormValues>({
    defaultValues: {
      customer: {
        addresses: [],
      },
      billing: emptyBillingAddress,
    },
  });

  return (
    <ChakraProvider value={defaultSystem}>
      <FormController
        methods={methods}
        buttonLeftIcon="save"
        buttonLabel="Save"
        formData={billingAddressFormData}
        handleSubmit={handleSubmit}
        t={testI18n.t.bind(testI18n)}
        i18n={testI18n}
      >
        {children}
      </FormController>
    </ChakraProvider>
  );
}

function ToggleForm({
  handleSubmit,
}: {
  handleSubmit: (data: ToggleFormValues) => Promise<void>;
}) {
  const methods = useForm<ToggleFormValues>({
    defaultValues: {
      name: "",
      notes: "Saved note",
    },
  });

  return (
    <ChakraProvider value={defaultSystem}>
      <FormController
        methods={methods}
        buttonLeftIcon="save"
        buttonLabel="Save"
        formData={toggleFormData}
        handleSubmit={handleSubmit}
        t={testI18n.t.bind(testI18n)}
        i18n={testI18n}
      />
    </ChakraProvider>
  );
}

function ShippingOptionForm({
  handleSubmit,
  items,
  formData: shippingFormData = shippingOptionFormData,
}: {
  handleSubmit: (data: ShippingOptionFormValues) => Promise<void>;
  items: OrderItem[];
  formData?: FormData;
}) {
  const methods = useForm<ShippingOptionFormValues>({
    defaultValues: {
      items,
      shippingOption: ShippingOptions.PERSONAL_COLLECTION,
    },
  });

  return (
    <ChakraProvider value={defaultSystem}>
      <FormController
        methods={methods}
        buttonLeftIcon="save"
        buttonLabel="Save"
        formData={shippingFormData}
        handleSubmit={handleSubmit}
        update
        t={testI18n.t.bind(testI18n)}
        i18n={testI18n}
      />
    </ChakraProvider>
  );
}

describe("FormController", () => {
  test("disables update-locked plain text inputs while keeping their value visible", () => {
    render(<UpdateDisabledTextForm />);

    const identifier = screen.getByLabelText("Identifier");

    expect(identifier).toHaveValue("paperType");
    expect(identifier).toBeDisabled();
    expect(identifier).toHaveAttribute("readonly");
  });

  test("prevents implicit submit on Enter by default", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn(async (_data: { name: string }) => undefined);

    render(<TestForm handleSubmit={handleSubmit} />);

    await user.type(screen.getByRole("textbox", { name: "Name" }), "Alice");
    await user.keyboard("{Enter}");

    expect(handleSubmit).not.toHaveBeenCalled();
  });

  test("allows Enter submit when submitOnEnter is enabled", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn(async (_data: { name: string }) => undefined);

    render(<TestForm handleSubmit={handleSubmit} submitOnEnter />);

    await user.type(screen.getByRole("textbox", { name: "Name" }), "Alice");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Alice" }),
      );
    });
  });

  test("keeps explicit keyboard submit on the submit button", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn(async (_data: { name: string }) => undefined);

    render(<TestForm handleSubmit={handleSubmit} />);

    await user.type(screen.getByRole("textbox", { name: "Name" }), "Alice");
    await user.tab();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Alice" }),
      );
    });
  });

  test("keeps click submit on the submit button", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn(async (_data: { name: string }) => undefined);

    render(<TestForm handleSubmit={handleSubmit} />);

    await user.type(screen.getByRole("textbox", { name: "Name" }), "Alice");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Alice" }),
      );
    });
  });

  test("ignores repeated submit events while submission is pending", async () => {
    let resolveSubmit!: () => void;
    const pendingSubmit = new Promise<void>((resolve) => {
      resolveSubmit = resolve;
    });
    const handleSubmit = vi.fn((_data: { name: string }) => pendingSubmit);

    render(
      <TestForm handleSubmit={handleSubmit} submitLoadingLabel="Saving..." />,
    );

    const submitButton = screen.getByRole("button", { name: "Save" });
    const form = submitButton.closest("form");

    if (!form) {
      throw new Error("Expected submit button to be inside a form");
    }

    const submit = () => {
      const submitEvent = new Event("submit", {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(submitEvent, "submitter", {
        value: submitButton,
      });

      fireEvent(form, submitEvent);
    };

    submit();

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText("Saving...").closest("button")).toBeDisabled();

    submit();

    expect(handleSubmit).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSubmit();
      await pendingSubmit;
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
    });
  });

  test("supports an external submit lock and loading label", () => {
    const handleSubmit = vi.fn(async (_data: { name: string }) => undefined);

    render(
      <TestForm
        handleSubmit={handleSubmit}
        submitDisabled
        submitLoading
        submitLoadingLabel="Opening order..."
      />,
    );

    const submitButton = screen.getByText("Opening order...").closest("button");

    expect(submitButton).toBeDisabled();
  });

  test("renders field-level content after the matching field without affecting submit", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn(async (_data: { name: string }) => undefined);

    render(
      <TestForm
        handleSubmit={handleSubmit}
        renderAfterField={({ fieldData }) =>
          fieldData.name === "name" ? (
            <div role="status">Name inline notice</div>
          ) : null
        }
      />,
    );

    const input = screen.getByRole("textbox", { name: "Name" });
    const notice = screen.getByRole("status");

    expect(notice.textContent).toBe("Name inline notice");
    expect(
      input.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await user.type(input, "Alice");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Alice" }),
      );
    });
  });

  test("prevents implicit submit from combobox-like inputs", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn(async (_data: { name: string }) => undefined);

    render(
      <TestForm handleSubmit={handleSubmit}>
        <div data-scope="combobox" data-state="open">
          <input aria-label="Customer" />
        </div>
      </TestForm>,
    );

    await user.click(screen.getByRole("textbox", { name: "Customer" }));
    await user.keyboard("{Enter}");

    expect(handleSubmit).not.toHaveBeenCalled();
  });

  test("submits the selected shipping address from the radio grid", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn(
      async (_data: ShippingAddressFormValues) => undefined,
    );

    render(<ShippingAddressForm handleSubmit={handleSubmit} />);

    await user.click(screen.getByText(savedShippingAddress.name));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          shipping: expect.objectContaining(savedShippingAddress),
        }),
      );
    });
  });

  test("keeps the radio grid in sync when the shipping value is cleared externally", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn(
      async (_data: ShippingAddressFormValues) => undefined,
    );

    const { container } = render(
      <ShippingAddressForm handleSubmit={handleSubmit}>
        <ResetShippingButton />
      </ShippingAddressForm>,
    );

    await user.click(screen.getByText(savedShippingAddress.name));

    await waitFor(() => {
      expect(
        container.querySelectorAll('input[type="radio"]:checked'),
      ).toHaveLength(1);
    });

    await user.click(screen.getByRole("button", { name: "Clear shipping" }));

    await waitFor(() => {
      expect(
        container.querySelectorAll('input[type="radio"]:checked'),
      ).toHaveLength(0);
    });
  });

  test("shows warehouse options when the shipping option changes to pickup", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn(
      async (_data: ShippingAddressFormValues) => undefined,
    );

    render(
      <ShippingAddressForm
        handleSubmit={handleSubmit}
        warehouses={[pickupWarehouse]}
      >
        <SetPickupShippingButton />
      </ShippingAddressForm>,
    );

    expect(screen.queryByText("Pickup Desk")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Set pickup shipping" }),
    );

    expect(screen.getByText("Pickup Desk")).toBeTruthy();
  });

  test("shows an empty billing selector state without surfacing a selection error", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn(
      async (_data: BillingAddressFormValues) => undefined,
    );

    render(
      <BillingAddressForm handleSubmit={handleSubmit}>
        <FlagBillingErrorButton />
      </BillingAddressForm>,
    );

    expect(
      screen.getByText(
        "This customer has no saved billing addresses. Fill in the billing details below.",
      ),
    ).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Flag billing error" }),
    );

    expect(screen.queryByText("Wybierz jedną z opcji.")).toBeNull();
  });

  test("preserves a manually entered contact when the customer changes", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn(
      async (_data: CustomerContactFormValues) => undefined,
    );

    render(
      <CustomerContactForm handleSubmit={handleSubmit}>
        <SetCustomerButtons />
      </CustomerContactForm>,
    );

    await user.type(
      screen.getByRole("textbox", { name: "Full Name" }),
      manualContact.name,
    );
    await user.type(
      screen.getByRole("textbox", { name: "Email" }),
      manualContact.email,
    );
    await user.type(
      screen.getByRole("textbox", { name: "Phone" }),
      manualContact.phone,
    );

    await user.click(screen.getByRole("button", { name: "Set customer A" }));
    await user.click(screen.getByRole("button", { name: "Set customer B" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          contact: expect.objectContaining(manualContact),
        }),
      );
    });
  });

  test("clears a previously selected saved contact when switching customers", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn(
      async (_data: CustomerContactFormValues) => undefined,
    );

    render(
      <CustomerContactForm
        handleSubmit={handleSubmit}
        defaultValues={{
          customer: {
            id: "customer-a",
            name: "Customer A",
            contacts: [savedCustomerAContact],
          },
          contact: savedCustomerAContact,
        }}
      >
        <SetCustomerButtons />
      </CustomerContactForm>,
    );

    await user.click(screen.getByRole("button", { name: "Set customer B" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          contact: expect.objectContaining({
            name: "",
            email: "",
            phone: "",
            active: true,
          }),
        }),
      );
    });
  });

  test("lazy mounts collapsed sections when they are opened", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn(async (_data: ToggleFormValues) => undefined);

    render(<ToggleForm handleSubmit={handleSubmit} />);

    expect(screen.queryByRole("textbox", { name: "Notes" })).toBeNull();

    await user.click(screen.getByRole("button", { name: /Advanced/ }));

    expect(screen.getByRole("textbox", { name: "Notes" })).toBeTruthy();
  });

  test("preserves default values from collapsed sections on submit", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn(async (_data: ToggleFormValues) => undefined);

    render(<ToggleForm handleSubmit={handleSubmit} />);

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          notes: "Saved note",
        }),
      );
    });
  });

  test("updates a watched textarea after form reset without remounting", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn(
      async (_data: WatchedTextareaFormValues) => undefined,
    );

    render(<WatchedTextareaForm handleSubmit={handleSubmit} />);

    const notesInput = screen.getByRole("textbox", { name: "Notes" });
    expect(notesInput).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Reset notes" }));

    expect(notesInput).toHaveValue("Reset note");
  });

  test("allows typing into a watched plain input", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn(
      async (_data: WatchedInputFormValues) => undefined,
    );

    render(<WatchedInputForm handleSubmit={handleSubmit} />);

    const nipInput = screen.getByRole("textbox", { name: "NIP" });

    await user.type(nipInput, "1234567890");

    expect(nipInput).toHaveValue("1234567890");

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ nip: "1234567890" }),
      );
    });
  });

  test("shows configured shipping options for compact saved order item products", async () => {
    const handleSubmit = vi.fn(
      async (_data: ShippingOptionFormValues) => undefined,
    );

    render(
      <ShippingOptionForm
        handleSubmit={handleSubmit}
        items={[compactSavedOrderItem]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Custom courier")).toBeTruthy();
      expect(screen.getByText("DHL courier")).toBeTruthy();
      expect(screen.getByText("Pickup")).toBeTruthy();
    });
  });

  test("does not filter shipping options by product metadata by default", async () => {
    const handleSubmit = vi.fn(
      async (_data: ShippingOptionFormValues) => undefined,
    );

    render(
      <ShippingOptionForm
        handleSubmit={handleSubmit}
        items={[fullSavedOrderItem]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Custom courier")).toBeTruthy();
      expect(screen.getByText("DHL courier")).toBeTruthy();
      expect(screen.getByText("Pickup")).toBeTruthy();
    });
  });

  test("filters shipping options when the field opts into product filtering", async () => {
    const handleSubmit = vi.fn(
      async (_data: ShippingOptionFormValues) => undefined,
    );

    render(
      <ShippingOptionForm
        handleSubmit={handleSubmit}
        items={[fullSavedOrderItem]}
        formData={productFilteredShippingOptionFormData}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText("Custom courier")).toBeNull();
      expect(screen.queryByText("DHL courier")).toBeNull();
      expect(screen.getByText("Pickup")).toBeTruthy();
    });
  });
});
