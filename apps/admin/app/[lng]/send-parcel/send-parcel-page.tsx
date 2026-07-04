"use client";

import { SendParcelForm } from "@/components/orders/SendParcelForm";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { Box, Skeleton } from "@chakra-ui/react";
import { CustomHeading } from "@konfi/components";
import { db, getDoc } from "@konfi/firebase";
import { Order } from "@konfi/types";
import { useChannels } from "context/channels";
import { isUndefined } from "es-toolkit";
import { useMemo } from "react";
import useSWR from "swr";

const fetchOrder = async (
  id: string,
  channelId: string,
): Promise<Order | undefined> => {
  if (!id) return undefined;

  const result = await getDoc<Order>(
    db.doc(firestore, `/channels/${channelId}/orders`, id),
  );
  if (!isUndefined(result)) {
    return result as Order;
  }
  return undefined;
};

export default function SendParcelPage({
  orderId,
  channelId,
}: {
  orderId: string | undefined;
  channelId: string | undefined;
}) {
  const { t } = useT(["order", "translation"]);

  const id = orderId;
  const channelIdFromParams = channelId;
  const { channel } = useChannels();

  const effectiveChannelId = useMemo(
    () => channelIdFromParams || channel?.id,
    [channelIdFromParams, channel],
  );

  const {
    data: order,
    isLoading: loadingOrder,
    error,
  } = useSWR(
    id && effectiveChannelId ? ["orders", id, effectiveChannelId] : null,
    ([_key, _id, _channelId]) => fetchOrder(_id, _channelId),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateOnMount: true,
    },
  );

  if (loadingOrder) {
    return <Skeleton height="400px" />;
  }

  if (!id) {
    return (
      <Box>
        <CustomHeading
          heading={t("ROUTES.sendParcel", { defaultValue: "Send Parcel" })}
          breadcrumb={true}
          goBack={true}
          t={t}
        />
        <SendParcelForm />
      </Box>
    );
  }

  // If we have an ID but no order was loaded, show error
  if (id && !order) {
    return (
      <Box>
        <CustomHeading
          heading={t("ROUTES.sendParcel", { defaultValue: "Send Parcel" })}
          breadcrumb={true}
          goBack={true}
          t={t}
        />
        <Box p={4} color="red.500">
          {t("order.sendParcelForm.noOrder", {
            defaultValue: "Order not found",
          })}
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      <CustomHeading
        heading={t("ROUTES.sendParcel", { defaultValue: "Send Parcel" })}
        breadcrumb={true}
        goBack={true}
        t={t}
      />
      <SendParcelForm order={order} />
    </Box>
  );
}
