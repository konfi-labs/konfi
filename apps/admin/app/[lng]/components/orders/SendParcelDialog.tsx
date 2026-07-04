"use client";

import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { Box, Skeleton, Text } from "@chakra-ui/react";
import { Order } from "@konfi/types";
import { isNull, isUndefined } from "es-toolkit";
import { doc, onSnapshot } from "firebase/firestore";
import { Dispatch, SetStateAction, useEffect, useState } from "react";
import Drawer from "../Drawer";
import { SendParcelForm } from "./SendParcelForm";

interface SendParcelDialogProps {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  order?: Order;
  orderId?: string;
  channelId?: string;
}

export function SendParcelDialog({
  open,
  setOpen,
  order: initialOrder,
  orderId,
  channelId,
}: SendParcelDialogProps) {
  const { t } = useT(["order", "translation"]);
  const [order, setOrder] = useState<Order | undefined>(initialOrder);
  const [loadingOrder, setLoadingOrder] = useState(false);

  // Load order data if only orderId and channelId are provided
  useEffect(() => {
    if (initialOrder) {
      setOrder(initialOrder);
      return;
    }

    if (isUndefined(orderId) || isNull(channelId) || !open) return;

    setLoadingOrder(true);
    const orderRef = doc(firestore, `channels/${channelId}/orders/${orderId}`);
    const unsubscribe = onSnapshot(
      orderRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const orderData = { ...snapshot.data(), id: snapshot.id } as Order;
          setOrder(orderData);
        }
        setLoadingOrder(false);
      },
      () => setLoadingOrder(false),
    );

    return () => unsubscribe();
  }, [initialOrder, orderId, channelId, open]);

  const handleSuccess = () => {
    setOpen(false);
  };

  const handleCancel = () => {
    setOpen(false);
  };

  return (
    <Drawer
      header={
        order
          ? t("order.sendParcelForm.subtitle", {
              defaultValue: "Create a parcel shipment for order #{{number}}",
              number: order.number || order.id,
            })
          : t("order.sendParcelForm.title", { defaultValue: "Send Parcel" })
      }
      open={open}
      setOpen={setOpen}
      size="full"
    >
      {open && (
        <Skeleton loading={loadingOrder}>
          {order ? (
            <SendParcelForm
              order={order}
              onSuccess={handleSuccess}
              onCancel={handleCancel}
              showCancelButton={true}
            />
          ) : (
            <Box p={8}>
              <Text>
                {t("order.sendParcelForm.orderNotFound", {
                  defaultValue: "Order not found",
                })}
              </Text>
            </Box>
          )}
        </Skeleton>
      )}
    </Drawer>
  );
}
