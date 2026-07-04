"use client";

import { sendB2BAcceptanceEmail } from "@/actions/b2b";
import Drawer from "@/components/Drawer";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { Button, createListCollection, HStack, Stack } from "@chakra-ui/react";
import { MaterialSymbol, toaster } from "@konfi/components";
import { create, db, getCustomer, update } from "@konfi/firebase";
import {
  AddressTypeEnum,
  B2BInquiry,
  B2BInquiryStatus,
  Customer,
} from "@konfi/types";
import { generateKeywords } from "@konfi/utils";
import { useConfiguration } from "context/configuration";
import { Timestamp } from "firebase/firestore";
import { Dispatch, SetStateAction, useEffect, useMemo, useState } from "react";
import {
  CustomerFields,
  PaymentFields,
  ProductAndReasonFields,
  StatusOwnerFields,
} from "./b2b-workflow-fields";
import {
  applyCustomerToForm,
  B2BWorkflowForm,
  createInitialForm,
  getOwner,
  normalizeProductIds,
} from "./b2b-workflow-model";

export default function B2BWorkflowDrawer({
  inquiry,
  open,
  setOpen,
  onSaved,
}: {
  inquiry: B2BInquiry | null;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  onSaved: () => void;
}) {
  const { t } = useT();
  const { members } = useConfiguration();
  const [form, setForm] = useState<B2BWorkflowForm | null>(null);
  const [saving, setSaving] = useState(false);
  const tenantContext = useTenantContext();

  const statusCollection = useMemo(
    () =>
      createListCollection({
        items: Object.values(B2BInquiryStatus).map((status) => ({
          label: t(`b2b.statuses.${status}`, { defaultValue: status }),
          value: `${status}`,
        })),
      }),
    [t],
  );

  const membersCollection = useMemo(
    () =>
      createListCollection({
        items:
          members?.map((member) => ({
            label: member.name,
            value: member.id,
          })) ?? [],
      }),
    [members],
  );

  useEffect(() => {
    if (!inquiry || !open) {
      setForm(null);
      return;
    }

    const initialForm = createInitialForm(inquiry);
    setForm(initialForm);

    getCustomer(firestore, inquiry.userId).then((customer) => {
      setForm((current) =>
        current ? applyCustomerToForm(current, customer) : current,
      );
    });
  }, [inquiry, open]);

  const handleSave = async () => {
    if (!inquiry || !form) return;

    const discount = Number(form.discount);
    if (Number.isNaN(discount) || discount < 0 || discount > 100) {
      toaster.error({
        title: t("b2b.workflow.invalidDiscountTitle", {
          defaultValue: "Invalid Discount",
        }),
        description: t("b2b.workflow.invalidDiscountDescription", {
          defaultValue: "Discount must be between 0 and 100.",
        }),
      });
      return;
    }

    if (form.status === B2BInquiryStatus.ACCEPTED && !form.email.trim()) {
      toaster.error({
        title: t("b2b.workflow.missingEmailTitle", {
          defaultValue: "Email Required",
        }),
        description: t("b2b.workflow.missingEmailDescription", {
          defaultValue: "Add a customer email before approval.",
        }),
      });
      return;
    }

    setSaving(true);
    try {
      const owner = getOwner(members, form.ownerId);
      const ownerSummary = owner
        ? { id: owner.id, name: owner.name }
        : undefined;
      const customerId = inquiry.userId;
      const now = Timestamp.now();
      const linkedProductsIds = normalizeProductIds(form.linkedProductsIds);

      const customer: Customer = {
        id: customerId,
        name: form.name.trim(),
        personName: form.personName.trim(),
        email: form.email.trim(),
        nip: form.nip.trim(),
        allowedBankPayments: form.allowedBankPayments,
        allowedOnPickupPayments: form.allowedOnPickupPayments,
        allowedDefferedPayments: form.allowedDefferedPayments,
        contacts: [],
        addresses: [
          {
            ...inquiry.billing,
            type: AddressTypeEnum.BILLING,
            active: true,
          },
        ],
        specialNotes: "",
        orders: [],
        loyaltyPoints: 0,
        storeCreditBalance: 0,
        discount,
        b2b: true,
        b2bInquiryId: inquiry.id,
        linkedProductsIds,
        keywords: generateKeywords(form.name),
        linkedAuthId: customerId,
        createdBy: inquiry.createdBy,
        createdAt: inquiry.createdAt,
        updatedBy: inquiry.updatedBy,
        updatedAt: now,
        active: true,
        ...(ownerSummary ? { supportOwner: ownerSummary } : {}),
      };

      const existingCustomer = await getCustomer(firestore, customerId);
      if (existingCustomer) {
        await update(
          {
            ...customer,
            createdAt: existingCustomer.createdAt,
            createdBy: existingCustomer.createdBy,
            orders: existingCustomer.orders ?? [],
            loyaltyPoints: existingCustomer.loyaltyPoints ?? 0,
            storeCreditBalance: existingCustomer.storeCreditBalance ?? 0,
          },
          db.doc<Customer>(firestore, "/customers", customerId),
          tenantContext,
        );
      } else {
        await create(
          firestore,
          customer,
          db.doc<Customer>(firestore, "/customers", customerId),
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          tenantContext,
        );
      }

      let acceptanceEmailSentAt = inquiry.acceptanceEmailSentAt;
      if (
        form.status === B2BInquiryStatus.ACCEPTED &&
        form.sendAcceptanceEmail &&
        !inquiry.acceptanceEmailSentAt
      ) {
        const result = await sendB2BAcceptanceEmail({
          to: form.email.trim(),
          bankPaymentsEnabled: form.allowedBankPayments,
          customerName: form.personName.trim() || form.name.trim(),
          companyName: form.name.trim(),
          deferredPaymentsEnabled: form.allowedDefferedPayments,
          discount,
          linkedProductsCount: linkedProductsIds.length,
          onPickupPaymentsEnabled: form.allowedOnPickupPayments,
          ownerName: owner?.name,
          ownerEmail: owner?.email,
        });

        if (!result.sent) {
          throw new Error(result.error ?? "Acceptance email was not sent");
        }
        acceptanceEmailSentAt = now;
      }

      const inquiryUpdate: Partial<B2BInquiry> = {
        status: form.status,
        accepted: form.status === B2BInquiryStatus.ACCEPTED,
        customerId,
        updatedAt: now,
        rejectionReason:
          form.status === B2BInquiryStatus.REJECTED
            ? form.rejectionReason.trim()
            : "",
      };

      if (ownerSummary) {
        inquiryUpdate.contactOwner = ownerSummary;
        inquiryUpdate.reviewedBy = ownerSummary;
      }
      if (form.status === B2BInquiryStatus.ACCEPTED) {
        inquiryUpdate.acceptedAt = inquiry.acceptedAt ?? now;
      }
      if (form.status === B2BInquiryStatus.REJECTED) {
        inquiryUpdate.rejectedAt = inquiry.rejectedAt ?? now;
      }
      if (acceptanceEmailSentAt) {
        inquiryUpdate.acceptanceEmailSentAt = acceptanceEmailSentAt;
      }

      await update(
        inquiryUpdate,
        db.doc<Partial<B2BInquiry>>(firestore, "/b2bInquiries", inquiry.id),
        tenantContext,
      );

      toaster.success({
        title: t("b2b.workflow.savedTitle", {
          defaultValue: "B2B Request Saved",
        }),
        description: t("b2b.workflow.savedDescription", {
          defaultValue: "Customer access and request status were updated.",
        }),
      });
      onSaved();
    } catch (error) {
      console.error("Error saving B2B workflow:", error);
      toaster.error({
        title: t("errors.somethingWentWrong"),
        description:
          error instanceof Error
            ? error.message
            : t("b2b.workflow.saveFailed", {
                defaultValue: "Failed to save B2B request.",
              }),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      header={t("b2b.workflow.title", { defaultValue: "B2B Workflow" })}
      size="xl"
      open={open}
      setOpen={setOpen}
      lazyMount
      unmountOnExit
    >
      {form ? (
        <Stack gap="6">
          <StatusOwnerFields
            form={form}
            setForm={setForm}
            statusCollection={statusCollection}
            membersCollection={membersCollection}
            t={t}
          />
          <CustomerFields form={form} setForm={setForm} t={t} />
          <PaymentFields
            form={form}
            inquiry={inquiry}
            setForm={setForm}
            t={t}
          />
          <ProductAndReasonFields form={form} setForm={setForm} t={t} />

          <HStack justifyContent="flex-end" gap="3">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              colorPalette="primary"
              loading={saving}
              disabled={saving}
              onClick={handleSave}
            >
              <MaterialSymbol>save</MaterialSymbol>
              {t("actions.saveChanges")}
            </Button>
          </HStack>
        </Stack>
      ) : null}
    </Drawer>
  );
}
