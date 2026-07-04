"use client";

import { useTenantContext } from "@/context/tenant";
import { useAuth } from "@/context/auth";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import {
  Badge,
  Box,
  Button,
  Card,
  Field,
  HStack,
  Input,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { MaterialSymbol, toaster } from "@konfi/components";
import { withTenantId } from "@konfi/firebase";
import {
  CurrencyEnum,
  type Customer,
  type StoreCreditTransaction,
  StoreCreditTransactionType,
} from "@konfi/types";
import { formatPrice, normalizeStoreCreditAmount } from "@konfi/utils";
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  Timestamp,
} from "firebase/firestore";
import { useMemo, useState } from "react";
import useSWR from "swr";

interface Props {
  customer: Customer;
  onUpdated: () => Promise<void>;
}

function parseCreditInput(value: string): number {
  const normalized = value.trim().replace(",", ".");
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.round(parsed * 100);
}

async function fetchStoreCreditTransactions(
  customerId: string,
): Promise<StoreCreditTransaction[]> {
  const snapshot = await getDocs(
    query(
      collection(firestore, "customers", customerId, "storeCreditTransactions"),
      orderBy("createdAt", "desc"),
      limit(5),
    ),
  );

  return snapshot.docs.map((transactionDoc) => ({
    ...(transactionDoc.data() as StoreCreditTransaction),
    id: transactionDoc.id,
  }));
}

export default function CustomerStoreCreditPanel({
  customer,
  onUpdated,
}: Props) {
  const { t, i18n } = useT();
  const tenantContext = useTenantContext();
  const { user } = useAuth();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [savingType, setSavingType] =
    useState<StoreCreditTransactionType | null>(null);
  const [reversingTransactionId, setReversingTransactionId] = useState<
    string | null
  >(null);
  const amountMinor = useMemo(() => parseCreditInput(amount), [amount]);
  const {
    data: transactions,
    mutate,
    isLoading,
  } = useSWR(customer.id ? ["customer-store-credit", customer.id] : null, () =>
    fetchStoreCreditTransactions(customer.id),
  );

  const saveAdjustment = async (type: StoreCreditTransactionType) => {
    const trimmedReason = reason.trim();
    if (!amountMinor || !trimmedReason) {
      toaster.error({
        title: t("common.error", { defaultValue: "Error!" }),
        description: t("customers.storeCredit.missingFields", {
          defaultValue: "Enter an amount and reason.",
        }),
      });
      return;
    }

    const direction = type === StoreCreditTransactionType.ISSUE ? 1 : -1;
    const customerRef = doc(firestore, "customers", customer.id);
    const transactionRef = doc(
      collection(customerRef, "storeCreditTransactions"),
    );
    const actor = {
      id: user?.uid ?? "admin",
      name: user?.displayName ?? user?.email ?? "Admin",
    };

    try {
      setSavingType(type);
      await runTransaction(firestore, async (transaction) => {
        const customerSnapshot = await transaction.get(customerRef);
        const currentCustomer = customerSnapshot.data() as Customer | undefined;
        const currentBalance = normalizeStoreCreditAmount(
          currentCustomer?.storeCreditBalance,
        );
        const delta = amountMinor * direction;
        const nextBalance = currentBalance + delta;
        const timestamp = Timestamp.now();

        if (nextBalance < 0) {
          throw new Error("STORE_CREDIT_NEGATIVE_BALANCE");
        }

        transaction.update(
          customerRef,
          withTenantId(
            {
              storeCreditBalance: nextBalance,
              updatedAt: timestamp,
              updatedBy: actor,
            },
            tenantContext,
          ),
        );
        transaction.set(
          transactionRef,
          withTenantId(
            {
              id: transactionRef.id,
              active: true,
              amount: delta,
              balanceAfter: nextBalance,
              createdAt: timestamp,
              createdBy: actor,
              currency: CurrencyEnum.PLN,
              customerId: customer.id,
              name: trimmedReason,
              reason: trimmedReason,
              type,
              updatedAt: timestamp,
              updatedBy: actor,
            },
            tenantContext,
          ),
        );
      });

      setAmount("");
      setReason("");
      await Promise.all([mutate(), onUpdated()]);
      toaster.success({
        title: t("customers.storeCredit.saved", {
          defaultValue: "Store credit updated",
        }),
      });
    } catch (error) {
      console.error("Failed to update store credit", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error!" }),
        description:
          error instanceof Error &&
          error.message === "STORE_CREDIT_NEGATIVE_BALANCE"
            ? t("customers.storeCredit.negativeBalance", {
                defaultValue:
                  "The adjustment cannot make the balance negative.",
              })
            : t("customers.storeCredit.saveError", {
                defaultValue: "Failed to update store credit.",
              }),
      });
    } finally {
      setSavingType(null);
    }
  };

  const reverseTransaction = async (
    storeCreditTransaction: StoreCreditTransaction,
  ) => {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      toaster.error({
        title: t("common.error", { defaultValue: "Error!" }),
        description: t("customers.storeCredit.missingReason", {
          defaultValue: "Enter a reason.",
        }),
      });
      return;
    }

    const customerRef = doc(firestore, "customers", customer.id);
    const originalTransactionRef = doc(
      customerRef,
      "storeCreditTransactions",
      storeCreditTransaction.id,
    );
    const reversalTransactionRef = doc(
      collection(customerRef, "storeCreditTransactions"),
    );
    const actor = {
      id: user?.uid ?? "admin",
      name: user?.displayName ?? user?.email ?? "Admin",
    };

    try {
      setReversingTransactionId(storeCreditTransaction.id);
      await runTransaction(firestore, async (transaction) => {
        const customerSnapshot = await transaction.get(customerRef);
        const originalSnapshot = await transaction.get(originalTransactionRef);

        if (!originalSnapshot.exists()) {
          throw new Error("STORE_CREDIT_TRANSACTION_NOT_FOUND");
        }

        const currentCustomer = customerSnapshot.data() as Customer | undefined;
        const originalTransaction =
          originalSnapshot.data() as StoreCreditTransaction;
        const originalAmount = normalizeStoreCreditAmount(
          Math.abs(originalTransaction.amount),
        );

        if (
          originalTransaction.type === StoreCreditTransactionType.REVERSAL ||
          originalTransaction.reversalTransactionId ||
          !originalAmount
        ) {
          throw new Error("STORE_CREDIT_ALREADY_REVERSED");
        }

        const currentBalance = normalizeStoreCreditAmount(
          currentCustomer?.storeCreditBalance,
        );
        const delta =
          originalTransaction.amount >= 0 ? -originalAmount : originalAmount;
        const nextBalance = currentBalance + delta;
        const timestamp = Timestamp.now();

        if (nextBalance < 0) {
          throw new Error("STORE_CREDIT_NEGATIVE_BALANCE");
        }

        transaction.update(
          customerRef,
          withTenantId(
            {
              storeCreditBalance: nextBalance,
              updatedAt: timestamp,
              updatedBy: actor,
            },
            tenantContext,
          ),
        );
        transaction.set(
          reversalTransactionRef,
          withTenantId(
            {
              id: reversalTransactionRef.id,
              active: true,
              amount: delta,
              balanceAfter: nextBalance,
              createdAt: timestamp,
              createdBy: actor,
              currency: originalTransaction.currency ?? CurrencyEnum.PLN,
              customerId: customer.id,
              name: trimmedReason,
              reason: trimmedReason,
              reversedTransactionId: originalTransaction.id,
              type: StoreCreditTransactionType.REVERSAL,
              updatedAt: timestamp,
              updatedBy: actor,
              ...(originalTransaction.orderId
                ? { orderId: originalTransaction.orderId }
                : {}),
            },
            tenantContext,
          ),
        );
        transaction.update(originalTransactionRef, {
          reversalTransactionId: reversalTransactionRef.id,
          updatedAt: timestamp,
          updatedBy: actor,
        });
      });

      setReason("");
      await Promise.all([mutate(), onUpdated()]);
      toaster.success({
        title: t("customers.storeCredit.reverseSaved", {
          defaultValue: "Store credit transaction reversed",
        }),
      });
    } catch (error) {
      console.error("Failed to reverse store credit transaction", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error!" }),
        description:
          error instanceof Error &&
          error.message === "STORE_CREDIT_NEGATIVE_BALANCE"
            ? t("customers.storeCredit.negativeBalance", {
                defaultValue:
                  "The adjustment cannot make the balance negative.",
              })
            : error instanceof Error &&
                error.message === "STORE_CREDIT_ALREADY_REVERSED"
              ? t("customers.storeCredit.alreadyReversed", {
                  defaultValue: "This transaction was already reversed.",
                })
              : error instanceof Error &&
                  error.message === "STORE_CREDIT_TRANSACTION_NOT_FOUND"
                ? t("customers.storeCredit.transactionNotFound", {
                    defaultValue: "Store credit transaction was not found.",
                  })
                : t("customers.storeCredit.saveError", {
                    defaultValue: "Failed to update store credit.",
                  }),
      });
    } finally {
      setReversingTransactionId(null);
    }
  };

  const isSaving = savingType !== null || reversingTransactionId !== null;

  return (
    <Card.Root mt={["6", "8"]}>
      <Card.Header>
        <Card.Title>
          {t("customers.storeCredit.title", {
            defaultValue: "Store credit",
          })}
        </Card.Title>
      </Card.Header>
      <Card.Body>
        <Stack gap={5}>
          <HStack justify="space-between" align="start">
            <Text color="fg.muted">
              {t("customers.storeCredit.balance", {
                defaultValue: "Balance",
              })}
            </Text>
            <Text fontSize="xl" fontWeight="semibold">
              {formatPrice(
                customer.storeCreditBalance ?? 0,
                CurrencyEnum.PLN,
                undefined,
                undefined,
                i18n.resolvedLanguage,
              )}
            </Text>
          </HStack>
          <Stack gap={4}>
            <Field.Root required>
              <Field.Label>
                {t("customers.storeCredit.amount", {
                  defaultValue: "Amount",
                })}
              </Field.Label>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder={t("customers.storeCredit.amountPlaceholder", {
                  defaultValue: "0.00",
                })}
              />
            </Field.Root>
            <Field.Root required>
              <Field.Label>
                {t("customers.storeCredit.reason", {
                  defaultValue: "Reason",
                })}
              </Field.Label>
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t("customers.storeCredit.reasonPlaceholder", {
                  defaultValue:
                    "Reason for issuing, adjusting, or reversing credit",
                })}
                rows={3}
              />
            </Field.Root>
            <HStack gap={3} wrap="wrap">
              <Button
                colorPalette="success"
                loading={savingType === StoreCreditTransactionType.ISSUE}
                disabled={isSaving}
                onClick={() => saveAdjustment(StoreCreditTransactionType.ISSUE)}
              >
                <MaterialSymbol>add_card</MaterialSymbol>
                {t("customers.storeCredit.issue", {
                  defaultValue: "Issue credit",
                })}
              </Button>
              <Button
                variant="outline"
                loading={savingType === StoreCreditTransactionType.ADJUSTMENT}
                disabled={isSaving}
                onClick={() =>
                  saveAdjustment(StoreCreditTransactionType.ADJUSTMENT)
                }
              >
                <MaterialSymbol>remove</MaterialSymbol>
                {t("customers.storeCredit.adjust", {
                  defaultValue: "Deduct credit",
                })}
              </Button>
            </HStack>
          </Stack>
          <Stack gap={3}>
            <Text fontWeight="medium">
              {t("customers.storeCredit.recentTransactions", {
                defaultValue: "Recent transactions",
              })}
            </Text>
            {isLoading ? (
              <Text color="fg.muted">
                {t("common.loading", { defaultValue: "Loading..." })}
              </Text>
            ) : transactions && transactions.length > 0 ? (
              transactions.map((transaction) => {
                const canReverse =
                  transaction.type !== StoreCreditTransactionType.REVERSAL &&
                  !transaction.reversalTransactionId;

                return (
                  <HStack
                    key={transaction.id}
                    justify="space-between"
                    align="start"
                    gap={4}
                  >
                    <Box flex="1" minW={0}>
                      <Text fontWeight="medium">{transaction.reason}</Text>
                      <Text color="fg.muted" fontSize="sm">
                        {transaction.createdAt
                          ?.toDate()
                          .toLocaleDateString(i18n.resolvedLanguage)}
                      </Text>
                      {!canReverse &&
                      transaction.type !==
                        StoreCreditTransactionType.REVERSAL ? (
                        <Badge mt={2} colorPalette="gray" variant="subtle">
                          {t("customers.storeCredit.reversed", {
                            defaultValue: "Reversed",
                          })}
                        </Badge>
                      ) : null}
                    </Box>
                    <HStack gap={3} align="center">
                      <Text
                        color={
                          transaction.amount >= 0
                            ? "success.solid"
                            : "red.solid"
                        }
                        fontWeight="semibold"
                      >
                        {formatPrice(
                          transaction.amount,
                          transaction.currency,
                          undefined,
                          undefined,
                          i18n.resolvedLanguage,
                        )}
                      </Text>
                      {canReverse ? (
                        <Button
                          size="xs"
                          variant="outline"
                          loading={reversingTransactionId === transaction.id}
                          disabled={isSaving}
                          onClick={() => reverseTransaction(transaction)}
                        >
                          <MaterialSymbol>undo</MaterialSymbol>
                          {t("customers.storeCredit.reverse", {
                            defaultValue: "Reverse",
                          })}
                        </Button>
                      ) : null}
                    </HStack>
                  </HStack>
                );
              })
            ) : (
              <Text color="fg.muted">
                {t("customers.storeCredit.noTransactions", {
                  defaultValue: "No transactions",
                })}
              </Text>
            )}
          </Stack>
        </Stack>
      </Card.Body>
    </Card.Root>
  );
}
