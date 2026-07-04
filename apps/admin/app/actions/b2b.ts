"use server";

import { requireAdminAuth } from "./auth-utils";
import { sendEmail } from "@/lib/email";
import { B2BAcceptanceCustomer } from "@konfi/emails";

type B2BAcceptanceEmailInput = {
  to?: string;
  bankPaymentsEnabled?: boolean;
  customerName?: string;
  companyName?: string;
  deferredPaymentsEnabled?: boolean;
  discount?: number;
  linkedProductsCount?: number;
  onPickupPaymentsEnabled?: boolean;
  ownerName?: string;
  ownerEmail?: string;
};

type B2BEmailResult = {
  sent: boolean;
  error?: string;
};

export async function sendB2BAcceptanceEmail(
  input: B2BAcceptanceEmailInput,
): Promise<B2BEmailResult> {
  await requireAdminAuth();

  const recipient = input.to?.trim();
  if (!recipient) {
    return { sent: false, error: "Customer email is not defined" };
  }

  try {
    await sendEmail({
      to: recipient,
      from: process.env.NO_REPLY_EMAIL?.trim(),
      subject: "Dostęp B2B zaakceptowany",
      template: B2BAcceptanceCustomer({
        bankPaymentsEnabled: input.bankPaymentsEnabled,
        brand: "store",
        companyName: input.companyName,
        customerName: input.customerName,
        deferredPaymentsEnabled: input.deferredPaymentsEnabled,
        discount: input.discount,
        linkedProductsCount: input.linkedProductsCount,
        onPickupPaymentsEnabled: input.onPickupPaymentsEnabled,
        ownerEmail: input.ownerEmail,
        ownerName: input.ownerName,
        supportEmail: process.env.NEXT_PUBLIC_SUPPORT_MAIL,
      }),
    });
  } catch (error) {
    console.error("Failed to send B2B acceptance email:", error);
    return {
      sent: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }

  return { sent: true };
}
