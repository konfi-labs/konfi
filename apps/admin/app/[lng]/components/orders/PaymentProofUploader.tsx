import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { sendAttachmentNotificationForUploadedFile } from "@/actions/attachments";
import { updateOrderStatusField } from "@/actions/order-updates";
import { firestore } from "@/lib/firebase/clientApp";
import { deleteObject, download, list, upload } from "@/lib/firebase/storage";
import { HStack, IconButton, List, Text } from "@chakra-ui/react";
import { CustomDialog, MaterialSymbol, toaster } from "@konfi/components";
import { db, tenantStoragePaths, update } from "@konfi/firebase";
import {
  InternalOrder,
  isNestedCustomer,
  Order,
  PaymentStatus,
} from "@konfi/types";
import { isUndefined } from "es-toolkit";
import { Dispatch, SetStateAction, useEffect, useState } from "react";
import useSWRMutation from "swr/mutation";
import Dropzone from "../Dropzone";
import { getPaymentProofOptimisticOrderUpdate } from "./payment-proof-utils";
import PaymentDocumentForm from "./PaymentDocumentForm";

const PaymentProofUploader = ({
  order,
  open,
  setOpen,
  setOptimisticOrder,
}: {
  order?: Order | InternalOrder;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  setOptimisticOrder?: (action: Partial<Order>) => void;
}) => {
  const { t } = useT();
  const tenantContext = useTenantContext();
  const attachmentsPath =
    order && isNestedCustomer(order.customer) && order.channelId
      ? tenantStoragePaths.orderAttachmentFolder(
          tenantContext,
          order.channelId,
          order.customer.id,
          order.id,
        )
      : null;
  const { data: listResults, trigger } = useSWRMutation(
    attachmentsPath,
    async (key) => await list(key),
  );
  const [dirtyFlag, setDirtyFlag] = useState(false);

  useEffect(() => {
    if (!open || !attachmentsPath) {
      return;
    }

    void trigger();
  }, [attachmentsPath, dirtyFlag, open, trigger]);

  async function onFilesAccepted(files: File[]) {
    if (!order || !isNestedCustomer(order.customer)) return;

    const customerId = order.customer.id;
    const orderChannelId = order.channelId;

    if (!orderChannelId) {
      console.error("Channel ID is not defined");
      toaster.error({
        title: t("common.error"),
        description: t("admin.channelIdNotFoundError"),
      });
      return;
    }

    const filePaths = files.map((file) =>
      tenantStoragePaths.orderAttachmentFile(
        tenantContext,
        orderChannelId,
        customerId,
        order.id,
        file.name,
      ),
    );

    await upload(
      files.map((file, index) => ({
        file,
        url: filePaths[index],
      })),
    );
    const newPaymentDocumentId = files[0].name.split(".")[0];
    await update<Partial<Order>>(
      {
        paymentDocumentId: newPaymentDocumentId,
      },
      db.doc(firestore, "/channels/" + orderChannelId + "/orders", order.id),
      tenantContext,
    );
    await updateOrderStatusField({
      channelId: orderChannelId,
      field: "paymentStatus",
      orderId: order.id,
      source: "admin-payment-proof-upload",
      value: PaymentStatus.COMPLETED,
    });
    await Promise.allSettled(
      filePaths.map((filePath) =>
        sendAttachmentNotificationForUploadedFile({
          channelId: orderChannelId,
          customerId,
          filePath,
          orderId: order.id,
        }),
      ),
    ).then((results) => {
      results.forEach((result) => {
        if (result.status === "rejected") {
          console.error(
            "Failed to send attachment notification",
            result.reason,
          );
        }
      });
    });
    // Update optimistic state to reflect the change in UI
    if (setOptimisticOrder) {
      setOptimisticOrder(
        getPaymentProofOptimisticOrderUpdate(newPaymentDocumentId),
      );
    }
    setDirtyFlag((currentValue) => !currentValue);
  }

  async function onFileDelete(url?: string) {
    await deleteObject(url);
    setDirtyFlag((currentValue) => !currentValue);
  }

  async function onFileDownload(url?: string) {
    await download(url);
  }

  async function onFilePreview(url?: string) {
    await download(url, true);
  }

  return (
    <CustomDialog header={t("admin.attachments")} open={open} setOpen={setOpen}>
      <Dropzone
        onFilesAccepted={onFilesAccepted}
        accept={{ "application/pdf": [] }}
        maxFiles={4}
        multiple={true}
      />
      <List.Root my={"4"}>
        {!isUndefined(listResults) &&
          listResults.length > 0 &&
          listResults.map((listResult, index) => (
            <List.Item key={index}>
              <HStack justify={"space-between"}>
                <Text>{listResult.name}</Text>
                <HStack>
                  {" "}
                  <IconButton
                    onClick={() => onFilePreview(listResult.fullPath)}
                    aria-label={t("admin.preview")}
                  >
                    <MaterialSymbol>open_in_new</MaterialSymbol>
                  </IconButton>
                  <IconButton
                    onClick={() => onFileDownload(listResult.fullPath)}
                    aria-label={t("admin.download")}
                  >
                    <MaterialSymbol>download</MaterialSymbol>
                  </IconButton>
                  <IconButton
                    onClick={() => onFileDelete(listResult.fullPath)}
                    aria-label={t("common.delete")}
                    colorPalette={"red"}
                  >
                    <MaterialSymbol>delete</MaterialSymbol>
                  </IconButton>
                </HStack>
              </HStack>
            </List.Item>
          ))}
      </List.Root>
      <Text fontWeight={"bold"}>{t("admin.addDocumentName")}</Text>
      {order && (
        <PaymentDocumentForm
          paymentDocumentId={order.paymentDocumentId}
          proformaDocumentId={order.proformaDocumentId}
          paymentStatus={order.paymentStatus}
          orderId={order.id}
          channelId={order.channelId}
          setOptimisticOrder={setOptimisticOrder}
        />
      )}
    </CustomDialog>
  );
};

export default PaymentProofUploader;
