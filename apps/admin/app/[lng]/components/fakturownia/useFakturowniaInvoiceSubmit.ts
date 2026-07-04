import {
  createInvoiceAction,
  downloadInvoicePdf,
  sendInvoiceByEmail,
} from "@/actions/fakturownia";
import { useChannels } from "@/context/channels";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import {
  getNormalizedCountryCode,
  normalizeCountryCode,
} from "@/lib/fakturownia/country";
import { resolveFakturowniaPaymentType } from "@/lib/fakturownia/payment-type";
import { firestore } from "@/lib/firebase/clientApp";
import { toaster } from "@konfi/components";
import { useOrders } from "context/orders";
import type {
  Invoice,
  InvoicePosition,
} from "@konfi/fakturownia/out/client/models";
import { db, tenantStoragePaths, update, upload } from "@konfi/firebase";
import type { Order } from "@konfi/types";
import { isNestedCustomer, PaymentStatus, UnitReadable } from "@konfi/types";
import { multiplyCurrency, roundTotal } from "@konfi/utils";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import type { Dispatch, SetStateAction } from "react";
import type { UseFormReset, UseFormSetError } from "react-hook-form";
import {
  formatFakturowniaIntegrationActionError,
  formatKsefReadinessIssues,
} from "./FakturowniaErrors";
import {
  formatTodayForKsef,
  ksefInvoiceDataFromCreateParams,
  validateKsefReadiness,
} from "@/lib/fakturownia/ksef-readiness";
import {
  resolveRecipientRole,
  resolveRecipientRoleDescription,
} from "./invoice-form-position-builder";
import type { InvoiceFormValues } from "./invoice-form-types";
import { toTaxNumeric } from "./invoice-helpers";

interface UseFakturowniaInvoiceSubmitArgs {
  pendingFormValues: InvoiceFormValues | null;
  setPendingFormValues: Dispatch<SetStateAction<InvoiceFormValues | null>>;
  isCreatingInvoice: boolean;
  setIsCreatingInvoice: Dispatch<SetStateAction<boolean>>;
  setIsConfirmDialogOpen: Dispatch<SetStateAction<boolean>>;
  setCreatedInvoice: Dispatch<SetStateAction<Invoice | null>>;
  shouldBlockSubmit: boolean;
  setError: UseFormSetError<InvoiceFormValues>;
  confirmDefaultComputerChannel: (
    channelId: string | undefined,
    onConfirm: () => void,
    reason: "department",
  ) => void | Promise<void>;
  getDepartmentChannelId: (
    departmentId: string | undefined,
  ) => string | undefined;
  order?: Order;
  aggregatedOrders: Order[];
  resolvedOrderChannelId?: string;
  defaultValues: InvoiceFormValues;
  reset: UseFormReset<InvoiceFormValues>;
  setBuyerNameInputValue: Dispatch<SetStateAction<string>>;
  setRecipientNameInputValue: Dispatch<SetStateAction<string>>;
  setBuyerClientDescription: Dispatch<SetStateAction<string | undefined>>;
  setPaidAmountManuallyEdited: Dispatch<SetStateAction<boolean>>;
  setStatusManuallyEdited: Dispatch<SetStateAction<boolean>>;
}

export function useFakturowniaInvoiceSubmit({
  pendingFormValues,
  setPendingFormValues,
  isCreatingInvoice,
  setIsCreatingInvoice,
  setIsConfirmDialogOpen,
  setCreatedInvoice,
  shouldBlockSubmit,
  setError,
  confirmDefaultComputerChannel,
  getDepartmentChannelId,
  order,
  aggregatedOrders,
  resolvedOrderChannelId,
  defaultValues,
  reset,
  setBuyerNameInputValue,
  setRecipientNameInputValue,
  setBuyerClientDescription,
  setPaidAmountManuallyEdited,
  setStatusManuallyEdited,
}: UseFakturowniaInvoiceSubmitArgs) {
  const { t, i18n } = useT(["fakturownia", "translation"]);
  const { channel } = useChannels();
  const tenantContext = useTenantContext();
  const { updatePaymentDocument } = useOrders();
  const router = useRouter();

  const handleFormSubmit = (values: InvoiceFormValues) => {
    if (shouldBlockSubmit) {
      setError("departmentId", {
        type: "required",
        message: t("fakturownia.invoiceCreate.departmentRequiredError", {
          defaultValue: "Select a department before creating the document.",
        }),
      });
      return;
    }

    const openConfirmDialog = () => {
      setPendingFormValues(values);
      setIsConfirmDialogOpen(true);
    };
    const departmentChannelId = getDepartmentChannelId(values.departmentId);
    void confirmDefaultComputerChannel(
      departmentChannelId,
      openConfirmDialog,
      "department",
    );
  };

  const handleConfirmedSubmit = async () => {
    if (!pendingFormValues || isCreatingInvoice) {
      return;
    }

    setIsCreatingInvoice(true);
    setIsConfirmDialogOpen(false);
    const values = pendingFormValues;
    setPendingFormValues(null);

    const finalBuyerName = values.buyerCompany
      ? values.buyerName
      : `${values.buyerFirstName?.trim() || ""} ${values.buyerLastName?.trim() || ""}`.trim();

    try {
      const resolvedPaymentType = resolveFakturowniaPaymentType({
        paymentType: values.paymentType,
        customPaymentType: values.customPaymentType,
      });

      const positionPayloads = values.positions.map((position) => {
        const quantityNumber = Number(position.quantity);
        const quantity =
          Number.isFinite(quantityNumber) && quantityNumber > 0
            ? quantityNumber
            : 0;
        const rawPriceNet = Number(position.priceNet);
        const priceNet =
          Number.isFinite(rawPriceNet) && rawPriceNet >= 0 ? rawPriceNet : 0;
        const taxString =
          typeof position.tax === "string" ? position.tax.trim() : "";
        const taxNumeric = toTaxNumeric(taxString);
        const taxValue =
          typeof taxNumeric === "number" && Number.isFinite(taxNumeric)
            ? taxNumeric
            : taxString !== ""
              ? taxString
              : undefined;
        const rawPriceGross = Number(position.priceGross);
        const priceGross =
          Number.isFinite(rawPriceGross) && rawPriceGross >= 0
            ? rawPriceGross
            : priceNet *
              (1 + (typeof taxNumeric === "number" ? taxNumeric : 0) / 100);
        const discountRaw = Number(position.discountPercent);
        const discountPercent =
          Number.isFinite(discountRaw) && discountRaw > 0
            ? roundTotal(Math.min(Math.max(discountRaw, 0), 100))
            : undefined;
        const rawTotalNet = Number(position.totalNet);
        const totalPriceNet = Number.isFinite(rawTotalNet)
          ? rawTotalNet
          : multiplyCurrency(priceNet, quantity);
        const rawTotalGross = Number(position.totalGross);
        const totalPriceGross = Number.isFinite(rawTotalGross)
          ? rawTotalGross
          : multiplyCurrency(priceGross, quantity);
        const rawQuantityUnit =
          typeof position.unit === "string" ? position.unit.trim() : "";
        const quantityUnitValue =
          rawQuantityUnit !== ""
            ? t(`Unit.${rawQuantityUnit}`, {
                defaultValue:
                  UnitReadable[rawQuantityUnit as keyof typeof UnitReadable] ||
                  rawQuantityUnit,
              }).trim()
            : "";
        const productIdValue =
          typeof position.productId === "string"
            ? position.productId.trim()
            : "";
        const codeValue =
          typeof position.code === "string" ? position.code.trim() : "";
        const payload: Record<string, unknown> = {
          name: position.name,
          description: position.description,
          quantity,
          priceNet,
          priceGross,
          totalPriceNet,
          totalPriceGross,
          ...(taxValue !== undefined ? { tax: taxValue } : {}),
          ...(quantityUnitValue !== ""
            ? { quantityUnit: quantityUnitValue }
            : {}),
          ...(productIdValue !== "" ? { productId: productIdValue } : {}),
          ...(codeValue !== "" ? { code: codeValue } : {}),
        };
        if (discountPercent !== undefined) {
          payload.discountPercent = discountPercent;
        }
        return payload;
      });
      const hasDiscount = positionPayloads.some((position) => {
        const value = (position as { discountPercent?: number })
          .discountPercent;
        return typeof value === "number" && value > 0;
      });
      const resolvedRecipientRole = resolveRecipientRole(values);
      const resolvedRecipientRoleDescription =
        resolveRecipientRoleDescription(values);
      const recipientPayload = values.recipientEnabled
        ? {
            ...(values.recipientId ? { recipient_id: values.recipientId } : {}),
            ...(values.recipientName?.trim()
              ? { recipient_name: values.recipientName.trim() }
              : {}),
            ...(values.recipientStreet?.trim()
              ? { recipient_street: values.recipientStreet.trim() }
              : {}),
            ...(values.recipientPostalCode?.trim()
              ? { recipient_post_code: values.recipientPostalCode.trim() }
              : {}),
            ...(values.recipientCity?.trim()
              ? { recipient_city: values.recipientCity.trim() }
              : {}),
            ...(normalizeCountryCode(values.recipientCountry)
              ? {
                  recipient_country: normalizeCountryCode(
                    values.recipientCountry,
                  ),
                }
              : {}),
            ...(values.recipientTaxNo?.trim()
              ? { recipient_tax_no: values.recipientTaxNo.trim() }
              : {}),
            ...(values.recipientEmail?.trim()
              ? { recipient_email: values.recipientEmail.trim() }
              : {}),
            ...(values.recipientPhone?.trim()
              ? { recipient_phone: values.recipientPhone.trim() }
              : {}),
            ...(values.recipientNote?.trim()
              ? { recipient_note: values.recipientNote.trim() }
              : {}),
            ...(resolvedRecipientRole
              ? { recipientRole: resolvedRecipientRole }
              : {}),
            ...(resolvedRecipientRoleDescription
              ? { recipientRoleDescription: resolvedRecipientRoleDescription }
              : {}),
          }
        : {};

      const data = {
        kind: values.kind,
        number: values.number,
        issueDate: values.issueDate,
        sellDate: values.sellDate,
        paymentTo: values.paymentTo || values.issueDate,
        paymentType: resolvedPaymentType,
        status: values.status,
        paidAmount: values.paidAmount.toString(),
        showDiscount: hasDiscount ? "1" : "0",
        currency: values.currency,
        lang: values.language,
        buyerCompany: (values.buyerCompany ? "1" : "0") as "1" | "0",
        buyerName: finalBuyerName,
        buyerFirstName: values.buyerCompany ? undefined : values.buyerFirstName,
        buyerLastName: values.buyerCompany ? undefined : values.buyerLastName,
        buyerEmail: values.buyerEmail,
        buyerTaxNo: values.buyerTaxNo,
        buyerStreet: values.buyerStreet,
        buyerPostCode: values.buyerPostalCode,
        buyerCity: values.buyerCity,
        buyerCountry: getNormalizedCountryCode(values.buyerCountry, "PL"),
        buyerPhone: values.buyerPhone,
        buyerPerson: values.buyerPerson,
        sellerPerson: values.sellerPerson?.trim() || undefined,
        positions: positionPayloads as InvoicePosition[],
        description: values.notes,
        clientId: values.clientId,
        departmentId: values.departmentId
          ? Number(values.departmentId)
          : undefined,
        warehouseId: values.warehouseId,
        place: values.place || undefined,
        issuerId: values.issuerId,
        oid: values.oid,
        splitPayment: (values.splitPayment ? "1" : "0") as "1" | "0",
        priceListId: values.priceListId,
        usePricesFromPriceLists: values.priceListId
          ? ("1" as const)
          : values.clientId
            ? ("1" as const)
            : undefined,
        ...recipientPayload,
      };

      const ksefReadiness = validateKsefReadiness(
        ksefInvoiceDataFromCreateParams(data),
        { today: formatTodayForKsef(new Date()) },
      );
      if (ksefReadiness.blockers.length > 0) {
        toaster.error({
          title: t("fakturownia.ksefReadiness.blockedTitle", {
            defaultValue: "Invoice would be rejected by KSeF",
          }),
          description: formatKsefReadinessIssues(
            ksefReadiness.blockers,
            t,
          ).join(" "),
        });
        return;
      }
      if (ksefReadiness.warnings.length > 0) {
        toaster.create({
          type: "warning",
          title: t("fakturownia.ksefReadiness.warningTitle", {
            defaultValue: "Possible KSeF issues",
          }),
          description: formatKsefReadinessIssues(
            ksefReadiness.warnings,
            t,
          ).join(" "),
        });
      }

      if (
        process.env.NODE_ENV === "development" &&
        ["vat", "proforma", "receipt"].includes(values.kind)
      ) {
        console.log("Invoice creation payload:", data);
        return;
      }

      const createInvoiceResult = await createInvoiceAction(data);
      if (!createInvoiceResult.ok) {
        toaster.error({
          title: t("fakturownia.invoiceCreate.error", {
            defaultValue: "Failed to create invoice",
          }),
          description: formatFakturowniaIntegrationActionError(
            createInvoiceResult.error,
            t,
          ),
        });
        return;
      }

      const invoice = createInvoiceResult.data;
      setCreatedInvoice(invoice || null);
      openInvoiceView(invoice);

      if (invoice && invoice.id && order) {
        await updateOrdersAfterInvoice({
          aggregatedOrders,
          invoice,
          order,
          resolvedOrderChannelId,
          tenantContext,
          updatePaymentDocument,
          values,
        });
        await sendEmailIfRequested({ invoice, t, values });
        await uploadInvoicePdf({
          aggregatedOrders,
          invoice,
          order,
          resolvedOrderChannelId,
          tenantContext,
          values,
        });
      } else {
        toaster.success({
          title: t("common.success", { defaultValue: "Success" }),
          description: t("fakturownia.invoiceCreate.success", {
            defaultValue: "Invoice created",
          }),
        });
      }

      const shouldRedirectToOrder =
        Boolean(order?.id) && aggregatedOrders.length <= 1;

      if (!shouldRedirectToOrder) {
        reset({
          ...defaultValues,
          kind: values.kind,
          departmentId: values.departmentId,
        });
        setBuyerNameInputValue("");
        setRecipientNameInputValue("");
        setBuyerClientDescription(undefined);
        setPaidAmountManuallyEdited(false);
        setStatusManuallyEdited(false);
      }

      if (shouldRedirectToOrder && order?.id) {
        const targetChannelId = resolvedOrderChannelId ?? channel?.id;
        const basePath = `/${i18n.resolvedLanguage}/orders/${order.id}`;
        const url = targetChannelId
          ? `${basePath}?channelId=${targetChannelId}`
          : basePath;
        router.push(url as Route);
      }
    } catch (error: unknown) {
      console.error("Error creating invoice", error);
      const message =
        error instanceof Error
          ? error.message
          : t("fakturownia.invoiceCreate.error", {
              defaultValue: "Failed to create invoice",
            });
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: message,
      });
    } finally {
      setIsCreatingInvoice(false);
    }
  };

  return { handleFormSubmit, handleConfirmedSubmit };
}

function openInvoiceView(invoice: Invoice | null | undefined) {
  try {
    if (invoice?.viewUrl) {
      window.open(invoice.viewUrl as string, "_blank", "noopener,noreferrer");
    }
  } catch (error) {
    console.error("Error opening view_url:", error);
  }
}

interface UpdateOrdersAfterInvoiceArgs {
  aggregatedOrders: Order[];
  invoice: Invoice;
  order: Order;
  resolvedOrderChannelId?: string;
  tenantContext: ReturnType<typeof useTenantContext>;
  updatePaymentDocument: ReturnType<typeof useOrders>["updatePaymentDocument"];
  values: InvoiceFormValues;
}

async function updateOrdersAfterInvoice({
  aggregatedOrders,
  invoice,
  order,
  resolvedOrderChannelId,
  tenantContext,
  updatePaymentDocument,
  values,
}: UpdateOrdersAfterInvoiceArgs) {
  const paymentDocumentValue =
    typeof invoice.number === "string" && invoice.number !== ""
      ? invoice.number
      : undefined;
  const ordersToUpdate =
    aggregatedOrders.length > 0 ? aggregatedOrders : order ? [order] : [];

  for (const currentOrder of ordersToUpdate) {
    if (!currentOrder.id || !resolvedOrderChannelId) {
      continue;
    }

    if (values.kind === "proforma" && paymentDocumentValue) {
      try {
        await update(
          {
            paymentStatus: PaymentStatus.PENDING,
            proformaDocumentId: paymentDocumentValue,
          },
          db.doc(
            firestore,
            `channels/${resolvedOrderChannelId}/orders`,
            currentOrder.id,
          ),
          tenantContext,
        );
      } catch (error) {
        console.error("Error updating proforma document on order:", error);
      }
    } else if (paymentDocumentValue) {
      try {
        await updatePaymentDocument(
          currentOrder.id,
          resolvedOrderChannelId,
          paymentDocumentValue,
        );
      } catch (error) {
        console.error("Error updating payment document on order:", error);
      }
    }
  }
}

async function sendEmailIfRequested({
  invoice,
  t,
  values,
}: {
  invoice: Invoice;
  t: ReturnType<typeof useT>["t"];
  values: InvoiceFormValues;
}) {
  const recipientEmail = values.buyerEmail?.trim();
  if (values.sendEmail && recipientEmail) {
    try {
      await sendInvoiceByEmail({
        invoiceId: invoice.id?.toString() ?? "",
        recipientEmail,
      });
      toaster.success({
        title: t("common.success", { defaultValue: "Success" }),
        description: t("fakturownia.invoiceCreate.successWithEmail", {
          email: recipientEmail,
        }),
      });
      return;
    } catch (emailError) {
      console.error("Error sending invoice email:", emailError);
      toaster.warning({
        title: t("common.warning", { defaultValue: "Warning" }),
        description: t("fakturownia.invoiceCreate.emailError"),
      });
    }
  }

  toaster.success({
    title: t("common.success", { defaultValue: "Success" }),
    description: t("fakturownia.invoiceCreate.success", {
      defaultValue: "Invoice created",
    }),
  });
}

async function uploadInvoicePdf({
  aggregatedOrders,
  invoice,
  order,
  resolvedOrderChannelId,
  tenantContext,
  values,
}: {
  aggregatedOrders: Order[];
  invoice: Invoice;
  order: Order;
  resolvedOrderChannelId?: string;
  tenantContext: ReturnType<typeof useTenantContext>;
  values: InvoiceFormValues;
}) {
  const ordersToUpload =
    aggregatedOrders.length > 0 ? aggregatedOrders : order ? [order] : [];
  if (ordersToUpload.length === 0 || !resolvedOrderChannelId || !invoice.id) {
    return;
  }

  try {
    const pdfData = await downloadInvoicePdf({
      invoiceId: invoice.id.toString(),
      invoiceNumber: invoice.number ?? undefined,
      invoiceKind: values.kind,
    });

    if (!pdfData?.base64 || !pdfData?.filename) {
      return;
    }

    const lastDotIndex = pdfData.filename.lastIndexOf(".");
    const baseName =
      lastDotIndex !== -1
        ? pdfData.filename.slice(0, lastDotIndex)
        : pdfData.filename;
    const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9_-]/g, "_");
    const sanitizedFilename = `${sanitizedBaseName}.pdf`;
    const byteCharacters = atob(pdfData.base64);
    const byteArray = Uint8Array.from(byteCharacters, (char) =>
      char.charCodeAt(0),
    );
    const blob = new Blob([byteArray], { type: "application/pdf" });
    const file = new File([blob], sanitizedFilename, {
      type: "application/pdf",
    });
    const uploads = ordersToUpload.reduce<Array<{ file: File; url: string }>>(
      (acc, currentOrder) => {
        if (
          !currentOrder.id ||
          !currentOrder.channelId ||
          !currentOrder.customer ||
          !isNestedCustomer(currentOrder.customer)
        ) {
          return acc;
        }
        acc.push({
          file,
          url: tenantStoragePaths.orderAttachmentFile(
            tenantContext,
            currentOrder.channelId,
            currentOrder.customer.id,
            currentOrder.id,
            sanitizedFilename,
          ),
        });
        return acc;
      },
      [],
    );

    if (uploads.length > 0) {
      await upload(uploads);
    }
  } catch (uploadError) {
    console.error("Error uploading invoice PDF:", uploadError);
  }
}
