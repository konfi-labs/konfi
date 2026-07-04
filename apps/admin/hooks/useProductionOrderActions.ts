"use client";

import { sendOrderItemProblemNotification } from "@/actions/order-item-problems";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { deactivate } from "@/lib/helpers";
import { toaster } from "@konfi/components/ui/toaster";
import { db, getDoc, update } from "@konfi/firebase";
import type { ItemProblem, Order } from "@konfi/types";
import {
  arrayRemove,
  arrayUnion,
  type DocumentReference,
} from "firebase/firestore";
import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

interface UseProductionOrderActionsOptions {
  fallbackChannelId?: string;
  setLoading?: Dispatch<SetStateAction<boolean>>;
}

export function useProductionOrderActions({
  fallbackChannelId,
  setLoading: externalSetLoading,
}: UseProductionOrderActionsOptions = {}) {
  const { t } = useT(["order", "orders", "translation"]);
  const tenantContext = useTenantContext();
  const [, setInternalLoading] = useState(false);
  const setLoading = externalSetLoading ?? setInternalLoading;

  const deactivateOrder = useCallback(
    (documentId: string, orderChannelId?: string) =>
      deactivate<Order>(
        setLoading,
        "/channels/" + (orderChannelId ?? fallbackChannelId) + "/orders",
        documentId,
      ),
    [fallbackChannelId, setLoading],
  );

  const updateItemFulfillment = useCallback(
    async (
      orderId: string,
      channelId: string,
      itemId: string,
      fulfilled: boolean,
    ) => {
      try {
        await update(
          {
            fulfilledItems: fulfilled
              ? arrayUnion(itemId)
              : arrayRemove(itemId),
            inProgressItems: arrayRemove(itemId),
            pickedUpItems: arrayRemove(itemId),
            deliveredItems: arrayRemove(itemId),
          },
          db.doc(firestore, `channels/${channelId}/orders`, orderId),
          tenantContext,
        );
        toaster.create({
          title: t("order.itemFulfilled", { defaultValue: "Item fulfilled" }),
          description: t("order.itemFulfilledDescription", {
            defaultValue: "Updated fulfilled items.",
          }),
          type: "success",
        });
      } catch (error) {
        console.error(error);
        toaster.create({
          title: t("order.itemFulfilledError", { defaultValue: "Error" }),
          description: t("order.itemFulfilledErrorDescription", {
            defaultValue: "An error occurred while updating fulfilled items.",
          }),
          type: "error",
        });
      }
    },
    [t, tenantContext],
  );

  const updateItemInProgress = useCallback(
    async (
      orderId: string,
      channelId: string,
      itemId: string,
      inProgress: boolean,
    ) => {
      try {
        await update(
          {
            inProgressItems: inProgress
              ? arrayUnion(itemId)
              : arrayRemove(itemId),
            fulfilledItems: arrayRemove(itemId),
            pickedUpItems: arrayRemove(itemId),
            deliveredItems: arrayRemove(itemId),
          },
          db.doc(firestore, `channels/${channelId}/orders`, orderId),
          tenantContext,
        );
        toaster.create({
          title: t("order.itemInProgress", {
            defaultValue: "Item in progress",
          }),
          description: t("order.itemInProgressDescription", {
            defaultValue: "Updated in-progress items.",
          }),
          type: "success",
        });
      } catch (error) {
        console.error(error);
        toaster.create({
          title: t("order.itemInProgressError", { defaultValue: "Error" }),
          description: t("order.itemInProgressErrorDescription", {
            defaultValue: "An error occurred while updating in-progress items.",
          }),
          type: "error",
        });
      }
    },
    [t, tenantContext],
  );

  const updateItemPriority = useCallback(
    async (
      orderId: string,
      channelId: string,
      itemId: string,
      priority: boolean,
    ) => {
      try {
        await update(
          {
            priorityItems: priority ? arrayUnion(itemId) : arrayRemove(itemId),
          },
          db.doc(firestore, `channels/${channelId}/orders`, orderId),
          tenantContext,
        );
        toaster.create({
          title: t("order.itemPriority", { defaultValue: "Priority set" }),
          description: t("order.itemPriorityDescription", {
            defaultValue: "Updated priority items.",
          }),
          type: "success",
        });
      } catch (error) {
        console.error(error);
        toaster.create({
          title: t("order.itemPriorityError", { defaultValue: "Error" }),
          description: t("order.itemPriorityErrorDescription", {
            defaultValue: "An error occurred while updating priority items.",
          }),
          type: "error",
        });
      }
    },
    [t, tenantContext],
  );

  const updateItemProblem = useCallback(
    async (
      orderId: string,
      channelId: string,
      itemId: string,
      problem: ItemProblem | null,
    ) => {
      try {
        const orderRef = db.doc(
          firestore,
          `channels/${channelId}/orders`,
          orderId,
        );

        if (problem === null) {
          const existingOrder = await getDoc<Order>(
            orderRef as DocumentReference<Order>,
          );
          const existingProblems: ItemProblem[] =
            existingOrder?.problemItems ?? [];
          const problemsToRemove = existingProblems.filter(
            (item) => item.itemId === itemId,
          );
          await update(
            {
              problemItems: arrayRemove(...problemsToRemove),
            },
            orderRef,
            tenantContext,
          );
          toaster.create({
            title: t("order.itemProblemRemoved", {
              defaultValue: "Problem removed",
            }),
            description: t("order.itemProblemRemovedDescription", {
              defaultValue: "Item problem has been removed.",
            }),
            type: "success",
          });
        } else {
          const existingOrder = await getDoc<Order>(
            orderRef as DocumentReference<Order>,
          );
          const existingProblems: ItemProblem[] =
            existingOrder?.problemItems ?? [];
          const isNewProblem = !existingProblems.some(
            (p) => p.itemId === itemId,
          );
          const filteredProblems = existingProblems.filter(
            (p) => p.itemId !== itemId,
          );

          await update(
            {
              problemItems: [...filteredProblems, problem],
            },
            orderRef,
            tenantContext,
          );
          toaster.create({
            title: t("order.itemProblemAdded", {
              defaultValue: "Problem reported",
            }),
            description: t("order.itemProblemAddedDescription", {
              defaultValue: "Item problem has been recorded.",
            }),
            type: "success",
          });

          if (isNewProblem) {
            void sendOrderItemProblemNotification({
              channelId,
              description: problem.description,
              itemId,
              orderId,
            })
              .then((result) => {
                if (result.error) {
                  console.error(result.error);
                }
              })
              .catch((error) => {
                console.error(
                  "Failed to send item problem notification",
                  error,
                );
              });
          }
        }
      } catch (error) {
        console.error(error);
        toaster.create({
          title: t("order.itemProblemError", { defaultValue: "Error" }),
          description: t("order.itemProblemErrorDescription", {
            defaultValue: "An error occurred while updating item problem.",
          }),
          type: "error",
        });
      }
    },
    [t, tenantContext],
  );

  return {
    deactivateOrder,
    updateItemFulfillment,
    updateItemInProgress,
    updateItemPriority,
    updateItemProblem,
  };
}
