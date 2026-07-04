"use client";

import {
  Box,
  Button,
  CloseButton,
  Dialog,
  Field,
  Input,
  Portal,
  Select,
  Separator,
  SimpleGrid,
  Switch,
  Text,
  VStack,
  createListCollection,
} from "@chakra-ui/react";
import {
  Customer as OrderCustomerCard,
  MaterialSymbol,
  RadioGridController,
} from "@konfi/components";
import {
  Address,
  AddressTypeEnum,
  Contact,
  type InvoiceRecipientRole,
  isNestedCustomer,
  Order,
} from "@konfi/types";
import {
  getInvoiceRecipientFromAddress,
  normalizeInvoiceRecipientAddress,
} from "@konfi/utils";
import {
  ComponentProps,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  createEditableAddressFromSelection,
  createEditableOrderAddress,
  getSavedCustomerAddressOptions,
} from "./OrderCustomerInlineEditor.helpers";

export interface OrderCustomerInlineEditorValue {
  customer: Order["customer"];
  contact: Order["contact"];
  shipping: Order["shipping"];
  billing: Order["billing"];
}

interface OrderCustomerInlineEditorProps {
  customerCardProps: ComponentProps<typeof OrderCustomerCard>;
  editable?: boolean;
  onSave?: (value: OrderCustomerInlineEditorValue) => Promise<void>;
}

type EditableCustomerState = {
  name: string;
  personName: string;
  email: string;
  nip: string;
};

function normalizeOptionalValue(value: string | undefined) {
  const trimmedValue = value?.trim() ?? "";
  return trimmedValue || undefined;
}

function createEditableCustomerState(
  customer: Order["customer"],
): EditableCustomerState {
  if (!isNestedCustomer(customer)) {
    return {
      name: customer ?? "",
      personName: "",
      email: "",
      nip: "",
    };
  }

  return {
    name: customer.name ?? "",
    personName: customer.personName ?? "",
    email: customer.email ?? "",
    nip: customer.nip ?? "",
  };
}

function createEditableContact(contact: Order["contact"] | undefined): Contact {
  return {
    name: contact?.name ?? "",
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
    active: contact?.active ?? true,
  };
}

function normalizeContact(contact: Contact): Contact {
  return {
    ...contact,
    name: contact.name.trim(),
    email: normalizeOptionalValue(contact.email),
    phone: normalizeOptionalValue(contact.phone),
  };
}

function normalizeAddress(address: Address | null): Address | null {
  if (!address) {
    return null;
  }

  return normalizeInvoiceRecipientAddress({
    ...address,
    name: address.name.trim(),
    companyName: normalizeOptionalValue(address.companyName),
    nip: normalizeOptionalValue(address.nip),
    invoiceRecipientEnabled: address.invoiceRecipientEnabled ?? false,
    invoiceRecipientRole: address.invoiceRecipientRole ?? "recipient",
    invoiceRecipientRoleDescription:
      address.invoiceRecipientRoleDescription?.trim() ?? "",
    invoiceRecipientName: address.invoiceRecipientName?.trim() ?? "",
    invoiceRecipientNip: address.invoiceRecipientNip?.trim() ?? "",
    invoiceRecipientStreet: address.invoiceRecipientStreet?.trim() ?? "",
    invoiceRecipientZip: address.invoiceRecipientZip?.trim() ?? "",
    invoiceRecipientCity: address.invoiceRecipientCity?.trim() ?? "",
    jstRecipientEnabled: address.jstRecipientEnabled ?? false,
    jstRecipientName: address.jstRecipientName?.trim() ?? "",
    jstRecipientNip: address.jstRecipientNip?.trim() ?? "",
    jstRecipientStreet: address.jstRecipientStreet?.trim() ?? "",
    jstRecipientZip: address.jstRecipientZip?.trim() ?? "",
    jstRecipientCity: address.jstRecipientCity?.trim() ?? "",
    street: normalizeOptionalValue(address.street),
    number: normalizeOptionalValue(address.number),
    local: normalizeOptionalValue(address.local),
    zip: normalizeOptionalValue(address.zip),
    city: normalizeOptionalValue(address.city),
    country: normalizeOptionalValue(address.country) ?? "Polska",
  });
}

function toOrderCustomer(
  originalCustomer: Order["customer"],
  customerState: EditableCustomerState,
): Order["customer"] {
  const normalizedName = customerState.name.trim();

  if (!isNestedCustomer(originalCustomer)) {
    return normalizedName;
  }

  return {
    ...originalCustomer,
    name: normalizedName,
    personName: normalizeOptionalValue(customerState.personName),
    email: normalizeOptionalValue(customerState.email),
    nip: normalizeOptionalValue(customerState.nip),
  };
}

function LabeledInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <Field.Root>
      <Field.Label>{label}</Field.Label>
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field.Root>
  );
}

function createInvoiceRecipientRoleOptions(
  t: ComponentProps<typeof OrderCustomerCard>["t"],
) {
  return [
    {
      label: t("forms.invoiceRecipientRoleOptions.recipient", {
        defaultValue: "Recipient",
      }),
      value: "recipient",
    },
    {
      label: t("forms.invoiceRecipientRoleOptions.additionalBuyer", {
        defaultValue: "Additional buyer",
      }),
      value: "additionalBuyer",
    },
    {
      label: t("forms.invoiceRecipientRoleOptions.payer", {
        defaultValue: "Paying party",
      }),
      value: "payer",
    },
    {
      label: t("forms.invoiceRecipientRoleOptions.jst", {
        defaultValue: "Local government unit",
      }),
      value: "jst",
    },
    {
      label: t("forms.invoiceRecipientRoleOptions.vatGroupMember", {
        defaultValue: "VAT group member",
      }),
      value: "vatGroupMember",
    },
    {
      label: t("forms.invoiceRecipientRoleOptions.employee", {
        defaultValue: "Employee",
      }),
      value: "employee",
    },
    {
      label: t("forms.invoiceRecipientRoleOptions.other", {
        defaultValue: "Other role",
      }),
      value: "other",
    },
  ] satisfies Array<{ label: string; value: InvoiceRecipientRole }>;
}

function LabeledInvoiceRecipientRoleSelect({
  label,
  value,
  onChange,
  t,
}: {
  label: string;
  value: InvoiceRecipientRole;
  onChange: (value: InvoiceRecipientRole) => void;
  t: ComponentProps<typeof OrderCustomerCard>["t"];
}) {
  const options = useMemo(() => createInvoiceRecipientRoleOptions(t), [t]);
  const collection = useMemo(
    () => createListCollection({ items: options }),
    [options],
  );

  return (
    <Field.Root>
      <Field.Label>{label}</Field.Label>
      <Select.Root
        collection={collection}
        value={[value]}
        onValueChange={({ value: nextValue }) => {
          const selectedValue = nextValue[0];
          if (!selectedValue) {
            return;
          }

          onChange(selectedValue as InvoiceRecipientRole);
        }}
      >
        <Select.HiddenSelect />
        <Select.Control>
          <Select.Trigger>
            <Select.ValueText
              placeholder={t("forms.placeholders.invoiceRecipientRole", {
                defaultValue: "Select recipient role",
              })}
            />
          </Select.Trigger>
          <Select.IndicatorGroup>
            <Select.Indicator />
          </Select.IndicatorGroup>
        </Select.Control>
        <Portal>
          <Select.Positioner>
            <Select.Content>
              {collection.items.map((item) => (
                <Select.Item key={item.value} item={item}>
                  {item.label}
                  <Select.ItemIndicator />
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Positioner>
        </Portal>
      </Select.Root>
    </Field.Root>
  );
}

function AddressSection({
  title,
  address,
  onChange,
  savedAddressOptions,
  selectionName,
  onSelectSavedAddress,
  includeCompanyFields = false,
  t,
}: {
  title: string;
  address: Address;
  onChange: (value: Address) => void;
  savedAddressOptions: ComponentProps<typeof RadioGridController>["options"];
  selectionName: string;
  onSelectSavedAddress: (value: string | object) => void;
  includeCompanyFields?: boolean;
  t: ComponentProps<typeof OrderCustomerCard>["t"];
}) {
  const updateAddressField = <K extends keyof Address>(
    key: K,
    value: Address[K],
  ) => {
    const nextAddress = {
      ...address,
      [key]: value,
    };
    onChange(
      includeCompanyFields
        ? normalizeInvoiceRecipientAddress(nextAddress)
        : nextAddress,
    );
  };
  const invoiceRecipient = getInvoiceRecipientFromAddress(address);

  return (
    <VStack align="stretch" gap={4}>
      <Text fontWeight="bold">{title}</Text>
      {savedAddressOptions.length > 0 && (
        <VStack align="stretch" gap={2}>
          <Text fontSize="sm" fontWeight="medium">
            {t("orderPage.customer.savedAddresses", {
              defaultValue: "Saved Addresses",
            })}
          </Text>
          <RadioGridController
            name={selectionName}
            options={savedAddressOptions}
            value={address}
            onChange={onSelectSavedAddress}
            gridColumns={[1, 1, 2]}
          />
        </VStack>
      )}
      <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
        <LabeledInput
          label={t("forms.labels.name", { defaultValue: "Name" })}
          value={address.name}
          onChange={(value) => updateAddressField("name", value)}
        />
        {includeCompanyFields && (
          <LabeledInput
            label={t("forms.labels.companyName", {
              defaultValue: "Company name",
            })}
            value={address.companyName ?? ""}
            onChange={(value) => updateAddressField("companyName", value)}
          />
        )}
        {includeCompanyFields && (
          <LabeledInput
            label={t("forms.labels.nip", { defaultValue: "Tax ID" })}
            value={address.nip ?? ""}
            onChange={(value) => updateAddressField("nip", value)}
          />
        )}
        <LabeledInput
          label={t("forms.labels.street", { defaultValue: "Street" })}
          value={address.street ?? ""}
          onChange={(value) => updateAddressField("street", value)}
        />
        <LabeledInput
          label={t("forms.labels.number", { defaultValue: "Number" })}
          value={address.number ?? ""}
          onChange={(value) => updateAddressField("number", value)}
        />
        <LabeledInput
          label={t("forms.labels.local", { defaultValue: "Apartment" })}
          value={address.local ?? ""}
          onChange={(value) => updateAddressField("local", value)}
        />
        <LabeledInput
          label={t("forms.labels.postalCode", {
            defaultValue: "Postal code",
          })}
          value={address.zip ?? ""}
          onChange={(value) => updateAddressField("zip", value)}
        />
        <LabeledInput
          label={t("forms.labels.city", { defaultValue: "City" })}
          value={address.city ?? ""}
          onChange={(value) => updateAddressField("city", value)}
        />
        <LabeledInput
          label={t("forms.labels.country", { defaultValue: "Country" })}
          value={address.country ?? ""}
          onChange={(value) => updateAddressField("country", value)}
        />
        {includeCompanyFields && (
          <Switch.Root
            checked={invoiceRecipient.enabled}
            onCheckedChange={({ checked }) =>
              updateAddressField("invoiceRecipientEnabled", Boolean(checked))
            }
          >
            <Switch.HiddenInput />
            <Switch.Control />
            <Switch.Label>
              {t("forms.labels.invoiceRecipientEnabled", {
                defaultValue: "Invoice recipient",
              })}
            </Switch.Label>
          </Switch.Root>
        )}
        {includeCompanyFields && invoiceRecipient.enabled && (
          <>
            <LabeledInvoiceRecipientRoleSelect
              label={t("forms.labels.invoiceRecipientRole", {
                defaultValue: "Recipient role",
              })}
              value={invoiceRecipient.role}
              onChange={(value) =>
                updateAddressField("invoiceRecipientRole", value)
              }
              t={t}
            />
            {invoiceRecipient.role === "other" && (
              <LabeledInput
                label={t("forms.labels.invoiceRecipientRoleDescription", {
                  defaultValue: "Role description",
                })}
                value={invoiceRecipient.roleDescription}
                onChange={(value) =>
                  updateAddressField("invoiceRecipientRoleDescription", value)
                }
              />
            )}
            <LabeledInput
              label={t("forms.labels.invoiceRecipientName", {
                defaultValue: "Recipient name",
              })}
              value={invoiceRecipient.name}
              onChange={(value) =>
                updateAddressField("invoiceRecipientName", value)
              }
            />
            <LabeledInput
              label={t("forms.labels.invoiceRecipientNip", {
                defaultValue: "Recipient NIP",
              })}
              value={invoiceRecipient.nip}
              onChange={(value) =>
                updateAddressField("invoiceRecipientNip", value)
              }
            />
            <LabeledInput
              label={t("forms.labels.invoiceRecipientStreet", {
                defaultValue: "Recipient street",
              })}
              value={invoiceRecipient.street}
              onChange={(value) =>
                updateAddressField("invoiceRecipientStreet", value)
              }
            />
            <LabeledInput
              label={t("forms.labels.invoiceRecipientPostalCode", {
                defaultValue: "Recipient postal code",
              })}
              value={invoiceRecipient.zip}
              onChange={(value) =>
                updateAddressField("invoiceRecipientZip", value)
              }
            />
            <LabeledInput
              label={t("forms.labels.invoiceRecipientCity", {
                defaultValue: "Recipient city",
              })}
              value={invoiceRecipient.city}
              onChange={(value) =>
                updateAddressField("invoiceRecipientCity", value)
              }
            />
          </>
        )}
      </SimpleGrid>
    </VStack>
  );
}

export function OrderCustomerInlineEditor({
  customerCardProps,
  editable = false,
  onSave,
}: OrderCustomerInlineEditorProps) {
  const { customer, contact, shipping, billing, invoice, t } =
    customerCardProps;
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [customerState, setCustomerState] = useState<EditableCustomerState>(
    createEditableCustomerState(customer),
  );
  const [contactState, setContactState] = useState<Contact>(
    createEditableContact(contact),
  );
  const [shippingState, setShippingState] = useState<Address | null>(
    createEditableOrderAddress(shipping, AddressTypeEnum.SHIPPING),
  );
  const [billingState, setBillingState] = useState<Address | null>(
    createEditableOrderAddress(billing, AddressTypeEnum.BILLING),
  );

  useEffect(() => {
    if (isEditing) {
      return;
    }

    setCustomerState(createEditableCustomerState(customer));
    setContactState(createEditableContact(contact));
    setShippingState(
      createEditableOrderAddress(shipping, AddressTypeEnum.SHIPPING),
    );
    setBillingState(
      createEditableOrderAddress(billing, AddressTypeEnum.BILLING),
    );
  }, [billing, contact, customer, isEditing, shipping]);

  const shippingAddressOptions = useMemo(
    () => getSavedCustomerAddressOptions(customer, AddressTypeEnum.SHIPPING),
    [customer],
  );

  const billingAddressOptions = useMemo(
    () => getSavedCustomerAddressOptions(customer, AddressTypeEnum.BILLING),
    [customer],
  );

  const canSave = useMemo(
    () =>
      customerState.name.trim().length > 0 &&
      contactState.name.trim().length > 0,
    [contactState.name, customerState.name],
  );

  const handleStartEditing = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setCustomerState(createEditableCustomerState(customer));
    setContactState(createEditableContact(contact));
    setShippingState(
      createEditableOrderAddress(shipping, AddressTypeEnum.SHIPPING),
    );
    setBillingState(
      createEditableOrderAddress(billing, AddressTypeEnum.BILLING),
    );
  }, [billing, contact, customer, shipping]);

  const handleSave = useCallback(async () => {
    if (!onSave || !canSave) {
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        customer: toOrderCustomer(customer, customerState),
        contact: normalizeContact(contactState),
        shipping: normalizeAddress(shippingState),
        billing: invoice ? normalizeAddress(billingState) : (billing ?? null),
      });
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save order customer details:", error);
      setCustomerState(createEditableCustomerState(customer));
      setContactState(createEditableContact(contact));
      setShippingState(
        createEditableOrderAddress(shipping, AddressTypeEnum.SHIPPING),
      );
      setBillingState(
        createEditableOrderAddress(billing, AddressTypeEnum.BILLING),
      );
    } finally {
      setIsSaving(false);
    }
  }, [
    billing,
    billingState,
    canSave,
    contact,
    contactState,
    customer,
    customerState,
    invoice,
    onSave,
    shipping,
    shippingState,
  ]);

  if (!editable || !onSave) {
    return <OrderCustomerCard {...customerCardProps} />;
  }

  return (
    <>
      <Box position="relative">
        <Button
          position="absolute"
          top={0}
          right={0}
          size="sm"
          variant="surface"
          onClick={handleStartEditing}
          className="noprint"
          zIndex={1}
        >
          <MaterialSymbol>edit</MaterialSymbol>
          {t("common.edit", {
            defaultValue: "Edit",
          })}
        </Button>
        <OrderCustomerCard {...customerCardProps} />
      </Box>

      <Dialog.Root
        open={isEditing}
        onOpenChange={({ open }) => {
          if (!open) {
            handleCancel();
            return;
          }

          setIsEditing(true);
        }}
        placement="center"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner px={{ base: 4, md: 6 }} py={{ base: 4, md: 6 }}>
            <Dialog.Content
              maxH={{ base: "calc(100vh - 2rem)", md: "calc(100vh - 3rem)" }}
              maxW="4xl"
              overflow="hidden"
              w="full"
            >
              <Dialog.CloseTrigger asChild>
                <CloseButton />
              </Dialog.CloseTrigger>
              <Dialog.Header>
                <Dialog.Title>
                  {t("admin.editCustomer", {
                    defaultValue: "Edit customer",
                  })}
                </Dialog.Title>
              </Dialog.Header>
              <Dialog.Body overflowY="auto" overscrollBehavior="contain">
                <VStack align="stretch" gap={6}>
                  <VStack align="stretch" gap={4}>
                    <Text fontWeight="bold">
                      {t("orderPage.customer.heading", {
                        defaultValue: "Customer",
                      })}
                    </Text>
                    <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
                      <LabeledInput
                        label={t("forms.labels.name", {
                          defaultValue: "Name",
                        })}
                        value={customerState.name}
                        onChange={(value) =>
                          setCustomerState((currentValue) => ({
                            ...currentValue,
                            name: value,
                          }))
                        }
                      />
                      {isNestedCustomer(customer) && (
                        <LabeledInput
                          label={t("forms.labels.personName", {
                            defaultValue: "Contact person",
                          })}
                          value={customerState.personName}
                          onChange={(value) =>
                            setCustomerState((currentValue) => ({
                              ...currentValue,
                              personName: value,
                            }))
                          }
                        />
                      )}
                      {isNestedCustomer(customer) && (
                        <LabeledInput
                          label={t("forms.labels.email", {
                            defaultValue: "Email",
                          })}
                          value={customerState.email}
                          onChange={(value) =>
                            setCustomerState((currentValue) => ({
                              ...currentValue,
                              email: value,
                            }))
                          }
                          type="email"
                        />
                      )}
                      {isNestedCustomer(customer) && (
                        <LabeledInput
                          label={t("forms.labels.nip", {
                            defaultValue: "Tax ID",
                          })}
                          value={customerState.nip}
                          onChange={(value) =>
                            setCustomerState((currentValue) => ({
                              ...currentValue,
                              nip: value,
                            }))
                          }
                        />
                      )}
                    </SimpleGrid>
                  </VStack>
                  <Separator />
                  <VStack align="stretch" gap={4}>
                    <Text fontWeight="bold">
                      {t("orderPage.customer.contact", {
                        defaultValue: "Contact",
                      })}
                    </Text>
                    <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
                      <LabeledInput
                        label={t("forms.labels.fullName", {
                          defaultValue: "Full name",
                        })}
                        value={contactState.name}
                        onChange={(value) =>
                          setContactState((currentValue) => ({
                            ...currentValue,
                            name: value,
                          }))
                        }
                      />
                      <LabeledInput
                        label={t("forms.labels.email", {
                          defaultValue: "Email",
                        })}
                        value={contactState.email ?? ""}
                        onChange={(value) =>
                          setContactState((currentValue) => ({
                            ...currentValue,
                            email: value,
                          }))
                        }
                        type="email"
                      />
                      <LabeledInput
                        label={t("forms.labels.phone", {
                          defaultValue: "Phone",
                        })}
                        value={contactState.phone ?? ""}
                        onChange={(value) =>
                          setContactState((currentValue) => ({
                            ...currentValue,
                            phone: value,
                          }))
                        }
                        type="tel"
                      />
                    </SimpleGrid>
                  </VStack>
                  {shippingState && (
                    <>
                      <Separator />
                      <AddressSection
                        title={t("orderPage.customer.shipping", {
                          defaultValue: "Shipping",
                        })}
                        address={shippingState}
                        onChange={setShippingState}
                        savedAddressOptions={shippingAddressOptions}
                        selectionName="order-shipping-address"
                        onSelectSavedAddress={(value) => {
                          const selectedAddress =
                            createEditableAddressFromSelection(
                              value,
                              AddressTypeEnum.SHIPPING,
                            );

                          if (selectedAddress) {
                            setShippingState(selectedAddress);
                          }
                        }}
                        t={t}
                      />
                    </>
                  )}
                  {invoice && billingState && (
                    <>
                      <Separator />
                      <AddressSection
                        title={t("orderPage.customer.billing", {
                          defaultValue: "Billing",
                        })}
                        address={billingState}
                        onChange={setBillingState}
                        savedAddressOptions={billingAddressOptions}
                        selectionName="order-billing-address"
                        onSelectSavedAddress={(value) => {
                          const selectedAddress =
                            createEditableAddressFromSelection(
                              value,
                              AddressTypeEnum.BILLING,
                            );

                          if (selectedAddress) {
                            setBillingState(selectedAddress);
                          }
                        }}
                        includeCompanyFields
                        t={t}
                      />
                    </>
                  )}
                </VStack>
              </Dialog.Body>
              <Dialog.Footer>
                <Button
                  variant="ghost"
                  colorPalette="red"
                  onClick={handleCancel}
                  disabled={isSaving}
                >
                  <MaterialSymbol>close</MaterialSymbol>
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </Button>
                <Button
                  variant="surface"
                  colorPalette="success"
                  onClick={handleSave}
                  disabled={!canSave || isSaving}
                  loading={isSaving}
                >
                  <MaterialSymbol>check</MaterialSymbol>
                  {t("common.save", { defaultValue: "Save" })}
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </>
  );
}
