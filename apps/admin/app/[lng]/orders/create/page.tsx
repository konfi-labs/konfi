import i18next from "@/i18n/i18next";
import type { EmailOrderImportRecord } from "@/lib/ai/email-order-import";
import { getAdminDb } from "@/lib/firebase/serverApp";

import { Metadata } from "next";
import { Suspense } from "react";
import AdminLoadingSkeleton from "../../components/layout/AdminLoadingSkeleton";
import CreateOrderPage from "./create-order-page";

interface SearchParams {
  emailImportId?: string | string[];
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <Suspense fallback={<AdminLoadingSkeleton variant="form" rows={8} />}>
      <CreateOrderWithEmailImport searchParams={searchParams} />
    </Suspense>
  );
}

async function CreateOrderWithEmailImport({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { emailImportId } = await searchParams;
  const importId =
    typeof emailImportId === "string" ? emailImportId : undefined;

  let initialEmailImport:
    | {
        conversationId: string;
        subject: string;
        orderDraft: NonNullable<EmailOrderImportRecord["orderDraft"]>;
      }
    | undefined;

  if (importId) {
    const firestore = getAdminDb();
    const importDoc = await firestore
      .collection("emailOrderImports")
      .doc(importId)
      .get();

    if (importDoc.exists) {
      const record = importDoc.data() as EmailOrderImportRecord;
      if (record.status === "draft-ready" && record.orderDraft) {
        initialEmailImport = {
          conversationId: record.conversationId,
          subject: record.subject,
          orderDraft: record.orderDraft,
        };
      }
    }
  }

  return <CreateOrderPage initialEmailImport={initialEmailImport} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");
  return {
    title: t("ROUTES.ordersCreate"),
  };
}
