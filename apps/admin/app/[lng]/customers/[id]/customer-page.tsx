"use client";

import { getAdminConfigFlags } from "@/actions";
import { sendOrderItemProblemNotification } from "@/actions/order-item-problems";
import { fetchCustomerGroupOptions } from "@/components/customers/customer-groups";
import { useTenantContext } from "@/context/tenant";
import CustomerStoreCreditPanel from "@/components/customers/CustomerStoreCreditPanel";
import { Notes } from "@/components/notes/Notes";
import { ItemProblemDialog } from "@/components/orders/ItemProblemDialog";
import LocalOrderFilesSection from "@/components/orders/LocalOrderFilesSection";
import OrderItemFileUpload from "@/components/orders/OrderItemFileUpload";
import { useOrderFolderSettings } from "@/hooks/useOrderFolderSettings";
import { useT } from "@/i18n/client";
import { firestore, storage } from "@/lib/firebase/clientApp";
import { onFileDelete, onFileDownload } from "@/lib/helpers";
import {
  Box,
  Button,
  Combobox,
  createListCollection,
  Flex,
  Grid,
  GridItem,
  Heading,
  HStack,
  Portal,
  Separator,
  Skeleton,
  Stack,
  Switch,
  Text,
} from "@chakra-ui/react";
import {
  CustomerInfo,
  CustomHeading,
  DataTable,
  Empty,
  IconButtonLink,
  MaterialSymbol,
  SpecialNotes,
  Tag,
  toaster,
} from "@konfi/components";
import type { Client } from "@konfi/fakturownia/out/client/models";
import {
  getCustomerInvoiceAutomation,
  getNotes,
  getProductsByIds,
  setCustomerInvoiceAutomation,
} from "@konfi/firebase";
import { CurrencyEnum, Customer, Order, Product } from "@konfi/types";
import type { ItemProblem, OrderItem } from "@konfi/types";
import { formatPrice, formatStreetLine, isElectron } from "@konfi/utils";
import { ColumnDef, createColumnHelper } from "@tanstack/react-table";
import { useCustomers } from "context/customers";
import { isNull, isUndefined } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import {
  arrayRemove,
  arrayUnion,
  doc,
  type DocumentReference,
  type DocumentSnapshot,
  endBefore,
  getCountFromServer,
  getDocs,
  limitToLast,
  orderBy,
  QueryConstraint,
  runTransaction,
  startAfter,
  updateDoc,
  where,
} from "firebase/firestore";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import {
  Fragment,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import useSWR from "swr";
import useSWRImmutable from "swr/immutable";
const CustomerForm = dynamic(
  () => import("@/components/customers/CustomerForm"),
  {
    loading: () => <Skeleton />,
    ssr: false,
  },
);
const LinkCustomerToGroupDialog = dynamic(
  () => import("@/components/customers/LinkCustomerToGroupDialog"),
  {
    loading: () => <Skeleton />,
    ssr: false,
  },
);

const customerOrderColumnHelper = createColumnHelper<Order>();

type CustomerOrderColumnDef = ColumnDef<Order, unknown>;

function asCustomerOrderColumnDef<TValue>(
  column: ColumnDef<Order, TValue>,
): CustomerOrderColumnDef {
  return column as unknown as CustomerOrderColumnDef;
}

function updateItemIdCollection(
  values: string[],
  itemId: string,
  shouldInclude: boolean,
): string[] {
  if (shouldInclude) {
    return values.includes(itemId) ? values : [...values, itemId];
  }

  return values.filter((value) => value !== itemId);
}

export default function CustomerPage() {
  const { t, i18n } = useT(["order", "orders", "fakturownia", "translation"]);
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const tenantContext = useTenantContext();
  const { unlinkProductFromCustomer, unlinkCustomerFromCustomerGroup } = useCustomers();
  const { getFolderPath } = useOrderFolderSettings();
  const { data: configFlags } = useSWRImmutable("admin-config-flags", () =>
    getAdminConfigFlags(),
  );
  const { data: customerGroupOptions } = useSWRImmutable(
    ["/customerGroups/options", tenantContext],
    ([, context]) => fetchCustomerGroupOptions(context),
  );
  const hasFakturowniaKey = configFlags?.fakturowniaApiKeyProvided === true;
  const {
    data: customer,
    mutate,
    isLoading: isLoadingCustomer,
  } = useSWR(id, fetchCustomer, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateOnMount: true,
  });
  const borderColor = "gray.muted";
  const assignedCustomerGroups = useMemo(() => {
    const customerGroupIds = customer?.customerGroupIds ?? [];
    if (customerGroupIds.length === 0) {
      return [];
    }

    const customerGroupLabelById = new Map(
      (customerGroupOptions ?? []).map((customerGroup) => [
        customerGroup.value,
        customerGroup.label,
      ]),
    );

    return customerGroupIds.map((customerGroupId) => ({
      id: customerGroupId,
      name: customerGroupLabelById.get(customerGroupId) ?? customerGroupId,
    }));
  }, [customer?.customerGroupIds, customerGroupOptions]);
  const { data: linkedProducts, isLoading } = useSWR(
    customer?.b2b && !isEmpty(customer?.linkedProductsIds)
      ? customer.linkedProductsIds
      : null,
    fetchLinkedProductsIds,
  );
  // Pagination state for orders table (server-side)
  const [ordersPageIndex, setOrdersPageIndex] = useState(0);
  const [ordersPageSize, setOrdersPageSize] = useState(10);
  const [customerOrders, setCustomerOrders] = useState<Order[] | null>(null);
  const [isLoadingCustomerOrders, setIsLoadingCustomerOrders] = useState(false);
  const [customerOrdersCount, setCustomerOrdersCount] = useState<number>(0);
  const pageFirstDocs = useRef<Record<number, DocumentSnapshot<Order>>>({});
  const pageLastDocs = useRef<Record<number, DocumentSnapshot<Order>>>({});

  useEffect(() => {
    setOrdersPageIndex(0);
    // load first page when customer changes
    if (customer?.id) {
      void showCustomerOrders("FIRST", ordersPageSize);
    } else {
      setCustomerOrders(null);
      setCustomerOrdersCount(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id]);

  // Handler used by DataTable controlled pagination
  async function handleOrdersTableShow(
    type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST",
    limit: number,
  ) {
    await showCustomerOrders(type, limit);
  }
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showLinkGroupDialog, setShowLinkGroupDialog] = useState(false);
  const [showItemProblemDialog, setShowItemProblemDialog] = useState(false);
  const [selectedProblemOrder, setSelectedProblemOrder] =
    useState<Order | null>(null);
  const [selectedProblemItem, setSelectedProblemItem] =
    useState<OrderItem | null>(null);
  const [existingProblem, setExistingProblem] = useState<
    ItemProblem | undefined
  >(undefined);
  const {
    data: automation,
    isLoading: isLoadingAutomation,
    mutate: mutateAutomation,
  } = useSWRImmutable(
    hasFakturowniaKey && customer
      ? [customer.id, "fakturowniaAutomation"]
      : null,
    ([customerId]) => getCustomerInvoiceAutomation(firestore, customerId),
  );
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [automationClientId, setAutomationClientId] = useState("");
  const [automationClientInputValue, setAutomationClientInputValue] =
    useState("");
  const [automationClientSuggestions, setAutomationClientSuggestions] =
    useState<Client[]>([]);
  const [isAutomationClientLoading, setIsAutomationClientLoading] =
    useState(false);
  const [savingAutomation, setSavingAutomation] = useState(false);
  const { data: notes } = useSWRImmutable(
    customer ? [customer.id] : null,
    ([customerId]) => getNotes(firestore, customerId),
  );

  useEffect(() => {
    if (!hasFakturowniaKey) {
      setAutomationEnabled(false);
      setAutomationClientId("");
      setAutomationClientInputValue("");
      setAutomationClientSuggestions([]);
      setIsAutomationClientLoading(false);
      return;
    }

    if (automation === undefined) {
      return;
    }

    if (automation === null) {
      setAutomationEnabled(false);
      setAutomationClientId("");
      setAutomationClientInputValue("");
      setAutomationClientSuggestions([]);
      return;
    }

    setAutomationEnabled(automation.enabled);
    const savedClientId = automation.fakturowniaClientId?.trim() ?? "";
    setAutomationClientId(savedClientId);

    if (!savedClientId) {
      setAutomationClientInputValue("");
      setAutomationClientSuggestions([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        setIsAutomationClientLoading(true);
        const { getClientById } = await import("@/actions/fakturownia");
        const client = await getClientById(savedClientId);
        if (cancelled) {
          return;
        }
        if (client) {
          const label =
            (client.name ?? client.email ?? client.taxNo ?? "").trim() ||
            t("fakturownia.invoiceCreate.unnamedClient", {
              defaultValue: "Unnamed client",
            });

          setAutomationClientSuggestions((prev) => {
            if (prev.some((existing) => existing.id === client.id)) {
              return prev;
            }
            return [client, ...prev];
          });
          setAutomationClientInputValue(label);
        } else {
          setAutomationClientInputValue(savedClientId);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Error prefilling Fakturownia client", error);
          setAutomationClientInputValue(savedClientId);
        }
      } finally {
        if (!cancelled) {
          setIsAutomationClientLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [automation, hasFakturowniaKey, t]);

  useEffect(() => {
    if (!hasFakturowniaKey) {
      setAutomationClientSuggestions([]);
      setIsAutomationClientLoading(false);
      return;
    }

    const term = automationClientInputValue.trim();
    if (term.length < 2) {
      setAutomationClientSuggestions([]);
      setIsAutomationClientLoading(false);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      void (async () => {
        try {
          if (!cancelled) {
            setIsAutomationClientLoading(true);
          }
          const { searchFakturowniaClients } =
            await import("@/actions/fakturownia");
          const results = await searchFakturowniaClients(term);
          if (!cancelled) {
            setAutomationClientSuggestions(results);
          }
        } catch (error) {
          if (!cancelled) {
            console.error("Error searching Fakturownia clients", error);
          }
        } finally {
          if (!cancelled) {
            setIsAutomationClientLoading(false);
          }
        }
      })();
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [automationClientInputValue, hasFakturowniaKey]);

  const automationClientOptionsCollection = useMemo(() => {
    const taxLabel = t("fakturownia.invoiceCreate.buyerTaxNo", {
      defaultValue: "Buyer Tax ID",
    });
    const items = automationClientSuggestions.map((client) => {
      const label =
        (client.name ?? client.email ?? client.taxNo ?? "").trim() ||
        t("fakturownia.invoiceCreate.unnamedClient", {
          defaultValue: "Unnamed client",
        });
      const locationParts = [client.postCode, client.city]
        .filter(Boolean)
        .join(" ")
        .trim();
      const secondaryParts = [
        client.taxNo ? `${taxLabel}: ${client.taxNo}` : undefined,
        locationParts || undefined,
        client.email ?? undefined,
      ].filter(Boolean);
      return {
        value:
          client.id !== undefined && client.id !== null
            ? String(client.id)
            : label,
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
  }, [automationClientSuggestions, t]);

  function handleUpdateFormOpen() {
    startTransition(() => {
      setShowUpdateForm(true);
    });
  }

  const orderByItemId = useMemo(() => {
    const entries =
      customerOrders?.flatMap((order) =>
        order.items.map((item) => [item.id, order] as const),
      ) ?? [];
    return new Map(entries);
  }, [customerOrders]);

  const patchCustomerOrder = useCallback(
    (orderId: string, updater: (order: Order) => Order) => {
      setCustomerOrders(
        (orders) =>
          orders?.map((order) =>
            order.id === orderId ? updater(order) : order,
          ) ?? orders,
      );
    },
    [],
  );

  const updateCustomerOrderItemFulfillment = useCallback(
    async (
      orderId: string,
      channelId: string,
      itemId: string,
      fulfilled: boolean,
    ): Promise<void> => {
      try {
        await updateDoc(
          doc(firestore, "channels", channelId, "orders", orderId),
          {
            fulfilledItems: fulfilled
              ? arrayUnion(itemId)
              : arrayRemove(itemId),
            inProgressItems: arrayRemove(itemId),
            pickedUpItems: arrayRemove(itemId),
            deliveredItems: arrayRemove(itemId),
          },
        );
        patchCustomerOrder(orderId, (order) => ({
          ...order,
          fulfilledItems: updateItemIdCollection(
            order.fulfilledItems,
            itemId,
            fulfilled,
          ),
          inProgressItems: order.inProgressItems.filter(
            (value) => value !== itemId,
          ),
          pickedUpItems: order.pickedUpItems?.filter(
            (value) => value !== itemId,
          ),
          deliveredItems: order.deliveredItems?.filter(
            (value) => value !== itemId,
          ),
        }));
        toaster.success({
          title: t("order.itemFulfilled", { defaultValue: "Item fulfilled" }),
          description: t("order.itemFulfilledDescription", {
            defaultValue: "Updated fulfilled items.",
          }),
        });
      } catch (error) {
        console.error(error);
        toaster.error({
          title: t("order.itemFulfilledError", { defaultValue: "Error" }),
          description: t("order.itemFulfilledErrorDescription", {
            defaultValue: "An error occurred while updating fulfilled items.",
          }),
        });
      }
    },
    [patchCustomerOrder, t],
  );

  const updateCustomerOrderItemInProgress = useCallback(
    async (
      orderId: string,
      channelId: string,
      itemId: string,
      inProgress: boolean,
    ): Promise<void> => {
      try {
        await updateDoc(
          doc(firestore, "channels", channelId, "orders", orderId),
          {
            inProgressItems: inProgress
              ? arrayUnion(itemId)
              : arrayRemove(itemId),
            fulfilledItems: arrayRemove(itemId),
            pickedUpItems: arrayRemove(itemId),
            deliveredItems: arrayRemove(itemId),
          },
        );
        patchCustomerOrder(orderId, (order) => ({
          ...order,
          inProgressItems: updateItemIdCollection(
            order.inProgressItems,
            itemId,
            inProgress,
          ),
          fulfilledItems: order.fulfilledItems.filter(
            (value) => value !== itemId,
          ),
          pickedUpItems: order.pickedUpItems?.filter(
            (value) => value !== itemId,
          ),
          deliveredItems: order.deliveredItems?.filter(
            (value) => value !== itemId,
          ),
        }));
        toaster.success({
          title: t("order.itemInProgress", {
            defaultValue: "Item in progress",
          }),
          description: t("order.itemInProgressDescription", {
            defaultValue: "Updated in-progress items.",
          }),
        });
      } catch (error) {
        console.error(error);
        toaster.error({
          title: t("order.itemInProgressError", { defaultValue: "Error" }),
          description: t("order.itemInProgressErrorDescription", {
            defaultValue: "An error occurred while updating in-progress items.",
          }),
        });
      }
    },
    [patchCustomerOrder, t],
  );

  const updateCustomerOrderItemPriority = useCallback(
    async (
      orderId: string,
      channelId: string,
      itemId: string,
      priority: boolean,
    ): Promise<void> => {
      try {
        await updateDoc(
          doc(firestore, "channels", channelId, "orders", orderId),
          {
            priorityItems: priority ? arrayUnion(itemId) : arrayRemove(itemId),
          },
        );
        patchCustomerOrder(orderId, (order) => ({
          ...order,
          priorityItems: updateItemIdCollection(
            order.priorityItems,
            itemId,
            priority,
          ),
        }));
        toaster.success({
          title: t("order.itemPriority", { defaultValue: "Priority set" }),
          description: t("order.itemPriorityDescription", {
            defaultValue: "Updated priority items.",
          }),
        });
      } catch (error) {
        console.error(error);
        toaster.error({
          title: t("order.itemPriorityError", { defaultValue: "Error" }),
          description: t("order.itemPriorityErrorDescription", {
            defaultValue: "An error occurred while updating priority items.",
          }),
        });
      }
    },
    [patchCustomerOrder, t],
  );

  const updateCustomerOrderItemProblem = useCallback(
    async (
      orderId: string,
      channelId: string,
      itemId: string,
      problem: ItemProblem | null,
    ): Promise<void> => {
      try {
        const orderRef = doc(
          firestore,
          "channels",
          channelId,
          "orders",
          orderId,
        ) as DocumentReference<Order>;
        const result = await runTransaction(firestore, async (transaction) => {
          const orderSnapshot = await transaction.get(orderRef);
          const existingProblems = orderSnapshot.data()?.problemItems ?? [];

          if (problem === null) {
            const nextProblems = existingProblems.filter(
              (item) => item.itemId !== itemId,
            );

            transaction.update(orderRef, {
              problemItems: nextProblems,
            });

            return { isNewProblem: false, nextProblemItems: nextProblems };
          }

          const isNewProblem = !existingProblems.some(
            (item) => item.itemId === itemId,
          );
          const nextProblems = [
            ...existingProblems.filter((item) => item.itemId !== itemId),
            problem,
          ];

          transaction.update(orderRef, { problemItems: nextProblems });
          return { isNewProblem, nextProblemItems: nextProblems };
        });

        patchCustomerOrder(orderId, (order) => ({
          ...order,
          problemItems: result.nextProblemItems,
        }));

        if (problem === null) {
          toaster.success({
            title: t("order.itemProblemRemoved", {
              defaultValue: "Problem removed",
            }),
            description: t("order.itemProblemRemovedDescription", {
              defaultValue: "Item problem has been removed.",
            }),
          });
          return;
        }

        toaster.success({
          title: t("order.itemProblemAdded", {
            defaultValue: "Problem reported",
          }),
          description: t("order.itemProblemAddedDescription", {
            defaultValue: "Item problem has been recorded.",
          }),
        });

        if (result.isNewProblem) {
          void sendOrderItemProblemNotification({
            channelId,
            description: problem.description,
            itemId,
            orderId,
          })
            .then((notificationResult) => {
              if (notificationResult.error) {
                console.error(notificationResult.error);
              }
            })
            .catch((error) => {
              console.error("Failed to send item problem notification", error);
            });
        }
      } catch (error) {
        console.error(error);
        toaster.error({
          title: t("order.itemProblemError", { defaultValue: "Error" }),
          description: t("order.itemProblemErrorDescription", {
            defaultValue: "An error occurred while updating item problem.",
          }),
        });
      }
    },
    [patchCustomerOrder, t],
  );

  const handleReportItemProblem = useCallback(
    (order: Order, orderItem: OrderItem, problem?: ItemProblem) => {
      setSelectedProblemOrder(order);
      setSelectedProblemItem(orderItem);
      setExistingProblem(problem);
      setShowItemProblemDialog(true);
    },
    [],
  );

  const handleSubmitItemProblem = useCallback(
    (problem: ItemProblem | null) => {
      if (!selectedProblemOrder || !selectedProblemItem) return;
      void updateCustomerOrderItemProblem(
        selectedProblemOrder.id,
        selectedProblemOrder.channelId,
        selectedProblemItem.id,
        problem,
      );
    },
    [selectedProblemItem, selectedProblemOrder, updateCustomerOrderItemProblem],
  );

  const renderOrderItemUploadComponent = useCallback(
    (orderItem: OrderItem, helpers: { onUploadComplete: () => void }) => {
      const order = orderByItemId.get(orderItem.id);
      if (!order) return null;
      const customerId =
        typeof order.customer === "object" ? order.customer.id : customer?.id;
      if (!customerId) return null;

      return (
        <OrderItemFileUpload
          orderItem={orderItem}
          orderId={order.id}
          customerId={customerId}
          channelId={order.channelId}
          orderNumber={order.number}
          baseFolderPath={getFolderPath(order.channelId)}
          storage={storage}
          onUploadComplete={helpers.onUploadComplete}
        />
      );
    },
    [customer?.id, getFolderPath, orderByItemId],
  );

  const renderLocalOrderFilesSection = useCallback(
    (orderItem: OrderItem) => {
      if (!isElectron()) return null;
      const order = orderByItemId.get(orderItem.id);
      if (!order) return null;

      return (
        <LocalOrderFilesSection
          orderItem={orderItem}
          orderNumber={order.number || 0}
          baseFolderPath={getFolderPath(order.channelId)}
        />
      );
    },
    [getFolderPath, orderByItemId],
  );

  const columns = useMemo<CustomerOrderColumnDef[]>(
    () => [
      asCustomerOrderColumnDef(
        customerOrderColumnHelper.accessor("number", {
          cell: (info) => `#${info.getValue()}`,
          header: "#",
        }),
      ),
      asCustomerOrderColumnDef(
        customerOrderColumnHelper.accessor("status", {
          cell: (props) => t(`OrderStatus.${props.cell.getValue()}`),
          header: t("orders.status", { defaultValue: "Status" }),
        }),
      ),
      asCustomerOrderColumnDef(
        customerOrderColumnHelper.accessor("paymentStatus", {
          cell: (props) => t(`PaymentStatus.${props.cell.getValue()}`),
          header: t("customers.payment", { defaultValue: "Payment" }),
        }),
      ),
      asCustomerOrderColumnDef(
        customerOrderColumnHelper.accessor("createdAt", {
          cell: (info) =>
            info.getValue().toDate().toLocaleDateString(i18n.resolvedLanguage),
          header: t("customers.dateAdded", { defaultValue: "Date added" }),
        }),
      ),
      asCustomerOrderColumnDef(
        customerOrderColumnHelper.accessor("totalPrice", {
          cell: (info) =>
            formatPrice(
              info.getValue(),
              CurrencyEnum.PLN,
              undefined,
              undefined,
              i18n.resolvedLanguage,
            ),
          header: t("customers.price", { defaultValue: "Price" }),
          meta: {
            isNumeric: true,
          },
        }),
      ),
      asCustomerOrderColumnDef(
        customerOrderColumnHelper.display({
          id: "actions",
          cell: (props) => (
            <HStack justify={"end"}>
              <IconButtonLink
                lng={i18n.resolvedLanguage}
                href={`/orders/${props.row.original.id}?channelId=${props.row.original.channelId}`}
                icon={"open_in_new"}
                ariaLabel={t("customers.preview", { defaultValue: "Preview" })}
              />
            </HStack>
          ),
          meta: {
            isNumeric: true,
          },
        }),
      ),
    ],
    [i18n.resolvedLanguage, t],
  );

  async function handleUnlinkProductFromCustomer(
    productId: string,
    customerId: string,
  ) {
    await unlinkProductFromCustomer(productId, customerId);
    mutate({
      ...(customer as Customer),
      linkedProductsIds: customer?.linkedProductsIds?.filter(
        (linkedProductId) => linkedProductId !== productId,
      ),
    });
    toaster.success({
      title: t("customers.success", { defaultValue: "Success" }),
      description: t("customers.productUnlinkedSuccess", {
        defaultValue: "Product has been successfully unlinked from user",
      }),
      duration: 5000,
    });
  }

  async function handleUnlinkCustomerFromGroup(customerGroupId: string) {
    if (!customer) return;
    try {
      await unlinkCustomerFromCustomerGroup(customer.id, customerGroupId);
      mutate({
        ...customer,
        customerGroupIds: customer.customerGroupIds?.filter(
          (id) => id !== customerGroupId,
        ),
      });
      toaster.success({
        title: t("common.success"),
        description: t("customers.groupUnlinkedSuccess", {
          defaultValue: "Customer has been successfully removed from the group.",
        }),
        duration: 5000,
      });
    } catch (error) {
      console.error(error);
      toaster.error({
        title: t("common.error"),
        description: t("customers.groupUnlinkFailed", {
          defaultValue: "Failed to remove customer from the group.",
        }),
        duration: 5000,
      });
    }
  }

  async function handleSaveAutomation() {
    if (!customer) return;
    if (automationEnabled && !automationClientId.trim()) {
      toaster.warning({
        title: t("common.warning", { defaultValue: "Warning" }),
        description: t("customers.fakturowniaAutomation.missingClientId", {
          defaultValue: "Enter Fakturownia client ID",
        }),
      });
      return;
    }
    setSavingAutomation(true);
    try {
      await setCustomerInvoiceAutomation(firestore, customer.id, {
        enabled: automationEnabled,
        fakturowniaClientId: automationClientId.trim(),
      });
      await mutateAutomation();
      toaster.success({
        title: t("common.success", { defaultValue: "Success" }),
        description: t("customers.fakturowniaAutomation.saved", {
          defaultValue: "Fakturownia automation settings saved",
        }),
      });
    } catch (e) {
      console.error(e);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("customers.fakturowniaAutomation.saveError", {
          defaultValue: "Failed to save Fakturownia automation settings",
        }),
      });
    } finally {
      setSavingAutomation(false);
    }
  }

  // Server-side pagination for customer orders (uses Firestore collectionGroup)
  async function showCustomerOrders(
    type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST",
    limit: number,
  ): Promise<void> {
    if (!customer?.id) return;
    setIsLoadingCustomerOrders(true);
    try {
      const dbLib = (await import("@konfi/firebase")).db;
      const baseConstraints: QueryConstraint[] = [
        where("customer.id", "==", customer.id),
        orderBy("createdAt", "desc"),
      ];

      let paginationConstraints: QueryConstraint[] = baseConstraints;

      const currentIndex = ordersPageIndex;
      // compute cursor constraints and target index
      let targetIndex = currentIndex;
      let cursorConstraints: QueryConstraint[] = [];

      if (type === "NEXT") {
        const lastDoc = pageLastDocs.current[currentIndex];
        const lastOrder = lastDoc?.data();
        if (lastOrder?.createdAt) {
          cursorConstraints = [startAfter(lastOrder.createdAt)];
        }
        targetIndex = currentIndex + 1;
      } else if (type === "PREVIOUS") {
        const firstDoc = pageFirstDocs.current[currentIndex];
        const firstOrder = firstDoc?.data();
        if (firstOrder?.createdAt) {
          cursorConstraints = [
            endBefore(firstOrder.createdAt),
            limitToLast(limit),
          ];
        } else {
          cursorConstraints = [limitToLast(limit)];
        }
        targetIndex = Math.max(0, currentIndex - 1);
      } else if (type === "FIRST") {
        cursorConstraints = [];
        targetIndex = 0;
      } else if (type === "LAST") {
        // We will compute the last page index after fetching count below, for now use limitToLast
        cursorConstraints = [limitToLast(limit)];
      }

      paginationConstraints = [...baseConstraints, ...cursorConstraints];

      const collection = dbLib.collectionGroup<Order>(
        firestore,
        "orders",
        limit,
        paginationConstraints,
      );
      const snap = await getDocs(collection);

      const results = snap.docs.map((orderDoc) => ({
        ...orderDoc.data(),
        id: orderDoc.id,
      })) as Order[];

      // get total count for pagination
      try {
        const countQuery = dbLib.collectionGroup<Order>(
          firestore,
          "orders",
          999999,
          [where("customer.id", "==", customer.id)],
        );
        const countRes = await getCountFromServer(countQuery);
        setCustomerOrdersCount(countRes.data().count);
        if (type === "LAST") {
          targetIndex = Math.max(
            0,
            Math.ceil(countRes.data().count / Math.max(1, limit)) - 1,
          );
        }
      } catch (err) {
        console.error("Error fetching customer orders count", err);
      }

      // store page first/last docs under targetIndex
      if (snap.docs.length > 0) {
        pageFirstDocs.current[targetIndex] = snap.docs[0];
        pageLastDocs.current[targetIndex] = snap.docs[snap.docs.length - 1];
      }

      // Update pageIndex
      setOrdersPageIndex(targetIndex);

      setCustomerOrders(results);
    } catch (error) {
      console.error(error);
      setCustomerOrders([]);
    } finally {
      setIsLoadingCustomerOrders(false);
    }
  }
  return (
    <Skeleton loading={isLoadingCustomer}>
      <Grid
        minW={"100%"}
        templateColumns={["repeat(1, 1fr)", "repeat(5, 1fr)"]}
        columnGap={["0", "8"]}
        rowGap={["6", "8"]}
      >
        <GridItem colSpan={[1, 3]} overflowX={"auto"}>
          <CustomHeading
            heading={customer?.name ?? ""}
            mb={8}
            breadcrumb={true}
            goBack={true}
            t={t}
          />
          {customer?.createdAt && (
            <Text pb={"8"}>
              {customer.createdAt
                .toDate()
                .toLocaleDateString(i18n.resolvedLanguage)}
            </Text>
          )}
          <Box
            mb={["6", "8"]}
            border={"1px solid"}
            borderColor={borderColor}
            borderRadius={"3xl"}
            p={"8"}
          >
            <Heading size={"md"}>
              {t("customers.orders", { defaultValue: "Orders" })}
            </Heading>
            <Separator my={"6"} />
            <Skeleton loading={isLoadingCustomerOrders}>
              {customerOrders && !isEmpty(customerOrders) && (
                <DataTable
                  columns={columns}
                  data={customerOrders}
                  t={t}
                  i18n={i18n}
                  paginationType="controlled"
                  itemsCount={customerOrdersCount}
                  setPageIndex={setOrdersPageIndex}
                  defaultPageSize={ordersPageSize}
                  onPageSizeChange={setOrdersPageSize}
                  enablePageSizeSelection
                  show={handleOrdersTableShow}
                  loading={isLoadingCustomerOrders}
                  isRowCollapsable={true}
                  storage={storage}
                  updateItemFulfillment={updateCustomerOrderItemFulfillment}
                  updateItemInProgress={updateCustomerOrderItemInProgress}
                  updateItemPriority={updateCustomerOrderItemPriority}
                  onReportItemProblem={handleReportItemProblem}
                  onFileDownload={onFileDownload}
                  onFileDelete={onFileDelete}
                  showFiles={true}
                  renderUploadComponent={renderOrderItemUploadComponent}
                  renderAdditionalFileSections={renderLocalOrderFilesSection}
                />
              )}
              {!isLoadingCustomerOrders &&
                (isUndefined(customerOrders) || isEmpty(customerOrders)) && (
                  <Empty
                    title={t("orders.noOrders", {
                      defaultValue: "No orders found",
                    })}
                    description={t("orders.noOrdersDescription", {
                      defaultValue:
                        "This customer has not placed any orders yet.",
                    })}
                    icon={"orders"}
                  />
                )}
            </Skeleton>
          </Box>
          <Box
            mb={["6", "8"]}
            border={"1px solid"}
            borderColor={borderColor}
            borderRadius={"3xl"}
            p={"8"}
          >
            <Heading size={"md"}>
              {t("customers.contacts", { defaultValue: "Contacts" })}
            </Heading>
            {customer?.contacts && !(customer?.contacts.length <= 0) ? (
              customer?.contacts?.map((contact, index) => (
                <Fragment key={index}>
                  <Separator my={"6"} />
                  <Heading size={"sm"}>{contact.name}</Heading>
                  <Text>{contact.email}</Text>
                  <Text>{contact.phone}</Text>
                </Fragment>
              ))
            ) : (
              <>
                <Separator my={"6"} />
                <Text>
                  {t("customers.noContacts", { defaultValue: "No contacts" })}
                </Text>
              </>
            )}
          </Box>
          <Box
            border={"1px solid"}
            borderColor={borderColor}
            borderRadius={"3xl"}
            p={"8"}
          >
            <Heading size={"md"}>
              {t("customers.addresses", { defaultValue: "Addresses" })}
            </Heading>
            {customer?.addresses && !(customer?.addresses.length <= 0) ? (
              customer?.addresses?.map((address, index) => (
                <Fragment key={index}>
                  <Separator my={"6"} />
                  <Heading size={"sm"}>{address.name}</Heading>
                  <Text>
                    {formatStreetLine(
                      address.street,
                      address.number,
                      address.local,
                    )}
                  </Text>
                  <Text>
                    {address.zip} {address.city}
                  </Text>
                  <Text>{address.country}</Text>
                </Fragment>
              ))
            ) : (
              <>
                <Separator my={"6"} />
                <Text>
                  {t("customers.noAddresses", { defaultValue: "No addresses" })}
                </Text>
              </>
            )}
          </Box>
        </GridItem>
        <GridItem minW={"100%"} colSpan={[1, 2]} mt={8}>
          <Stack
            justifyContent={"flex-end"}
            direction={{ base: "row", xlDown: "column" }}
            pt={"8"}
            pb={"7"}
          >
            <Button
              onClick={() => handleUpdateFormOpen()}
              variant={"solid"}
              colorPalette={"primary"}
            >
              <MaterialSymbol>edit</MaterialSymbol>
              {t("customers.edit", { defaultValue: "Edit" })}
            </Button>
          </Stack>
          <Notes notes={notes ?? []} />
          <Box
            border={"1px solid"}
            borderColor={borderColor}
            borderRadius={"3xl"}
            p={"8"}
          >
            {customer && (
              <SpecialNotes specialNotes={customer.specialNotes} t={t} />
            )}
          </Box>
          <Box
            mt={["6", "8"]}
            border={"1px solid"}
            borderColor={borderColor}
            borderRadius={"3xl"}
            p={"8"}
          >
            <Heading size={"md"}>
              {t("customers.data", { defaultValue: "Data" })}
            </Heading>
            <Separator my={"6"} />
            <Text>{customer?.name}</Text>
            <Text>{customer?.personName}</Text>
            <Text>{customer?.nip}</Text>
          </Box>
          {customer ? (
            <CustomerStoreCreditPanel
              customer={customer}
              onUpdated={async () => {
                await mutate();
              }}
            />
          ) : null}
          <Box
            mt={["6", "8"]}
            border={"1px solid"}
            borderColor={borderColor}
            borderRadius={"3xl"}
            p={"8"}
          >
            <HStack justify="space-between" align="center" mb={"6"}>
              <Heading size={"md"}>
                {t("forms.labels.customerGroups", {
                  defaultValue: "Customer groups",
                })}
              </Heading>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowLinkGroupDialog(true)}
              >
                <MaterialSymbol>group_add</MaterialSymbol>
                {t("common.add", { defaultValue: "Add" })}
              </Button>
            </HStack>
            {assignedCustomerGroups.length > 0 ? (
              <Flex gap={2} wrap="wrap">
                {assignedCustomerGroups.map((customerGroup) => (
                  <Tag
                    key={customerGroup.id}
                    size="sm"
                    closable
                    onClose={() => handleUnlinkCustomerFromGroup(customerGroup.id)}
                  >
                    {customerGroup.name}
                  </Tag>
                ))}
              </Flex>
            ) : (
              <Text color="fg.muted">
                {t("customers.noCustomerGroups", {
                  defaultValue: "No groups",
                })}
              </Text>
            )}
          </Box>
          {hasFakturowniaKey && (
            <Box
              mt={["6", "8"]}
              border={"1px solid"}
              borderColor={borderColor}
              borderRadius={"3xl"}
              p={"8"}
            >
              <Heading size={"md"}>
                {t("customers.fakturowniaAutomation.title", {
                  defaultValue: "Fakturownia estimate automation",
                })}
              </Heading>
              <Separator my={"6"} />
              <Skeleton loading={isLoadingAutomation}>
                <Stack gap={4}>
                  <HStack justify="space-between" align="center">
                    <Switch.Root
                      checked={automationEnabled}
                      onCheckedChange={({ checked }) => {
                        setAutomationEnabled(checked);
                      }}
                    >
                      <Switch.HiddenInput />
                      <Switch.Control />
                      <Switch.Label>
                        {t("customers.fakturowniaAutomation.enabled", {
                          defaultValue: "Enable automatic estimate invoices",
                        })}
                      </Switch.Label>
                    </Switch.Root>
                  </HStack>
                  <Combobox.Root
                    collection={automationClientOptionsCollection}
                    inputValue={automationClientInputValue}
                    onInputValueChange={(details) => {
                      const nextValue = details.inputValue ?? "";
                      setAutomationClientInputValue(nextValue);
                      if (automationClientId) {
                        setAutomationClientId("");
                      }
                    }}
                    value={automationClientId ? [automationClientId] : []}
                    onValueChange={(details) => {
                      const selectedItem = details.items[0] as
                        | {
                            value: string;
                            label: string;
                            secondaryLabel?: string;
                            client: Client;
                          }
                        | undefined;
                      if (selectedItem) {
                        const clientId =
                          selectedItem.client.id !== undefined &&
                          selectedItem.client.id !== null
                            ? String(selectedItem.client.id)
                            : "";
                        setAutomationClientId(clientId);
                        setAutomationClientInputValue(selectedItem.label);
                      } else {
                        setAutomationClientId("");
                      }
                    }}
                    openOnClick
                    selectionBehavior="replace"
                  >
                    <Combobox.Control>
                      <Combobox.Input
                        placeholder={t(
                          "customers.fakturowniaAutomation.clientId",
                          { defaultValue: "Fakturownia client ID" },
                        )}
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
                          <Combobox.Empty>
                            {automationClientInputValue.trim().length < 2
                              ? t("admin.typeToSearchFakturownia", {
                                  defaultValue:
                                    "Type at least 2 characters to search Fakturownia",
                                })
                              : isAutomationClientLoading
                                ? t(
                                    "fakturownia.invoiceCreate.clientSearchLoading",
                                    { defaultValue: "Searching clients..." },
                                  )
                                : t(
                                    "fakturownia.invoiceCreate.clientSearchEmpty",
                                    { defaultValue: "No clients found" },
                                  )}
                          </Combobox.Empty>
                          {!isAutomationClientLoading &&
                            automationClientOptionsCollection.items.map(
                              (item, index) => (
                                <Combobox.Item
                                  item={item}
                                  key={`${item.value}-${index}`}
                                >
                                  <Stack align="start" gap={0} flex="1">
                                    <Text fontWeight="medium">
                                      {item.label}
                                    </Text>
                                    {item.secondaryLabel && (
                                      <Text fontSize="sm" color="fg.muted">
                                        {item.secondaryLabel}
                                      </Text>
                                    )}
                                  </Stack>
                                  <Combobox.ItemIndicator />
                                </Combobox.Item>
                              ),
                            )}
                        </Combobox.Content>
                      </Combobox.Positioner>
                    </Portal>
                  </Combobox.Root>
                  <Button
                    loading={savingAutomation}
                    colorPalette="primary"
                    onClick={() => {
                      void handleSaveAutomation();
                    }}
                  >
                    <MaterialSymbol>save</MaterialSymbol>
                    {t("actions.saveChanges", {
                      defaultValue: "Save changes",
                    })}
                  </Button>
                  <Text fontSize="sm" color="gray.500">
                    {t("customers.fakturowniaAutomation.description", {
                      defaultValue:
                        "When enabled, estimate invoices will be created automatically on Sundays and on the last day of the month using the selected Fakturownia client as buyer.",
                    })}
                  </Text>
                </Stack>
              </Skeleton>
            </Box>
          )}
          {linkedProducts && !isEmpty(linkedProducts) && customer && (
            <Skeleton
              loading={isLoading}
              mt={["6", "8"]}
              border={"1px solid"}
              borderColor={borderColor}
              borderRadius={"3xl"}
              p={"8"}
            >
              {" "}
              <Heading size="md" mb={4}>
                {t("customers.b2bProducts", { defaultValue: "B2B Products" })}:
              </Heading>
              {linkedProducts.map((product) => (
                <Tag
                  closable
                  onClose={() =>
                    handleUnlinkProductFromCustomer(product.id, customer.id)
                  }
                  size="sm"
                  key={product.id}
                  mr={1}
                >
                  {product.name}
                </Tag>
              ))}
            </Skeleton>
          )}
        </GridItem>
      </Grid>
      {customer && (
        <CustomerInfo
          id={customer.id}
          updatedAt={customer.updatedAt}
          updatedBy={customer.updatedBy}
          createdAt={customer.createdAt}
          createdBy={customer.createdBy}
          t={t}
          lng={i18n.resolvedLanguage}
        />
      )}
      {showUpdateForm && (
        <CustomerForm
          customer={customer!}
          type={"UPDATE"}
          open={showUpdateForm}
          setOpen={setShowUpdateForm}
          onSuccess={() => mutate()}
        />
      )}
      <LinkCustomerToGroupDialog
        customerId={customer?.id ?? null}
        isOpen={showLinkGroupDialog}
        onClose={() => setShowLinkGroupDialog(false)}
        customerGroupOptions={customerGroupOptions}
        alreadyAssignedGroupIds={customer?.customerGroupIds ?? []}
        onSuccess={() => mutate()}
      />
      <ItemProblemDialog
        open={showItemProblemDialog}
        onOpenChange={(open) => {
          setShowItemProblemDialog(open);
          if (!open) {
            setSelectedProblemOrder(null);
            setSelectedProblemItem(null);
            setExistingProblem(undefined);
          }
        }}
        orderItem={selectedProblemItem}
        existingProblem={existingProblem}
        onSubmit={handleSubmitItemProblem}
      />
    </Skeleton>
  );
}

async function fetchCustomer(id: string | null): Promise<Customer | undefined> {
  if (isNull(id)) return;
  const getCustomerDoc = (await import("@konfi/firebase")).getDoc;
  const db = (await import("@konfi/firebase")).db;
  const clientFirestore = (await import("@/lib/firebase/clientApp")).firestore;
  const result = await getCustomerDoc(db.doc(clientFirestore, "customers", id));
  if (!isUndefined(result)) {
    const customer = result as Customer;
    return customer;
  } else return;
}

async function fetchLinkedProductsIds(ids: string[]): Promise<Product[]> {
  return getProductsByIds(firestore, ids, true);
}
