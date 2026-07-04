"use server";

import { B2BInquiryAdmin } from "@konfi/emails";
import { sendEmail } from "@/lib/email";
import {
  getAdminDb,
  getTenantContextForRequest,
  verifyAnyIdToken,
  verifyAppCheckToken,
} from "@/lib/firebase/serverApp";
import { tenantFirestorePaths, withTenantId } from "@konfi/firebase";
import { B2BInquiry, B2BInquiryStatus, Customer } from "@konfi/types";
import { Timestamp } from "firebase-admin/firestore";

type B2BInquiryNotificationInput = {
  appCheckToken?: string;
  idToken: string;
  inquiryId: string;
};

type B2BInquiryNotificationResult = {
  sent: boolean;
  error?: string;
};

function resolveInquiryStatus(inquiry: B2BInquiry) {
  if (inquiry.status) {
    return inquiry.status;
  }

  return inquiry.accepted ? B2BInquiryStatus.ACCEPTED : B2BInquiryStatus.NEW;
}

function getAdminB2BUrl() {
  const adminBaseUrl =
    process.env.ADMIN_URL ?? process.env.NEXT_PUBLIC_ADMIN_URL;

  if (!adminBaseUrl) {
    return undefined;
  }

  try {
    return new URL("/configuration/b2b", `${adminBaseUrl}/`).toString();
  } catch (error) {
    console.error("Failed to build B2B inquiry admin URL:", error);
    return undefined;
  }
}

async function verifyStoreCaller(input: B2BInquiryNotificationInput) {
  const idToken = input.idToken?.trim();

  if (!idToken) {
    return { error: "Missing Firebase ID token" };
  }

  const decodedToken = await verifyAnyIdToken(idToken);

  if (!decodedToken) {
    return { error: "Unauthorized" };
  }

  if (process.env.NODE_ENV === "production") {
    const appCheckToken = input.appCheckToken?.trim();

    if (!appCheckToken) {
      return { error: "Missing App Check token" };
    }

    const appCheck = await verifyAppCheckToken(appCheckToken);

    if (!appCheck) {
      return { error: "Invalid App Check token" };
    }
  }

  return { uid: decodedToken.uid, email: decodedToken.email };
}

export async function sendB2BInquiryNotificationEmail(
  input: B2BInquiryNotificationInput,
): Promise<B2BInquiryNotificationResult> {
  const caller = await verifyStoreCaller(input);

  if (!caller.uid) {
    return {
      sent: false,
      error: caller.error ?? "Unauthorized",
    };
  }

  const inquiryId = input.inquiryId?.trim();

  if (!inquiryId) {
    return {
      sent: false,
      error: "Missing B2B inquiry id",
    };
  }

  const supportMail = process.env.NEXT_PUBLIC_SUPPORT_MAIL?.trim();

  if (!supportMail) {
    return {
      sent: false,
      error: "NEXT_PUBLIC_SUPPORT_MAIL is not defined",
    };
  }

  const noReplyEmail = process.env.NO_REPLY_EMAIL?.trim();

  if (!noReplyEmail) {
    return {
      sent: false,
      error: "NO_REPLY_EMAIL is not defined",
    };
  }

  const adminDb = getAdminDb();
  const tenantContext = await getTenantContextForRequest();
  const inquiryRef = adminDb.collection("b2bInquiries").doc(inquiryId);
  const inquirySnapshot = await inquiryRef.get();

  if (!inquirySnapshot.exists) {
    return {
      sent: false,
      error: "B2B inquiry not found",
    };
  }

  const inquiry = {
    ...(inquirySnapshot.data() as B2BInquiry),
    id: inquirySnapshot.id,
  };
  const expectedTenantId = withTenantId(
    {},
    tenantContext,
    "B2B inquiry",
  ).tenantId;

  if (
    tenantContext.requireTenantId &&
    (inquiry as B2BInquiry & { tenantId?: string }).tenantId !==
      expectedTenantId
  ) {
    return {
      sent: false,
      error: "B2B inquiry not found",
    };
  }

  if (inquiry.userId !== caller.uid) {
    return {
      sent: false,
      error: "Unauthorized B2B inquiry notification request",
    };
  }

  if (resolveInquiryStatus(inquiry) !== B2BInquiryStatus.NEW) {
    return {
      sent: false,
      error: "B2B inquiry is no longer new",
    };
  }

  if (inquiry.notificationEmailSentAt) {
    return { sent: true };
  }

  const customerSnapshot = await adminDb
    .doc(tenantFirestorePaths.customerDoc(tenantContext, caller.uid))
    .get();

  if (!customerSnapshot.exists) {
    return {
      sent: false,
      error: "Customer not found",
    };
  }

  const customer = {
    ...(customerSnapshot.data() as Customer),
    id: customerSnapshot.id,
  };

  if (customer.b2bInquiryId !== inquiryId) {
    return {
      sent: false,
      error: "B2B inquiry is not linked to the customer",
    };
  }

  try {
    await sendEmail({
      to: supportMail,
      from: noReplyEmail,
      subject: "Nowe zapytanie B2B",
      idempotencyKey: `b2b-inquiry-created-${inquiryId}`,
      template: B2BInquiryAdmin({
        brand: "admin",
        businessDescription: inquiry.businessDescription,
        companyName: inquiry.billing.companyName ?? "",
        customerEmail: caller.email,
        inquiryId,
        nip: inquiry.billing.nip ?? "",
        url: getAdminB2BUrl(),
        userId: caller.uid,
      }),
    });

    await inquiryRef.update({
      notificationEmailLastError: null,
      notificationEmailSentAt: Timestamp.now(),
    });

    return { sent: true };
  } catch (error) {
    console.error("Failed to send B2B inquiry notification email:", error);
    await inquiryRef.update({
      notificationEmailLastError:
        error instanceof Error ? error.message : "Unknown error",
    });
    return {
      sent: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
