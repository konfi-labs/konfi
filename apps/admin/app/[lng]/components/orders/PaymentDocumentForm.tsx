import { useT } from "@/i18n/client";
import {
  getPaymentDocumentOrderUpdate,
  hasPaymentDocumentValue,
} from "@/lib/orders/payment-document";
import { Button, chakra, Input } from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import { CustomDialog, Field, toaster } from "@konfi/components";
import { Order, PaymentStatus } from "@konfi/types";
import { PaymentDocumentSchema } from "@konfi/utils";
import { useOrders } from "context/orders";
import { isUndefined } from "es-toolkit";
import { TFunction } from "i18next";
import { Dispatch, startTransition, useEffect, useState } from "react";
import {
  FieldErrors,
  SubmitHandler,
  useForm,
  UseFormHandleSubmit,
  UseFormRegister,
} from "react-hook-form";
import { InferType } from "yup";

type Inputs = InferType<typeof PaymentDocumentSchema>;
type PaymentDocumentFieldName = "paymentDocumentId" | "proformaDocumentId";
type PaymentDocumentDebugReason =
  | "empty-values"
  | "missing-context"
  | "save-error";

function getSubmittedFormValue(
  event: Parameters<SubmitHandler<Inputs>>[1],
  fieldName: PaymentDocumentFieldName,
) {
  const form = [event?.currentTarget, event?.target].find(
    (target): target is HTMLFormElement => target instanceof HTMLFormElement,
  );
  if (!(form instanceof HTMLFormElement)) {
    return undefined;
  }

  const value = new FormData(form).get(fieldName);
  return typeof value === "string" ? value : undefined;
}

function getPaymentDocumentDebugReasonLabel(
  reason: PaymentDocumentDebugReason,
  t: TFunction,
) {
  switch (reason) {
    case "empty-values":
      return t("payment_document.debug.empty_values", {
        defaultValue: "empty submitted values",
      });
    case "missing-context":
      return t("payment_document.debug.missing_context", {
        defaultValue: "missing order or channel id",
      });
    case "save-error":
      return t("payment_document.debug.save_error", {
        defaultValue: "save action failed",
      });
  }
}

const PaymentDocumentForm = ({
  paymentDocumentId,
  proformaDocumentId,
  paymentStatus,
  orderId,
  channelId,
  open,
  setOpen,
  setOptimisticOrder,
}: {
  paymentDocumentId?: string;
  proformaDocumentId?: string;
  paymentStatus?: PaymentStatus;
  orderId?: string;
  channelId?: string;
  open?: boolean;
  setOpen?: Dispatch<React.SetStateAction<boolean>>;
  setOptimisticOrder?: (action: Partial<Order>) => void;
}) => {
  const { updatePaymentDocument } = useOrders();
  const { t } = useT();
  const [isSaving, setIsSaving] = useState(false);
  const {
    reset,
    register,
    handleSubmit,
    formState: { errors, touchedFields },
  } = useForm<Inputs>({
    defaultValues: {
      paymentDocumentId: paymentDocumentId || "",
      proformaDocumentId: proformaDocumentId || "",
    },
    resolver: yupResolver(PaymentDocumentSchema),
  });

  const onSubmit: SubmitHandler<Inputs> = async (data, event) => {
    const submittedPaymentDocumentId =
      getSubmittedFormValue(event, "paymentDocumentId") ??
      data.paymentDocumentId ??
      "";
    const submittedProformaDocumentId =
      getSubmittedFormValue(event, "proformaDocumentId") ??
      data.proformaDocumentId ??
      "";

    const showUpdateError = (reason: PaymentDocumentDebugReason) => {
      const reasonLabel = getPaymentDocumentDebugReasonLabel(reason, t);

      console.warn("[PaymentDocumentForm] update failed", {
        channelId,
        orderId,
        paymentDocumentId: submittedPaymentDocumentId,
        proformaDocumentId: submittedProformaDocumentId,
        reason,
      });

      toaster.error({
        title: t("error.general", { defaultValue: "Error" }),
        description: t("payment_document.update_failed_debug", {
          defaultValue: "Failed to update payment document. Debug: {{reason}}.",
          reason: reasonLabel,
        }),
      });
    };

    if (!orderId || !channelId) {
      showUpdateError("missing-context");
      return;
    }
    const nextPaymentDocumentId = submittedPaymentDocumentId.trim();
    const nextProformaDocumentId = submittedProformaDocumentId.trim();

    if (!nextPaymentDocumentId && !nextProformaDocumentId) {
      showUpdateError("empty-values");
      return;
    }

    const nextState = getPaymentDocumentOrderUpdate(
      nextPaymentDocumentId,
      nextProformaDocumentId,
    );
    const prevState: Partial<Order> = {
      paymentDocumentId: paymentDocumentId || "",
      proformaDocumentId: proformaDocumentId || "",
    };
    if (paymentStatus !== undefined) {
      prevState.paymentStatus = paymentStatus;
    }
    setIsSaving(true);
    try {
      // Optimistically update the parent order state and store previous
      if (setOptimisticOrder) {
        startTransition(() => {
          setOptimisticOrder(nextState);
        });
      }
      // Update the document in the database
      const savedUpdate = await updatePaymentDocument(
        orderId,
        channelId,
        nextState.paymentDocumentId,
        nextState.proformaDocumentId,
      );
      const savedState = {
        ...nextState,
        ...savedUpdate,
      };
      if (setOptimisticOrder) {
        startTransition(() => {
          setOptimisticOrder(savedState);
        });
      }
      reset({
        paymentDocumentId: savedState.paymentDocumentId ?? "",
        proformaDocumentId: savedState.proformaDocumentId ?? "",
      });
      // Close the dialog if it's a dialog
      if (setOpen) {
        setOpen(false);
      }
    } catch (error) {
      console.error(error);
      showUpdateError("save-error");
      if (setOptimisticOrder) {
        startTransition(() => {
          setOptimisticOrder(prevState);
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const isDialogMode = !isUndefined(open) && !isUndefined(setOpen);
    if (!isDialogMode || !open) return;
    reset({
      paymentDocumentId: paymentDocumentId || "",
      proformaDocumentId: proformaDocumentId || "",
    });
  }, [open, paymentDocumentId, proformaDocumentId, reset, setOpen]);

  return !isUndefined(open) && !isUndefined(setOpen) ? (
    <CustomDialog
      header={t("admin.paymentDocument")}
      open={open}
      setOpen={setOpen}
    >
      <Form
        onSubmit={onSubmit}
        isSaving={isSaving}
        register={register}
        errors={errors}
        touchedFields={touchedFields}
        handleSubmit={handleSubmit}
        paymentDocumentId={paymentDocumentId}
        proformaDocumentId={proformaDocumentId}
        t={t}
      />
    </CustomDialog>
  ) : (
    <Form
      onSubmit={onSubmit}
      isSaving={isSaving}
      register={register}
      errors={errors}
      touchedFields={touchedFields}
      handleSubmit={handleSubmit}
      paymentDocumentId={paymentDocumentId}
      proformaDocumentId={proformaDocumentId}
      t={t}
    />
  );
};

function Form({
  onSubmit,
  isSaving,
  register,
  errors,
  touchedFields,
  handleSubmit,
  paymentDocumentId,
  proformaDocumentId,
  t,
}: {
  onSubmit: SubmitHandler<Inputs>;
  isSaving: boolean;
  register: UseFormRegister<Inputs>;
  errors: FieldErrors<Inputs>;
  touchedFields: Partial<
    Readonly<{
      paymentDocumentId?: boolean | undefined;
      proformaDocumentId?: boolean | undefined;
    }>
  >;
  handleSubmit: UseFormHandleSubmit<Inputs>;
  paymentDocumentId?: string;
  proformaDocumentId?: string;
  t: TFunction;
}) {
  const hasSavedPaymentDocument = hasPaymentDocumentValue({
    paymentDocumentId,
    proformaDocumentId,
  });

  return (
    <chakra.form
      onSubmit={handleSubmit(onSubmit)}
      w={["100%", "100%", "100%", "100%"]}
    >
      {" "}
      <Field
        label={t("admin.proformaDocumentNumber", {
          defaultValue: "Proforma document number",
        })}
        invalid={
          !!(errors.proformaDocumentId && touchedFields.proformaDocumentId)
        }
        errorText={
          errors.proformaDocumentId && errors.proformaDocumentId.message
        }
        mt="6"
      >
        <Input
          id="proformaDocumentId"
          placeholder="P/00000/00/00"
          autoComplete={"off"}
          {...register("proformaDocumentId")}
        />
      </Field>
      <Field
        label={t("admin.paymentDocumentNumber")}
        invalid={
          !!(errors.paymentDocumentId && touchedFields.paymentDocumentId)
        }
        errorText={errors.paymentDocumentId && errors.paymentDocumentId.message}
        mt="4"
      >
        <Input
          id="paymentDocumentId"
          placeholder="F/00000/00/00"
          autoComplete={"off"}
          {...register("paymentDocumentId")}
        />
      </Field>
      <Button
        mt={"4"}
        mb={"2"}
        display={"block"}
        loading={isSaving}
        type="submit"
        colorPalette={"primary"}
        w={"100%"}
      >
        {hasSavedPaymentDocument ? t("common.update") : t("common.add")}
      </Button>
    </chakra.form>
  );
}

export default PaymentDocumentForm;
