"use client";

import {
  Alert,
  Button,
  Card,
  Collapsible,
  Combobox,
  createListCollection,
  Fieldset,
  HStack,
  Input,
  Link,
  Portal,
  Presence,
  Select,
  SimpleGrid,
  Spinner,
  Switch,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import type { ListCollection } from "@chakra-ui/react";
import { Field, InfoTip, MaterialSymbol } from "@konfi/components";
import { InvoiceKindObject } from "@konfi/fakturownia/client/models";
import type { Client } from "@konfi/fakturownia/out/client/models";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useMemo } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { useT } from "@/i18n/client";
import {
  FAKTUROWNIA_COUNTRY_OPTIONS,
  normalizeCountryCode,
} from "@/lib/fakturownia/country";
import { filterLocalFuseItems } from "@/lib/local-fuse-search";
import {
  extractTaxIdDigits,
  getFakturowniaClientTaxNo,
} from "./invoice-helpers";
import { OverdueInvoicesAlert } from "./OverdueInvoicesAlert";
import type {
  ClientOptionItem,
  InvoiceFormValues,
  RecipientRoleOptionValue,
} from "./invoice-form-types";
import {
  FACTUROWNIA_RECIPIENT_JST_HELP_URL,
  FACTUROWNIA_RECIPIENT_VAT_GROUP_HELP_URL,
  RECIPIENT_ROLE_OPTIONS,
} from "./invoice-form-types";

interface SelectOption {
  value: string;
  label: string;
}

interface SellerMember {
  name?: string | null;
}

interface FakturowniaInvoicePartiesSectionProps {
  filteredMembers: SellerMember[] | null;
  sellerPersonFilterTerm: string;
  setSellerPersonFilterTerm: Dispatch<SetStateAction<string>>;
  loadingMembers: boolean;
  sellerDefaultName: string;
  sellerDefaultTaxNo: string;
  sellerDefaultStreet: string;
  sellerDefaultPostalCode: string;
  sellerDefaultCity: string;
  buyerCompany: boolean;
  isBuyerNameRequired: boolean;
  isBuyerLastNameRequired: boolean;
  buyerClientSuggestions: Client[];
  buyerNameInputValue: string;
  setBuyerNameInputValue: Dispatch<SetStateAction<string>>;
  clientId?: string;
  setBuyerClientDescription: Dispatch<SetStateAction<string | undefined>>;
  handleBuyerClientSelection: (client: Client) => void;
  buyerClientDescription?: string;
  isBuyerComboboxLoading: boolean;
  isBuyerNipLookupLoading: boolean;
  handleSearchBuyerByNip: (nip: string) => void;
  isBuyerDetailsOpen: boolean;
  setIsBuyerDetailsOpen: Dispatch<SetStateAction<boolean>>;
  recipientJstEnabled: boolean;
  recipientVatGroupEnabled: boolean;
  recipientEnabled: boolean;
  recipientRole: RecipientRoleOptionValue;
  shouldShowRecipientRoleDescription: boolean;
  recipientClientSuggestions: Client[];
  recipientNameInputValue: string;
  setRecipientNameInputValue: Dispatch<SetStateAction<string>>;
  recipientId?: string;
  applyRecipientClientData: (client: Client) => void;
  isRecipientComboboxLoading: boolean;
  isRecipientNipLookupLoading: boolean;
  handleSearchRecipientByNip: (nip: string) => void;
  isRecipientDetailsOpen: boolean;
  setIsRecipientDetailsOpen: Dispatch<SetStateAction<boolean>>;
  fillMissingRecipientTaxNoFromFakturowniaRecipient: () => Promise<void>;
  lastNonSpecialRecipientRoleRef: MutableRefObject<RecipientRoleOptionValue>;
}

export function FakturowniaInvoicePartiesSection({
  filteredMembers,
  sellerPersonFilterTerm,
  setSellerPersonFilterTerm,
  loadingMembers,
  sellerDefaultName,
  sellerDefaultTaxNo,
  sellerDefaultStreet,
  sellerDefaultPostalCode,
  sellerDefaultCity,
  buyerCompany,
  isBuyerNameRequired,
  isBuyerLastNameRequired,
  buyerClientSuggestions,
  buyerNameInputValue,
  setBuyerNameInputValue,
  clientId,
  setBuyerClientDescription,
  handleBuyerClientSelection,
  buyerClientDescription,
  isBuyerComboboxLoading,
  isBuyerNipLookupLoading,
  handleSearchBuyerByNip,
  isBuyerDetailsOpen,
  setIsBuyerDetailsOpen,
  recipientJstEnabled,
  recipientVatGroupEnabled,
  recipientEnabled,
  recipientRole,
  shouldShowRecipientRoleDescription,
  recipientClientSuggestions,
  recipientNameInputValue,
  setRecipientNameInputValue,
  recipientId,
  applyRecipientClientData,
  isRecipientComboboxLoading,
  isRecipientNipLookupLoading,
  handleSearchRecipientByNip,
  isRecipientDetailsOpen,
  setIsRecipientDetailsOpen,
  fillMissingRecipientTaxNoFromFakturowniaRecipient,
  lastNonSpecialRecipientRoleRef,
}: FakturowniaInvoicePartiesSectionProps) {
  const { t } = useT(["fakturownia", "translation"]);
  const {
    control,
    setValue,
    formState: { errors },
  } = useFormContext<InvoiceFormValues>();
  const sellerPersonOptions = useMemo(
    () =>
      (filteredMembers ?? [])
        .filter((memberItem) => Boolean(memberItem.name))
        .map((memberItem) => ({
          value: memberItem.name ?? "",
          label: memberItem.name ?? "",
        })),
    [filteredMembers],
  );
  const sellerPersonCollection = useMemo(
    () =>
      createListCollection({
        items: sellerPersonOptions,
        itemToValue: (item) => item.value,
        itemToString: (item) => item.label,
      }),
    [sellerPersonOptions],
  );
  const filteredSellerPersonItems = useMemo(() => {
    return filterLocalFuseItems(
      sellerPersonCollection.items,
      sellerPersonFilterTerm,
      {
        keys: ["label"],
        threshold: 0.34,
      },
    );
  }, [sellerPersonCollection, sellerPersonFilterTerm]);
  const countryOptionsCollection = useMemo<ListCollection<SelectOption>>(
    () =>
      createListCollection({
        items: FAKTUROWNIA_COUNTRY_OPTIONS.map((option) => ({
          value: option.value,
          label: t(`fakturownia.invoiceCreate.countryOptions.${option.value}`, {
            defaultValue: option.defaultLabel,
          }),
        })),
        itemToValue: (item) => item.value,
        itemToString: (item) => item.label,
      }),
    [t],
  );
  const recipientRoleOptions = useMemo(
    () =>
      RECIPIENT_ROLE_OPTIONS.map((option) => ({
        value: option.value,
        label: t(option.labelKey, { defaultValue: option.fallback }),
        apiValue: option.apiValue,
      })),
    [t],
  );
  const recipientRoleCollection = useMemo(
    () =>
      createListCollection({
        items: recipientRoleOptions,
        itemToValue: (item) => item.value,
        itemToString: (item) => item.label,
      }),
    [recipientRoleOptions],
  );
  const buyerClientOptionsCollection = useClientOptionCollection(
    buyerClientSuggestions,
    t("fakturownia.invoiceCreate.buyerTaxNo", {
      defaultValue: "Buyer Tax ID",
    }),
  );
  const recipientClientOptionsCollection = useClientOptionCollection(
    recipientClientSuggestions,
    t("fakturownia.invoiceCreate.recipientTaxNo", {
      defaultValue: "Recipient Tax ID",
    }),
  );
  const recipientJstTooltipContent = useMemo(
    () => (
      <VStack maxW="sm" align="start" gap={2}>
        <Text textStyle="xs">
          {t("fakturownia.invoiceCreate.recipientJstTooltip.summary", {
            defaultValue:
              "Select this option when the invoice is issued for a local government unit (JST), for example a municipality, district, or voivodeship.",
          })}
        </Text>
        <Text textStyle="xs">
          {t("fakturownia.invoiceCreate.recipientJstTooltip.details", {
            defaultValue:
              "Due to VAT centralization, the buyer shown on the invoice may be the JST, while the actual recipient of the goods or services is its subordinate unit (for example a school or another budgetary unit). In that case the invoice should be issued to the JST, with the subordinate unit details optionally added as the recipient.",
          })}
        </Text>
        <Link
          href={FACTUROWNIA_RECIPIENT_JST_HELP_URL}
          target="_blank"
          rel="noopener noreferrer"
          textStyle="xs"
        >
          {t("fakturownia.invoiceCreate.recipientJstTooltip.linkLabel", {
            defaultValue: "Read more in Fakturownia help",
          })}
        </Link>
      </VStack>
    ),
    [t],
  );
  const recipientVatGroupTooltipContent = useMemo(
    () => (
      <VStack maxW="sm" align="start" gap={2}>
        <Text textStyle="xs">
          {t("fakturownia.invoiceCreate.recipientVatGroupTooltip.summary", {
            defaultValue:
              "Select this option when the invoice is issued for an entity that is a member of a VAT group.",
          })}
        </Text>
        <Text textStyle="xs">
          {t("fakturownia.invoiceCreate.recipientVatGroupTooltip.details", {
            defaultValue:
              "A VAT group is a special kind of VAT taxpayer made up of at least two entities linked financially, economically, and organizationally, and treated as one taxpayer for VAT settlements.",
          })}
        </Text>
        <Text textStyle="xs">
          {t("fakturownia.invoiceCreate.recipientVatGroupTooltip.note", {
            defaultValue:
              "In that case the buyer shown on the invoice is the VAT group itself (using its own VAT tax ID), with the option to additionally indicate the group member that the transaction actually concerns. The member has its own tax ID, but does not use it for VAT settlements.",
          })}
        </Text>
        <Link
          href={FACTUROWNIA_RECIPIENT_VAT_GROUP_HELP_URL}
          target="_blank"
          rel="noopener noreferrer"
          textStyle="xs"
        >
          {t("fakturownia.invoiceCreate.recipientVatGroupTooltip.linkLabel", {
            defaultValue: "Read more in Fakturownia help",
          })}
        </Link>
      </VStack>
    ),
    [t],
  );

  return (
    <HStack gap={4} align="start">
      <Fieldset.Root>
        <Fieldset.Legend fontSize={"xl"}>
          {t("fakturownia.invoiceCreate.seller", {
            defaultValue: "Seller",
          })}
        </Fieldset.Legend>
        <Fieldset.Content>
          <VStack columns={{ base: 1, md: 1 }} gap={4}>
            <Field
              label={t("fakturownia.invoiceCreate.sellerPerson", {
                defaultValue: "Seller person",
              })}
            >
              <Controller
                name="sellerPerson"
                control={control}
                render={({ field }) => {
                  const normalizedSelected =
                    typeof field.value === "string" &&
                    sellerPersonCollection.items.some(
                      (item) => item.value === field.value,
                    )
                      ? [field.value]
                      : [];

                  const displayValue =
                    sellerPersonFilterTerm !== ""
                      ? sellerPersonFilterTerm
                      : (field.value ?? "");

                  return (
                    <Combobox.Root
                      allowCustomValue
                      collection={sellerPersonCollection}
                      inputValue={displayValue}
                      value={normalizedSelected}
                      onInputValueChange={(details) => {
                        const nextValue = details.inputValue ?? "";
                        setSellerPersonFilterTerm(nextValue);
                      }}
                      onValueChange={(details) => {
                        const selectedItem = details.items[0] as
                          | { value: string; label: string }
                          | undefined;
                        if (selectedItem) {
                          field.onChange(selectedItem.value);
                          setSellerPersonFilterTerm("");
                          return;
                        }
                        if (details.items.length === 0) {
                          const currentFilterValue =
                            sellerPersonFilterTerm.trim();
                          field.onChange(currentFilterValue);
                          setSellerPersonFilterTerm("");
                        }
                      }}
                      onOpenChange={(details) => {
                        if (!details.open) {
                          const currentFilterValue =
                            sellerPersonFilterTerm.trim();
                          if (
                            currentFilterValue !== "" &&
                            currentFilterValue !== field.value
                          ) {
                            field.onChange(currentFilterValue);
                          }
                          setSellerPersonFilterTerm("");
                        }
                      }}
                      openOnClick
                      selectionBehavior="replace"
                    >
                      <Combobox.Control>
                        <Combobox.Input
                          ref={field.ref}
                          onBlur={field.onBlur}
                          placeholder={
                            loadingMembers
                              ? t("common.loading", {
                                  defaultValue: "Loading...",
                                })
                              : t(
                                  "fakturownia.invoiceCreate.selectSellerPerson",
                                  { defaultValue: "Select seller" },
                                )
                          }
                        />
                        <Combobox.IndicatorGroup>
                          <Combobox.ClearTrigger
                            aria-label={t("common.clear", {
                              defaultValue: "Clear",
                            })}
                          />
                          <Combobox.Trigger />
                        </Combobox.IndicatorGroup>
                      </Combobox.Control>
                      <Portal>
                        <Combobox.Positioner>
                          <Combobox.Content>
                            {loadingMembers ? (
                              <HStack gap={2} p={2}>
                                <Spinner size="xs" />
                                <Text textStyle="sm">
                                  {t("common.loading", {
                                    defaultValue: "Loading...",
                                  })}
                                </Text>
                              </HStack>
                            ) : filteredSellerPersonItems.length === 0 ? (
                              <Combobox.Empty>
                                {t("common.noResults", {
                                  defaultValue: "No results",
                                })}
                              </Combobox.Empty>
                            ) : (
                              filteredSellerPersonItems.map((item, index) => (
                                <Combobox.Item
                                  key={`${item.value}${index}`}
                                  item={item}
                                >
                                  <Text flex="1" fontWeight="medium">
                                    {item.label}
                                  </Text>
                                  <Combobox.ItemIndicator />
                                </Combobox.Item>
                              ))
                            )}
                          </Combobox.Content>
                        </Combobox.Positioner>
                      </Portal>
                    </Combobox.Root>
                  );
                }}
              />
            </Field>
            <Field
              label={t("fakturownia.invoiceCreate.sellerName", {
                defaultValue: "Seller name",
              })}
              invalid={!!errors.sellerName}
              errorText={errors.sellerName?.message}
            >
              <Controller
                name="sellerName"
                control={control}
                render={({ field }) => (
                  <Input {...field} disabled={!!sellerDefaultName} />
                )}
              />
            </Field>
            <Field
              label={t("fakturownia.invoiceCreate.sellerTaxNo", {
                defaultValue: "Tax ID",
              })}
            >
              <Controller
                name="sellerTaxNo"
                control={control}
                render={({ field }) => (
                  <Input {...field} disabled={!!sellerDefaultTaxNo} />
                )}
              />
            </Field>
            <Field
              label={t("fakturownia.invoiceCreate.sellerStreet", {
                defaultValue: "Street",
              })}
            >
              <Controller
                name="sellerStreet"
                control={control}
                render={({ field }) => (
                  <Input {...field} disabled={!!sellerDefaultStreet} />
                )}
              />
            </Field>
            <HStack w="100%" gap={4}>
              <Field
                w="33%"
                label={t("fakturownia.invoiceCreate.sellerPostalCode", {
                  defaultValue: "Postal code",
                })}
              >
                <Controller
                  name="sellerPostalCode"
                  control={control}
                  render={({ field }) => (
                    <Input {...field} disabled={!!sellerDefaultPostalCode} />
                  )}
                />
              </Field>
              <Field
                label={t("fakturownia.invoiceCreate.sellerCity", {
                  defaultValue: "City",
                })}
              >
                <Controller
                  name="sellerCity"
                  control={control}
                  render={({ field }) => (
                    <Input {...field} disabled={!!sellerDefaultCity} />
                  )}
                />
              </Field>
            </HStack>
          </VStack>
        </Fieldset.Content>
      </Fieldset.Root>

      <Fieldset.Root position="relative">
        <Field
          position="absolute"
          alignItems="self-end"
          top={-6}
          right={0}
          label={t("fakturownia.invoiceCreate.buyerType", {
            defaultValue: "Buyer type",
          })}
        >
          <Controller
            name="buyerCompany"
            control={control}
            render={({ field }) => (
              <Switch.Root
                name={field.name}
                checked={field.value}
                onCheckedChange={({ checked }) => field.onChange(checked)}
              >
                <Switch.HiddenInput ref={field.ref} onBlur={field.onBlur} />
                <Switch.Control />
                <Switch.Label>
                  {field.value
                    ? t("fakturownia.invoiceCreate.buyerCompanyLabel", {
                        defaultValue: "Company",
                      })
                    : t("fakturownia.invoiceCreate.buyerPrivateLabel", {
                        defaultValue: "Private person",
                      })}
                </Switch.Label>
              </Switch.Root>
            )}
          />
        </Field>
        <Fieldset.Legend fontSize={"xl"}>
          {t("fakturownia.invoiceCreate.buyer", { defaultValue: "Buyer" })}
        </Fieldset.Legend>
        <Fieldset.Content>
          <VStack columns={{ base: 1, md: 1 }} gap={4}>
            <VStack w="100%" columns={{ base: 1, md: 1 }} gap={4}>
              {buyerCompany ? (
                <>
                  <Field
                    label={t("fakturownia.invoiceCreate.buyerName", {
                      defaultValue: "Buyer name",
                    })}
                    invalid={!!errors.buyerName}
                    errorText={errors.buyerName?.message}
                    required={isBuyerNameRequired}
                  >
                    <Controller
                      name="buyerName"
                      control={control}
                      render={({ field }) => (
                        <Combobox.Root
                          allowCustomValue
                          collection={buyerClientOptionsCollection}
                          inputValue={buyerNameInputValue}
                          onInputValueChange={(details) => {
                            const nextValue = details.inputValue ?? "";
                            setBuyerNameInputValue(nextValue);
                            field.onChange(nextValue);
                            // Clear client ID when user modifies the text
                            if (clientId) {
                              setValue("clientId", undefined, {
                                shouldDirty: true,
                                shouldTouch: true,
                                shouldValidate: true,
                              });
                              setBuyerClientDescription(undefined);
                            }
                          }}
                          value={clientId ? [clientId] : []}
                          onValueChange={(details) => {
                            const selectedItem = details.items[0] as
                              | ClientOptionItem
                              | undefined;
                            if (selectedItem) {
                              handleBuyerClientSelection(selectedItem.client);
                              setBuyerNameInputValue(
                                selectedItem.client.name || "",
                              );
                            } else {
                              setValue("clientId", undefined, {
                                shouldDirty: true,
                                shouldTouch: true,
                                shouldValidate: true,
                              });
                              setBuyerClientDescription(undefined);
                            }
                          }}
                          openOnClick
                          selectionBehavior="replace"
                        >
                          <Combobox.Control>
                            <Combobox.Input
                              placeholder={t(
                                "fakturownia.invoiceCreate.buyerNamePlaceholder",
                                {
                                  defaultValue: "Search or enter buyer name",
                                },
                              )}
                              onBlur={field.onBlur}
                            />
                            <Combobox.IndicatorGroup>
                              <Combobox.ClearTrigger
                                aria-label={t("common.clear", {
                                  defaultValue: "Clear",
                                })}
                              />
                              <Combobox.Trigger />
                            </Combobox.IndicatorGroup>
                          </Combobox.Control>
                          <Portal>
                            <Combobox.Positioner>
                              <Combobox.Content>
                                {isBuyerComboboxLoading ? (
                                  <HStack gap={2} p={2}>
                                    <Spinner size="xs" />
                                    <Text textStyle="sm">
                                      {t(
                                        "fakturownia.invoiceCreate.clientSearchLoading",
                                        {
                                          defaultValue: "Searching clients...",
                                        },
                                      )}
                                    </Text>
                                  </HStack>
                                ) : (
                                  <>
                                    <Combobox.Empty>
                                      {t(
                                        "fakturownia.invoiceCreate.clientSearchEmpty",
                                        {
                                          defaultValue: "No clients found",
                                        },
                                      )}
                                    </Combobox.Empty>
                                    {buyerClientOptionsCollection.items.map(
                                      (item, index) => (
                                        <Combobox.Item
                                          item={item}
                                          key={`${item.value}-${index}`}
                                        >
                                          <VStack
                                            align="start"
                                            gap={0}
                                            flex="1"
                                          >
                                            <Text fontWeight="medium">
                                              {item.label}
                                            </Text>
                                            {item.secondaryLabel && (
                                              <Text
                                                textStyle="sm"
                                                color="fg.muted"
                                              >
                                                {item.secondaryLabel}
                                              </Text>
                                            )}
                                          </VStack>
                                          <Combobox.ItemIndicator />
                                        </Combobox.Item>
                                      ),
                                    )}
                                  </>
                                )}
                              </Combobox.Content>
                            </Combobox.Positioner>
                          </Portal>
                        </Combobox.Root>
                      )}
                    />
                  </Field>
                  {buyerClientDescription &&
                    buyerClientDescription.trim() !== "" && (
                      <Alert.Root status="warning" variant="subtle" mt={2}>
                        <Alert.Indicator />
                        <Alert.Content>
                          <Alert.Description>
                            {buyerClientDescription}
                          </Alert.Description>
                        </Alert.Content>
                      </Alert.Root>
                    )}
                  <OverdueInvoicesAlert clientId={clientId} mt={2} />
                  <Field
                    w="100%"
                    label={t("fakturownia.invoiceCreate.buyerTaxNo", {
                      defaultValue: "Buyer Tax ID",
                    })}
                  >
                    <Controller
                      name="buyerTaxNo"
                      control={control}
                      render={({ field }) => (
                        <HStack w="100%" gap={2}>
                          <Input
                            {...field}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter") {
                                return;
                              }

                              event.preventDefault();

                              if (isBuyerNipLookupLoading) {
                                return;
                              }

                              handleSearchBuyerByNip(field.value || "");
                            }}
                          />
                          <Button
                            size="sm"
                            loading={isBuyerNipLookupLoading}
                            disabled={isBuyerNipLookupLoading}
                            onClick={() =>
                              handleSearchBuyerByNip(field.value || "")
                            }
                            colorPalette="primary"
                          >
                            {t("fakturownia.invoiceCreate.searchClient", {
                              defaultValue: "Find client",
                            })}
                          </Button>
                        </HStack>
                      )}
                    />
                  </Field>
                </>
              ) : (
                <>
                  <Field
                    label={t("fakturownia.invoiceCreate.buyerFirstName", {
                      defaultValue: "First name",
                    })}
                    invalid={!!errors.buyerFirstName}
                    errorText={errors.buyerFirstName?.message}
                  >
                    <Controller
                      name="buyerFirstName"
                      control={control}
                      render={({ field }) => <Input {...field} />}
                    />
                  </Field>
                  <Field
                    label={t("fakturownia.invoiceCreate.buyerLastName", {
                      defaultValue: "Last name",
                    })}
                    invalid={!!errors.buyerLastName}
                    errorText={errors.buyerLastName?.message}
                    required={isBuyerLastNameRequired}
                  >
                    <Controller
                      name="buyerLastName"
                      control={control}
                      render={({ field }) => <Input {...field} />}
                    />
                  </Field>
                </>
              )}

              <Field
                label={t("fakturownia.invoiceCreate.buyerStreet", {
                  defaultValue: "Street",
                })}
              >
                <Controller
                  name="buyerStreet"
                  control={control}
                  render={({ field }) => <Input {...field} />}
                />
              </Field>
              <HStack w="100%" gap={4}>
                <Field
                  w="33%"
                  label={t("fakturownia.invoiceCreate.buyerPostalCode", {
                    defaultValue: "Postal code",
                  })}
                >
                  <Controller
                    name="buyerPostalCode"
                    control={control}
                    render={({ field }) => <Input {...field} />}
                  />
                </Field>
                <Field
                  label={t("fakturownia.invoiceCreate.buyerCity", {
                    defaultValue: "City",
                  })}
                >
                  <Controller
                    name="buyerCity"
                    control={control}
                    render={({ field }) => <Input {...field} />}
                  />
                </Field>
              </HStack>

              {/* Send email toggle */}
              <Field
                label={t("fakturownia.invoiceCreate.sendEmail")}
                helperText={t("fakturownia.invoiceCreate.sendEmail.help")}
              >
                <Controller
                  name="sendEmail"
                  control={control}
                  render={({ field }) => (
                    <Switch.Root
                      name={field.name}
                      checked={field.value}
                      onCheckedChange={({ checked }: { checked: boolean }) =>
                        field.onChange(checked)
                      }
                    >
                      <Switch.HiddenInput
                        ref={field.ref}
                        onBlur={field.onBlur}
                      />
                      <Switch.Control />
                      <Switch.Label>
                        {t("fakturownia.invoiceCreate.sendEmail.toggle")}
                      </Switch.Label>
                    </Switch.Root>
                  )}
                />
              </Field>

              <Collapsible.Root
                w="100%"
                open={isBuyerDetailsOpen}
                onOpenChange={({ open }) => setIsBuyerDetailsOpen(open)}
                colorPalette="primary"
              >
                <Collapsible.Trigger asChild>
                  <Button
                    w="100%"
                    type="button"
                    variant="surface"
                    alignSelf="end"
                    size="xs"
                    gap={2}
                  >
                    <MaterialSymbol>
                      {isBuyerDetailsOpen ? "expand_less" : "expand_more"}
                    </MaterialSymbol>
                    {isBuyerDetailsOpen
                      ? t("fakturownia.invoiceCreate.hideBuyerContactDetails", {
                          defaultValue: "Hide buyer contact details",
                        })
                      : t("fakturownia.invoiceCreate.showBuyerContactDetails", {
                          defaultValue: "Show buyer contact details",
                        })}
                  </Button>
                </Collapsible.Trigger>
                <Collapsible.Content>
                  <VStack gap={4} mt={4}>
                    <Field
                      label={t("fakturownia.invoiceCreate.buyerEmail", {
                        defaultValue: "Email",
                      })}
                    >
                      <Controller
                        name="buyerEmail"
                        control={control}
                        render={({ field }) => (
                          <Input type="email" {...field} />
                        )}
                      />
                    </Field>
                    <Field
                      label={t("fakturownia.invoiceCreate.buyerPhone", {
                        defaultValue: "Phone",
                      })}
                    >
                      <Controller
                        name="buyerPhone"
                        control={control}
                        render={({ field }) => <Input {...field} />}
                      />
                    </Field>
                    <Field
                      label={t("fakturownia.invoiceCreate.buyerPerson", {
                        defaultValue: "Recipient person",
                      })}
                    >
                      <Controller
                        name="buyerPerson"
                        control={control}
                        render={({ field }) => <Input {...field} />}
                      />
                    </Field>
                    <Field
                      label={t("fakturownia.invoiceCreate.buyerCountry", {
                        defaultValue: "Country",
                      })}
                    >
                      <Controller
                        name="buyerCountry"
                        control={control}
                        render={({ field }) => {
                          const normalizedValue = normalizeCountryCode(
                            field.value,
                          );

                          return (
                            <Select.Root
                              collection={countryOptionsCollection}
                              value={normalizedValue ? [normalizedValue] : []}
                              onValueChange={({ value }) =>
                                field.onChange(value[0] ?? "")
                              }
                            >
                              <Select.HiddenSelect />
                              <Select.Control>
                                <Select.Trigger>
                                  <Select.ValueText
                                    placeholder={t(
                                      "fakturownia.invoiceCreate.countryPlaceholder",
                                      {
                                        defaultValue: "Select country",
                                      },
                                    )}
                                  />
                                </Select.Trigger>
                                <Select.IndicatorGroup>
                                  <Select.ClearTrigger />
                                  <Select.Indicator />
                                </Select.IndicatorGroup>
                              </Select.Control>
                              <Select.Positioner>
                                <Select.Content>
                                  {countryOptionsCollection.items.map(
                                    (item) => (
                                      <Select.Item item={item} key={item.value}>
                                        {item.label}
                                        <Select.ItemIndicator />
                                      </Select.Item>
                                    ),
                                  )}
                                </Select.Content>
                              </Select.Positioner>
                            </Select.Root>
                          );
                        }}
                      />
                    </Field>
                    <SimpleGrid columns={{ base: 1, md: 2 }} gap={4} w="100%">
                      <HStack align="start" gap={2}>
                        <Switch.Root
                          checked={recipientJstEnabled}
                          onCheckedChange={({ checked }) => {
                            const nextChecked = Boolean(checked);

                            if (nextChecked) {
                              setValue("recipientEnabled", true, {
                                shouldDirty: true,
                                shouldTouch: true,
                                shouldValidate: false,
                              });
                              void fillMissingRecipientTaxNoFromFakturowniaRecipient();
                            }

                            setValue(
                              "recipientRole",
                              nextChecked
                                ? "jst"
                                : lastNonSpecialRecipientRoleRef.current,
                              {
                                shouldDirty: true,
                                shouldTouch: true,
                                shouldValidate: true,
                              },
                            );
                          }}
                        >
                          <Switch.HiddenInput />
                          <Switch.Control />
                          <Switch.Label>
                            {t("fakturownia.invoiceCreate.recipientJstToggle", {
                              defaultValue:
                                "Does the invoice concern a local government unit?",
                            })}
                          </Switch.Label>
                        </Switch.Root>
                        <InfoTip content={recipientJstTooltipContent} />
                      </HStack>
                      <HStack align="start" gap={2}>
                        <Switch.Root
                          checked={recipientVatGroupEnabled}
                          onCheckedChange={({ checked }) => {
                            const nextChecked = Boolean(checked);

                            if (nextChecked) {
                              setValue("recipientEnabled", true, {
                                shouldDirty: true,
                                shouldTouch: true,
                                shouldValidate: false,
                              });
                            }

                            setValue(
                              "recipientRole",
                              nextChecked
                                ? "vatGroupMember"
                                : lastNonSpecialRecipientRoleRef.current,
                              {
                                shouldDirty: true,
                                shouldTouch: true,
                                shouldValidate: true,
                              },
                            );
                          }}
                        >
                          <Switch.HiddenInput />
                          <Switch.Control />
                          <Switch.Label>
                            {t(
                              "fakturownia.invoiceCreate.recipientVatGroupToggle",
                              {
                                defaultValue:
                                  "Does the invoice concern a VAT group member?",
                              },
                            )}
                          </Switch.Label>
                        </Switch.Root>
                        <InfoTip content={recipientVatGroupTooltipContent} />
                      </HStack>
                    </SimpleGrid>

                    <Button
                      w="100%"
                      type="button"
                      variant="surface"
                      alignSelf="end"
                      size="xs"
                      gap={2}
                      onClick={() => {
                        const nextEnabled = !recipientEnabled;
                        setValue("recipientEnabled", nextEnabled, {
                          shouldDirty: true,
                          shouldTouch: true,
                          shouldValidate: false,
                        });
                        if (!nextEnabled) {
                          setIsRecipientDetailsOpen(false);
                        }
                      }}
                    >
                      <MaterialSymbol>
                        {recipientEnabled ? "person_off" : "person_add"}
                      </MaterialSymbol>
                      {recipientEnabled
                        ? t("fakturownia.invoiceCreate.disableRecipient", {
                            defaultValue: "Remove recipient",
                          })
                        : t("fakturownia.invoiceCreate.enableRecipient", {
                            defaultValue: "Add recipient",
                          })}
                    </Button>

                    <Presence
                      w="100%"
                      present={recipientEnabled}
                      animationName={{
                        _open: "fade-in",
                        _closed: "fade-out",
                      }}
                      animationDuration="moderate"
                    >
                      <Card.Root mt={4}>
                        <Card.Body>
                          <VStack w="100%" gap={4} align="stretch">
                            <Text fontWeight="semibold">
                              {t("fakturownia.invoiceCreate.recipient", {
                                defaultValue: "Recipient",
                              })}
                            </Text>
                            <Field
                              label={t(
                                "fakturownia.invoiceCreate.recipientRole",
                                {
                                  defaultValue: "Recipient role",
                                },
                              )}
                            >
                              <Controller
                                name="recipientRole"
                                control={control}
                                render={({ field }) => (
                                  <Select.Root
                                    collection={recipientRoleCollection}
                                    value={field.value ? [field.value] : []}
                                    onValueChange={({ value }) =>
                                      field.onChange(
                                        (value[0] ??
                                          "recipient") as RecipientRoleOptionValue,
                                      )
                                    }
                                  >
                                    <Select.HiddenSelect />
                                    <Select.Control>
                                      <Select.Trigger>
                                        <Select.ValueText
                                          placeholder={t(
                                            "fakturownia.invoiceCreate.recipientRolePlaceholder",
                                            {
                                              defaultValue:
                                                "Select recipient role",
                                            },
                                          )}
                                        />
                                      </Select.Trigger>
                                      <Select.IndicatorGroup>
                                        <Select.Indicator />
                                      </Select.IndicatorGroup>
                                    </Select.Control>
                                    <Select.Positioner>
                                      <Select.Content>
                                        {recipientRoleCollection.items.map(
                                          (item) => (
                                            <Select.Item
                                              item={item}
                                              key={item.value}
                                            >
                                              {item.label}
                                              <Select.ItemIndicator />
                                            </Select.Item>
                                          ),
                                        )}
                                      </Select.Content>
                                    </Select.Positioner>
                                  </Select.Root>
                                )}
                              />
                            </Field>
                            {shouldShowRecipientRoleDescription && (
                              <Field
                                label={t(
                                  "fakturownia.invoiceCreate.recipientRoleDescription",
                                  {
                                    defaultValue: "Role description",
                                  },
                                )}
                              >
                                <Controller
                                  name="recipientRoleDescription"
                                  control={control}
                                  render={({ field }) => (
                                    <Input
                                      {...field}
                                      value={field.value ?? ""}
                                    />
                                  )}
                                />
                              </Field>
                            )}
                            <Field
                              label={t(
                                "fakturownia.invoiceCreate.recipientName",
                                { defaultValue: "Recipient name" },
                              )}
                            >
                              <Controller
                                name="recipientName"
                                control={control}
                                render={({ field }) => (
                                  <Combobox.Root
                                    allowCustomValue
                                    collection={
                                      recipientClientOptionsCollection
                                    }
                                    inputValue={recipientNameInputValue}
                                    onInputValueChange={(details) => {
                                      const nextValue =
                                        details.inputValue ?? "";
                                      setRecipientNameInputValue(nextValue);
                                      field.onChange(nextValue);
                                      // Clear recipient ID when user modifies the text
                                      if (recipientId) {
                                        setValue("recipientId", undefined, {
                                          shouldDirty: true,
                                          shouldTouch: true,
                                          shouldValidate: true,
                                        });
                                      }
                                    }}
                                    value={recipientId ? [recipientId] : []}
                                    onValueChange={(details) => {
                                      const selectedItem = details.items[0] as
                                        | ClientOptionItem
                                        | undefined;
                                      if (selectedItem) {
                                        applyRecipientClientData(
                                          selectedItem.client,
                                        );
                                        setRecipientNameInputValue(
                                          selectedItem.client.name || "",
                                        );
                                      } else {
                                        setValue("recipientId", undefined, {
                                          shouldDirty: true,
                                          shouldTouch: true,
                                          shouldValidate: true,
                                        });
                                      }
                                    }}
                                    openOnClick
                                    selectionBehavior="replace"
                                  >
                                    <Combobox.Control>
                                      <Combobox.Input
                                        placeholder={t(
                                          "fakturownia.invoiceCreate.recipientNamePlaceholder",
                                          {
                                            defaultValue:
                                              "Search or enter recipient name",
                                          },
                                        )}
                                        onBlur={field.onBlur}
                                      />
                                      <Combobox.IndicatorGroup>
                                        <Combobox.ClearTrigger
                                          aria-label={t("common.clear", {
                                            defaultValue: "Clear",
                                          })}
                                        />
                                        <Combobox.Trigger />
                                      </Combobox.IndicatorGroup>
                                    </Combobox.Control>
                                    <Portal>
                                      <Combobox.Positioner>
                                        <Combobox.Content>
                                          {isRecipientComboboxLoading ? (
                                            <HStack gap={2} p={2}>
                                              <Spinner size="xs" />
                                              <Text textStyle="sm">
                                                {t(
                                                  "fakturownia.invoiceCreate.clientSearchLoading",
                                                  {
                                                    defaultValue:
                                                      "Searching clients...",
                                                  },
                                                )}
                                              </Text>
                                            </HStack>
                                          ) : (
                                            <>
                                              <Combobox.Empty>
                                                {t(
                                                  "fakturownia.invoiceCreate.clientSearchEmpty",
                                                  {
                                                    defaultValue:
                                                      "No clients found",
                                                  },
                                                )}
                                              </Combobox.Empty>
                                              {recipientClientOptionsCollection.items.map(
                                                (item, index) => (
                                                  <Combobox.Item
                                                    item={item}
                                                    key={`${item.value}-${index}`}
                                                  >
                                                    <VStack
                                                      align="start"
                                                      gap={0}
                                                      flex="1"
                                                    >
                                                      <Text fontWeight="medium">
                                                        {item.label}
                                                      </Text>
                                                      {item.secondaryLabel && (
                                                        <Text
                                                          textStyle="sm"
                                                          color="fg.muted"
                                                        >
                                                          {item.secondaryLabel}
                                                        </Text>
                                                      )}
                                                    </VStack>
                                                    <Combobox.ItemIndicator />
                                                  </Combobox.Item>
                                                ),
                                              )}
                                            </>
                                          )}
                                        </Combobox.Content>
                                      </Combobox.Positioner>
                                    </Portal>
                                  </Combobox.Root>
                                )}
                              />
                            </Field>
                            <Field
                              label={t(
                                "fakturownia.invoiceCreate.recipientTaxNo",
                                { defaultValue: "Recipient Tax ID" },
                              )}
                            >
                              <Controller
                                name="recipientTaxNo"
                                control={control}
                                render={({ field }) => (
                                  <HStack w="100%" gap={2}>
                                    <Input
                                      {...field}
                                      onKeyDown={(event) => {
                                        if (event.key !== "Enter") {
                                          return;
                                        }

                                        event.preventDefault();

                                        if (isRecipientNipLookupLoading) {
                                          return;
                                        }

                                        handleSearchRecipientByNip(
                                          field.value || "",
                                        );
                                      }}
                                    />
                                    <Button
                                      size="sm"
                                      loading={isRecipientNipLookupLoading}
                                      disabled={isRecipientNipLookupLoading}
                                      onClick={() =>
                                        handleSearchRecipientByNip(
                                          field.value || "",
                                        )
                                      }
                                    >
                                      {t(
                                        "fakturownia.invoiceCreate.searchRecipient",
                                        { defaultValue: "Find recipient" },
                                      )}
                                    </Button>
                                  </HStack>
                                )}
                              />
                            </Field>
                            <Field
                              label={t(
                                "fakturownia.invoiceCreate.recipientStreet",
                                { defaultValue: "Street" },
                              )}
                            >
                              <Controller
                                name="recipientStreet"
                                control={control}
                                render={({ field }) => <Input {...field} />}
                              />
                            </Field>
                            <HStack w="100%" gap={4}>
                              <Field
                                w="33%"
                                label={t(
                                  "fakturownia.invoiceCreate.recipientPostalCode",
                                  { defaultValue: "Postal code" },
                                )}
                              >
                                <Controller
                                  name="recipientPostalCode"
                                  control={control}
                                  render={({ field }) => <Input {...field} />}
                                />
                              </Field>
                              <Field
                                label={t(
                                  "fakturownia.invoiceCreate.recipientCity",
                                  { defaultValue: "City" },
                                )}
                              >
                                <Controller
                                  name="recipientCity"
                                  control={control}
                                  render={({ field }) => <Input {...field} />}
                                />
                              </Field>
                            </HStack>
                            <Field
                              label={t(
                                "fakturownia.invoiceCreate.recipientCountry",
                                { defaultValue: "Country" },
                              )}
                            >
                              <Controller
                                name="recipientCountry"
                                control={control}
                                render={({ field }) => {
                                  const normalizedValue = normalizeCountryCode(
                                    field.value,
                                  );

                                  return (
                                    <Select.Root
                                      collection={countryOptionsCollection}
                                      value={
                                        normalizedValue ? [normalizedValue] : []
                                      }
                                      onValueChange={({ value }) =>
                                        field.onChange(value[0] ?? "")
                                      }
                                    >
                                      <Select.HiddenSelect />
                                      <Select.Control>
                                        <Select.Trigger>
                                          <Select.ValueText
                                            placeholder={t(
                                              "fakturownia.invoiceCreate.countryPlaceholder",
                                              {
                                                defaultValue: "Select country",
                                              },
                                            )}
                                          />
                                        </Select.Trigger>
                                        <Select.IndicatorGroup>
                                          <Select.ClearTrigger />
                                          <Select.Indicator />
                                        </Select.IndicatorGroup>
                                      </Select.Control>
                                      <Select.Positioner>
                                        <Select.Content>
                                          {countryOptionsCollection.items.map(
                                            (item) => (
                                              <Select.Item
                                                item={item}
                                                key={item.value}
                                              >
                                                {item.label}
                                                <Select.ItemIndicator />
                                              </Select.Item>
                                            ),
                                          )}
                                        </Select.Content>
                                      </Select.Positioner>
                                    </Select.Root>
                                  );
                                }}
                              />
                            </Field>
                            <Button
                              w="100%"
                              type="button"
                              variant="surface"
                              size="xs"
                              gap={2}
                              onClick={() =>
                                setIsRecipientDetailsOpen((open) => !open)
                              }
                            >
                              <MaterialSymbol>
                                {isRecipientDetailsOpen
                                  ? "expand_less"
                                  : "expand_more"}
                              </MaterialSymbol>
                              {isRecipientDetailsOpen
                                ? t(
                                    "fakturownia.invoiceCreate.hideRecipientContactDetails",
                                    {
                                      defaultValue:
                                        "Hide recipient contact details",
                                    },
                                  )
                                : t(
                                    "fakturownia.invoiceCreate.showRecipientContactDetails",
                                    {
                                      defaultValue:
                                        "Show recipient contact details",
                                    },
                                  )}
                            </Button>
                            <Collapsible.Root
                              w="100%"
                              open={isRecipientDetailsOpen}
                              onOpenChange={({ open }) =>
                                setIsRecipientDetailsOpen(open)
                              }
                            >
                              <Collapsible.Content>
                                <VStack gap={4} mt={4}>
                                  <Field
                                    label={t(
                                      "fakturownia.invoiceCreate.recipientEmail",
                                      { defaultValue: "Email" },
                                    )}
                                  >
                                    <Controller
                                      name="recipientEmail"
                                      control={control}
                                      render={({ field }) => (
                                        <Input type="email" {...field} />
                                      )}
                                    />
                                  </Field>
                                  <Field
                                    label={t(
                                      "fakturownia.invoiceCreate.recipientPhone",
                                      { defaultValue: "Phone" },
                                    )}
                                  >
                                    <Controller
                                      name="recipientPhone"
                                      control={control}
                                      render={({ field }) => (
                                        <Input {...field} />
                                      )}
                                    />
                                  </Field>
                                  <Field
                                    label={t(
                                      "fakturownia.invoiceCreate.recipientNote",
                                      { defaultValue: "Recipient note" },
                                    )}
                                  >
                                    <Controller
                                      name="recipientNote"
                                      control={control}
                                      render={({ field }) => (
                                        <Textarea
                                          borderRadius="3xl"
                                          rows={2}
                                          {...field}
                                        />
                                      )}
                                    />
                                  </Field>
                                </VStack>
                              </Collapsible.Content>
                            </Collapsible.Root>
                          </VStack>
                        </Card.Body>
                      </Card.Root>
                    </Presence>
                  </VStack>
                </Collapsible.Content>
              </Collapsible.Root>
            </VStack>
          </VStack>
        </Fieldset.Content>
      </Fieldset.Root>
    </HStack>
  );
}

function useClientOptionCollection(clients: Client[], taxLabel: string) {
  const { t } = useT(["fakturownia", "translation"]);

  return useMemo(() => {
    const items: ClientOptionItem[] = clients.map((client) => {
      const label =
        (
          client.name ??
          client.email ??
          getFakturowniaClientTaxNo(client) ??
          ""
        ).trim() ||
        t("fakturownia.invoiceCreate.unnamedClient", {
          defaultValue: "Unnamed client",
        });
      const locationParts = [client.postCode, client.city]
        .filter(Boolean)
        .join(" ")
        .trim();
      const secondaryParts = [
        getFakturowniaClientTaxNo(client)
          ? `${taxLabel}: ${getFakturowniaClientTaxNo(client)}`
          : undefined,
        locationParts || undefined,
        client.email ?? undefined,
      ].filter(Boolean);

      return {
        value:
          client.id !== undefined && client.id !== null
            ? String(client.id)
            : `client-${label}-${extractTaxIdDigits(getFakturowniaClientTaxNo(client))}`,
        label,
        secondaryLabel: secondaryParts.join(" • ") || undefined,
        client,
      };
    });

    return createListCollection({
      items,
      itemToValue: (item) => item.value,
      itemToString: (item) => item.label,
    });
  }, [clients, taxLabel, t]);
}
