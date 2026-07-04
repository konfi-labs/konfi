"use client";

import {
  Alert,
  Button,
  Card,
  Dialog,
  HStack,
  Input,
  Portal,
  Separator,
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react";
import { Field, MaterialSymbol } from "@konfi/components";
import type { Client } from "@konfi/fakturownia/out/client/models";
import { formatTotal } from "@konfi/utils";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { useMemo } from "react";
import { useT } from "@/i18n/client";
import type { CashNumpadKey } from "./cash-calculations";
import {
  extractTaxIdDigits,
  getFakturowniaClientTaxNo,
} from "./invoice-helpers";
import { CASH_NUMPAD_KEYS } from "./invoice-form-options";
import { formatDisplayTotal } from "./invoice-form-position-builder";
import type { ClientOptionItem, InvoiceFormValues } from "./invoice-form-types";

interface FakturowniaInvoiceDialogsProps {
  buyerChoiceOpen: boolean;
  setBuyerChoiceOpen: Dispatch<SetStateAction<boolean>>;
  buyerChoiceNip: string;
  buyerDialogClients: Client[];
  recipientChoiceOpen: boolean;
  setRecipientChoiceOpen: Dispatch<SetStateAction<boolean>>;
  recipientChoiceNip: string;
  recipientDialogClients: Client[];
  handleBuyerClientSelection: (client: Client) => void;
  applyRecipientClientData: (client: Client) => void;
  buyerDescriptionDialogOpen: boolean;
  pendingBuyerClient: Client | null;
  confirmBuyerClientSelection: () => void;
  cancelBuyerClientSelection: () => void;
  isConfirmDialogOpen: boolean;
  setIsConfirmDialogOpen: Dispatch<SetStateAction<boolean>>;
  setPendingFormValues: Dispatch<SetStateAction<InvoiceFormValues | null>>;
  kindLabel: string;
  paymentTypeLabel: string;
  paymentTermLabel: string;
  paymentToValue?: string;
  paymentTerm: string;
  statusLabel: string;
  paidAmount: number;
  isCashPayment: boolean;
  cashReceivedInputRef: RefObject<HTMLInputElement | null>;
  cashReceivedInput: string;
  handleCashReceivedInputChange: (value: string) => void;
  cashChangeDue: number;
  lastNumpadKey: CashNumpadKey | null;
  handleCashNumpadKey: (key: CashNumpadKey) => void;
  totals: {
    gross: number;
  };
  handleConfirmedSubmit: () => void;
  isCreatingInvoice: boolean;
}

export function FakturowniaInvoiceDialogs({
  buyerChoiceOpen,
  setBuyerChoiceOpen,
  buyerChoiceNip,
  buyerDialogClients,
  recipientChoiceOpen,
  setRecipientChoiceOpen,
  recipientChoiceNip,
  recipientDialogClients,
  handleBuyerClientSelection,
  applyRecipientClientData,
  buyerDescriptionDialogOpen,
  pendingBuyerClient,
  confirmBuyerClientSelection,
  cancelBuyerClientSelection,
  isConfirmDialogOpen,
  setIsConfirmDialogOpen,
  setPendingFormValues,
  kindLabel,
  paymentTypeLabel,
  paymentTermLabel,
  paymentToValue,
  paymentTerm,
  statusLabel,
  paidAmount,
  isCashPayment,
  cashReceivedInputRef,
  cashReceivedInput,
  handleCashReceivedInputChange,
  cashChangeDue,
  lastNumpadKey,
  handleCashNumpadKey,
  totals,
  handleConfirmedSubmit,
  isCreatingInvoice,
}: FakturowniaInvoiceDialogsProps) {
  const { t } = useT(["fakturownia", "translation"]);
  const buyerDialogItems = useClientOptionItems(
    buyerDialogClients,
    t("fakturownia.invoiceCreate.buyerTaxNo", {
      defaultValue: "Buyer Tax ID",
    }),
  );
  const recipientDialogItems = useClientOptionItems(
    recipientDialogClients,
    t("fakturownia.invoiceCreate.recipientTaxNo", {
      defaultValue: "Recipient Tax ID",
    }),
  );

  return (
    <>
      <ClientChoiceDialog
        open={buyerChoiceOpen}
        onOpenChange={setBuyerChoiceOpen}
        items={buyerDialogItems}
        title={t("fakturownia.invoiceCreate.chooseBuyerDialog.title", {
          defaultValue: "Multiple clients found",
        })}
        description={t(
          "fakturownia.invoiceCreate.chooseBuyerDialog.description",
          {
            defaultValue: "Select the correct client for NIP {{nip}}",
            nip: buyerChoiceNip,
          },
        )}
        onSelect={handleBuyerClientSelection}
      />

      <ClientChoiceDialog
        open={recipientChoiceOpen}
        onOpenChange={setRecipientChoiceOpen}
        items={recipientDialogItems}
        title={t("fakturownia.invoiceCreate.chooseRecipientDialog.title", {
          defaultValue: "Multiple recipients found",
        })}
        description={t(
          "fakturownia.invoiceCreate.chooseRecipientDialog.description",
          {
            defaultValue: "Select the correct recipient for NIP {{nip}}",
            nip: recipientChoiceNip,
          },
        )}
        onSelect={applyRecipientClientData}
      />

      <Dialog.Root
        open={buyerDescriptionDialogOpen}
        onOpenChange={({ open }) => {
          if (!open) {
            cancelBuyerClientSelection();
          }
        }}
        placement="center"
        role="alertdialog"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content maxW="lg">
              <Dialog.Header>
                <Dialog.Title>
                  {t("fakturownia.invoiceCreate.buyerDescriptionDialog.title", {
                    defaultValue: "Client note",
                  })}
                </Dialog.Title>
                {pendingBuyerClient?.name && (
                  <Dialog.Description>
                    {pendingBuyerClient.name}
                  </Dialog.Description>
                )}
              </Dialog.Header>
              <Dialog.Body>
                <Alert.Root status="warning" variant="subtle">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description whiteSpace="pre-wrap">
                      {pendingBuyerClient?.note}
                    </Alert.Description>
                  </Alert.Content>
                </Alert.Root>
              </Dialog.Body>
              <Dialog.Footer>
                <Button variant="outline" onClick={cancelBuyerClientSelection}>
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </Button>
                <Button
                  colorPalette="primary"
                  onClick={confirmBuyerClientSelection}
                >
                  {t(
                    "fakturownia.invoiceCreate.buyerDescriptionDialog.confirm",
                    { defaultValue: "Confirm selection" },
                  )}
                </Button>
              </Dialog.Footer>
              <Dialog.CloseTrigger />
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      <Dialog.Root
        size={"lg"}
        open={isConfirmDialogOpen}
        onOpenChange={(e) => setIsConfirmDialogOpen(e.open)}
        role="alertdialog"
        placement="center"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>
                  {t("fakturownia.invoiceCreate.confirmDialog.title", {
                    defaultValue: "Create {{kind}}?",
                    kind: kindLabel,
                  })}
                </Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                <VStack align="stretch" gap={4}>
                  <Text>
                    {t("fakturownia.invoiceCreate.confirmDialog.message", {
                      defaultValue:
                        "Are you sure you want to create this {{kind}}? This action cannot be undone.",
                      kind: kindLabel.toLowerCase(),
                    })}
                  </Text>
                  <VStack
                    align="stretch"
                    gap={3}
                    p={4}
                    bg="bg.muted"
                    borderRadius="2xl"
                  >
                    <SummaryRow
                      label={t("fakturownia.invoiceCreate.kind", {
                        defaultValue: "Document type",
                      })}
                      value={kindLabel}
                    />
                    <SummaryRow
                      label={t("fakturownia.invoiceCreate.paymentType.label", {
                        defaultValue: "Payment method",
                      })}
                      value={paymentTypeLabel}
                    />
                    <SummaryRow
                      label={t("fakturownia.invoiceCreate.paymentTerm.label", {
                        defaultValue: "Payment term",
                      })}
                      value={`${paymentTermLabel}${
                        paymentToValue && paymentTerm !== "custom"
                          ? ` (${paymentToValue})`
                          : ""
                      }`}
                    />
                    <SummaryRow
                      label={t("fakturownia.invoiceCreate.status.label", {
                        defaultValue: "Status",
                      })}
                      value={statusLabel}
                    />
                    <SummaryRow
                      label={t("fakturownia.invoiceCreate.paidAmount", {
                        defaultValue: "Amount paid",
                      })}
                      value={formatDisplayTotal(paidAmount || 0)}
                    />
                    {isCashPayment && (
                      <CashPaymentConfirmation
                        cashReceivedInputRef={cashReceivedInputRef}
                        cashReceivedInput={cashReceivedInput}
                        handleCashReceivedInputChange={
                          handleCashReceivedInputChange
                        }
                        cashChangeDue={cashChangeDue}
                        lastNumpadKey={lastNumpadKey}
                        handleCashNumpadKey={handleCashNumpadKey}
                      />
                    )}
                    <Separator />
                    <SummaryRow
                      label={t("fakturownia.invoiceCreate.totalGross", {
                        defaultValue: "Total gross",
                      })}
                      value={formatTotal(totals.gross)}
                      strong
                    />
                    <SummaryRow
                      label={t("fakturownia.invoiceCreate.balanceDue", {
                        defaultValue: "Amount due",
                      })}
                      value={formatDisplayTotal(
                        totals.gross - (paidAmount || 0),
                      )}
                      strong
                    />
                  </VStack>
                </VStack>
              </Dialog.Body>
              <Dialog.Footer>
                <Dialog.ActionTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsConfirmDialogOpen(false);
                      setPendingFormValues(null);
                    }}
                  >
                    {t("fakturownia.invoiceCreate.confirmDialog.cancel", {
                      defaultValue: "Cancel",
                    })}
                  </Button>
                </Dialog.ActionTrigger>
                <Button
                  colorPalette="primary"
                  onClick={handleConfirmedSubmit}
                  loading={isCreatingInvoice}
                  disabled={isCreatingInvoice}
                >
                  {t("fakturownia.invoiceCreate.confirmDialog.confirm", {
                    defaultValue: "Create {{kind}}",
                    kind: kindLabel,
                  })}
                </Button>
              </Dialog.Footer>
              <Dialog.CloseTrigger />
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </>
  );
}

function useClientOptionItems(clients: Client[], taxLabel: string) {
  const { t } = useT(["fakturownia", "translation"]);

  return useMemo<ClientOptionItem[]>(() => {
    return clients.map((client) => {
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
  }, [clients, taxLabel, t]);
}

interface ClientChoiceDialogProps {
  open: boolean;
  onOpenChange: Dispatch<SetStateAction<boolean>>;
  items: ClientOptionItem[];
  title: string;
  description: string;
  onSelect: (client: Client) => void;
}

function ClientChoiceDialog({
  open,
  onOpenChange,
  items,
  title,
  description,
  onSelect,
}: ClientChoiceDialogProps) {
  const { t } = useT(["fakturownia", "translation"]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={({ open: nextOpen }) => onOpenChange(nextOpen)}
      placement="center"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW="lg">
            <Dialog.Header>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description}</Dialog.Description>
            </Dialog.Header>
            <Dialog.Body>
              <VStack align="stretch" gap={2} maxH="50vh" overflowY="auto">
                {items.map((item, index) => (
                  <Card.Root key={`${item.value}-${index}`} variant="subtle">
                    <Card.Body>
                      <HStack align="center" justify="space-between" gap={3}>
                        <VStack align="start" gap={0} flex="1">
                          <Text fontWeight="medium">{item.label}</Text>
                          {item.secondaryLabel && (
                            <Text textStyle="sm" color="fg.muted">
                              {item.secondaryLabel}
                            </Text>
                          )}
                        </VStack>
                        <Button
                          size="xs"
                          onClick={() => {
                            onSelect(item.client);
                            onOpenChange(false);
                          }}
                        >
                          {t("common.select", { defaultValue: "Select" })}
                        </Button>
                      </HStack>
                    </Card.Body>
                  </Card.Root>
                ))}
                {items.length === 0 && (
                  <Text textStyle="sm">
                    {t("common.noResults", { defaultValue: "No results" })}
                  </Text>
                )}
              </VStack>
            </Dialog.Body>
            <Dialog.Footer>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel", { defaultValue: "Cancel" })}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

interface SummaryRowProps {
  label: string;
  value: string;
  strong?: boolean;
}

function SummaryRow({ label, value, strong }: SummaryRowProps) {
  return (
    <HStack justify="space-between">
      <Text fontWeight={strong ? "semibold" : "medium"}>{label}:</Text>
      <Text fontWeight={strong ? "semibold" : undefined} fontSize="lg">
        {value}
      </Text>
    </HStack>
  );
}

interface CashPaymentConfirmationProps {
  cashReceivedInputRef: RefObject<HTMLInputElement | null>;
  cashReceivedInput: string;
  handleCashReceivedInputChange: (value: string) => void;
  cashChangeDue: number;
  lastNumpadKey: CashNumpadKey | null;
  handleCashNumpadKey: (key: CashNumpadKey) => void;
}

function CashPaymentConfirmation({
  cashReceivedInputRef,
  cashReceivedInput,
  handleCashReceivedInputChange,
  cashChangeDue,
  lastNumpadKey,
  handleCashNumpadKey,
}: CashPaymentConfirmationProps) {
  const { t } = useT(["fakturownia", "translation"]);

  return (
    <HStack align="stretch" gap={4} flexWrap={{ base: "wrap", md: "nowrap" }}>
      <VStack
        align="stretch"
        gap={3}
        flex="1"
        minW={{ base: "100%", md: "260px" }}
      >
        <Field
          label={t("fakturownia.invoiceCreate.confirmDialog.cashReceived", {
            defaultValue: "Cash received",
          })}
        >
          <Input
            ref={cashReceivedInputRef}
            type="text"
            inputMode="decimal"
            placeholder={t(
              "fakturownia.invoiceCreate.confirmDialog.cashReceivedPlaceholder",
              { defaultValue: "Enter amount received" },
            )}
            value={cashReceivedInput}
            onChange={(event) =>
              handleCashReceivedInputChange(event.target.value)
            }
            textAlign="right"
          />
        </Field>
        <HStack justify="space-between">
          <Text fontWeight="semibold">
            {t("fakturownia.invoiceCreate.confirmDialog.changeDue", {
              defaultValue: "Change due",
            })}
            :
          </Text>
          <Text
            fontWeight="semibold"
            fontSize="lg"
            color={cashChangeDue < 0 ? "red.600" : "success.600"}
          >
            {formatDisplayTotal(cashChangeDue)}
          </Text>
        </HStack>
      </VStack>
      <Separator
        orientation="vertical"
        alignSelf="stretch"
        display={{ base: "none", md: "block" }}
      />
      <VStack align="stretch" gap={2} minW={{ base: "100%", md: "200px" }}>
        <SimpleGrid columns={3} gap={2}>
          {CASH_NUMPAD_KEYS.map((key) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={lastNumpadKey === key ? "solid" : "surface"}
              colorPalette={lastNumpadKey === key ? "primary" : undefined}
              onClick={() => handleCashNumpadKey(key)}
              aria-label={
                key === "backspace"
                  ? t(
                      "fakturownia.invoiceCreate.confirmDialog.numpad.backspace",
                      { defaultValue: "Backspace" },
                    )
                  : key
              }
            >
              {key === "backspace" ? (
                <MaterialSymbol>backspace</MaterialSymbol>
              ) : (
                key
              )}
            </Button>
          ))}
        </SimpleGrid>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => handleCashNumpadKey("clear")}
        >
          {t("common.clear", { defaultValue: "Clear" })}
        </Button>
      </VStack>
    </HStack>
  );
}
