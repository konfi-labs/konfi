import {
  B2BInquiry,
  B2BInquiryStatus,
  Customer,
  Member,
} from "@konfi/types";

export type B2BWorkflowForm = {
  status: B2BInquiryStatus;
  ownerId: string;
  name: string;
  personName: string;
  email: string;
  nip: string;
  discount: string;
  allowedBankPayments: boolean;
  allowedOnPickupPayments: boolean;
  allowedDefferedPayments: boolean;
  linkedProductsIds: string;
  rejectionReason: string;
  sendAcceptanceEmail: boolean;
};

export function resolveInquiryStatus(inquiry: B2BInquiry) {
  if (inquiry.status) return inquiry.status;
  return inquiry.accepted ? B2BInquiryStatus.ACCEPTED : B2BInquiryStatus.NEW;
}

export function createInitialForm(inquiry: B2BInquiry): B2BWorkflowForm {
  return {
    status: resolveInquiryStatus(inquiry),
    ownerId: inquiry.contactOwner?.id ?? "",
    name: inquiry.billing.companyName || inquiry.billing.name || "",
    personName: "",
    email: "",
    nip: inquiry.billing.nip ?? "",
    discount: "0",
    allowedBankPayments: true,
    allowedOnPickupPayments: false,
    allowedDefferedPayments: false,
    linkedProductsIds: "",
    rejectionReason: inquiry.rejectionReason ?? "",
    sendAcceptanceEmail: !inquiry.acceptanceEmailSentAt,
  };
}

export function applyCustomerToForm(
  form: B2BWorkflowForm,
  customer: Customer | undefined,
): B2BWorkflowForm {
  if (!customer) return form;

  return {
    ...form,
    ownerId: customer.supportOwner?.id ?? form.ownerId,
    name: customer.name ?? form.name,
    personName: customer.personName ?? "",
    email: customer.email ?? "",
    nip: customer.nip ?? form.nip,
    discount: `${customer.discount ?? 0}`,
    allowedBankPayments: customer.allowedBankPayments ?? true,
    allowedOnPickupPayments: customer.allowedOnPickupPayments ?? false,
    allowedDefferedPayments: customer.allowedDefferedPayments ?? false,
    linkedProductsIds: customer.linkedProductsIds?.join("\n") ?? "",
  };
}

export function normalizeProductIds(value: string) {
  return [
    ...new Set(
      value
        .split(/\r?\n|,/)
        .map((productId) => productId.trim())
        .filter((productId) => productId.length > 0),
    ),
  ];
}

export function getOwner(members: Member[] | null, ownerId: string) {
  return members?.find((member) => member.id === ownerId);
}
