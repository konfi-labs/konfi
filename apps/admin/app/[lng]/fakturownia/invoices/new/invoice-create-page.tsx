"use client";

import { FakturowniaInvoiceForm } from "@/components/fakturownia/FakturowniaInvoiceForm";
import { FakturowniaInvoiceFormSkeleton } from "@/components/fakturownia/FakturowniaInvoiceFormSkeleton";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { Alert, Box } from "@chakra-ui/react";
import { CustomHeading } from "@konfi/components";
import { db, getDoc } from "@konfi/firebase";
import type { Order } from "@konfi/types";
import type { InvoiceKind } from "@konfi/fakturownia/out/client/models";
import { useChannels } from "context/channels";
import { isUndefined } from "es-toolkit";
import { useMemo } from "react";
import useSWR from "swr";

const fetchOrder = async (
  id: string,
  channelId: string,
): Promise<Order | undefined> => {
  if (!id) {
    return undefined;
  }

  const reference = db.doc<Order>(
    firestore,
    `/channels/${channelId}/orders`,
    id,
  );
  const result = await getDoc(reference);
  if (!isUndefined(result)) {
    return result as Order;
  }

  return undefined;
};

const fetchOrdersBatch = async (
  ids: string[],
  channelId: string,
): Promise<Order[]> => {
  const uniqueIds = Array.from(
    new Set(
      ids.filter((value) => typeof value === "string" && value.trim() !== ""),
    ),
  );
  if (uniqueIds.length === 0) {
    return [];
  }
  const results = await Promise.all(
    uniqueIds.map((id) => fetchOrder(id, channelId)),
  );
  return results.filter((order): order is Order => !isUndefined(order));
};

export default function InvoiceCreatePage({
  orderId,
  orderIds,
  channelId,
  kind,
}: {
  orderId?: string;
  orderIds?: string[];
  channelId?: string;
  kind?: InvoiceKind;
}) {
  const { t } = useT(["fakturownia", "translation"]);
  const { channel } = useChannels();

  const effectiveChannelId = useMemo(
    () => channelId || channel?.id,
    [channelId, channel],
  );

  const resolvedOrderIds = useMemo(() => {
    if (orderIds && orderIds.length > 0) {
      return Array.from(
        new Set(
          orderIds
            .flatMap((value) => value.split(","))
            .map((value) => value.trim())
            .filter((value) => value.length > 0),
        ),
      );
    }
    if (orderId) {
      return [orderId];
    }
    return [];
  }, [orderId, orderIds]);

  const formInstanceKey = useMemo(
    () =>
      [
        effectiveChannelId ?? "no-channel",
        kind ?? "default-kind",
        resolvedOrderIds.join(",") || "no-orders",
      ].join("::"),
    [effectiveChannelId, kind, resolvedOrderIds],
  );

  const {
    data: orders,
    isLoading,
    error,
  } = useSWR(
    resolvedOrderIds.length > 0 && effectiveChannelId
      ? ["orders", resolvedOrderIds.join(","), effectiveChannelId]
      : null,
    ([, joinedIds, swrChannelId]) =>
      fetchOrdersBatch(joinedIds.split(","), swrChannelId),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateOnMount: true,
    },
  );
  const missingOrderIds = useMemo(() => {
    if (!orders || resolvedOrderIds.length === 0) {
      return [];
    }
    const foundIds = new Set(orders.map((item) => item.id));
    return resolvedOrderIds.filter((id) => !foundIds.has(id));
  }, [orders, resolvedOrderIds]);

  if (isLoading) {
    return (
      <Box>
        <CustomHeading
          heading={t("ROUTES.fakturowniaInvoiceCreate", {
            defaultValue: "Create invoice",
          })}
          breadcrumb={true}
          goBack={true}
          t={t}
        />
        <FakturowniaInvoiceFormSkeleton />
      </Box>
    );
  }

  if (resolvedOrderIds.length > 0 && (!orders || orders.length === 0)) {
    return (
      <Box>
        <CustomHeading
          heading={t("ROUTES.fakturowniaInvoiceCreate", {
            defaultValue: "Create invoice",
          })}
          breadcrumb={true}
          goBack={true}
          t={t}
        />
        <Box p={4} color="red.500">
          {error
            ? error.message
            : t("fakturownia.invoiceCreate.noOrder", {
                defaultValue: "Order not found",
              })}
        </Box>
      </Box>
    );
  }

  const primaryOrder = orders?.[0];

  return (
    <Box>
      <CustomHeading
        heading={t("ROUTES.fakturowniaInvoiceCreate", {
          defaultValue: "Create invoice",
        })}
        breadcrumb={true}
        goBack={true}
        t={t}
      />
      {missingOrderIds.length > 0 && (
        <Alert.Root status="warning" mb={4}>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              {t("fakturownia.invoiceCreate.missingOrdersTitle", {
                defaultValue: "Some orders were not found",
              })}
            </Alert.Title>
            <Alert.Description>
              {t("fakturownia.invoiceCreate.missingOrdersDescription", {
                defaultValue: "Missing IDs: {{ids}}",
                ids: missingOrderIds.join(", "),
              })}
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}
      <FakturowniaInvoiceForm
        key={formInstanceKey}
        order={primaryOrder}
        orders={orders}
        initialKind={kind}
      />
    </Box>
  );
}
