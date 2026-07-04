"use client";

import PromotionUpdateForm from "@/components/promotions/PromotionUpdateForm";
import AdminLoadingSkeleton from "@/components/layout/AdminLoadingSkeleton";
import { useT } from "@/i18n/client";
import { CustomHeading, Empty } from "@konfi/components";
import { Promotion } from "@konfi/types";
import { isUndefined } from "es-toolkit";
import { useParams } from "next/navigation";
import useSWRImmutable from "swr";

export async function fetchPromotion(id: string) {
  const getDoc = (await import("@konfi/firebase")).getDoc;
  const db = (await import("@konfi/firebase")).db;
  const firestore = (await import("@/lib/firebase/clientApp")).firestore;
  const result = await getDoc(db.doc(firestore, "promotions", id));
  console.log(result);
  if (!isUndefined(result)) {
    const promotion = result as Promotion;
    return promotion;
  } else return null;
}

export default function PromotionEditPage() {
  const { id } = useParams();
  const { t } = useT();
  const { data: promotion, isValidating: isValidatingPromotion } =
    useSWRImmutable(id, fetchPromotion, {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateOnMount: true,
    });

  if (isValidatingPromotion) {
    return <AdminLoadingSkeleton variant="fields" rows={7} />;
  }
  if (!promotion)
    return (
      <Empty
        title={t("promotions.notFound", {
          defaultValue: "Promotion does not exist",
        })}
        description={t("promotions.notFoundDescription", {
          defaultValue: "Promotion not found with the given identifier",
        })}
        icon="sell"
      />
    );
  return (
    <>
      <CustomHeading
        heading={t("admin.editPromotion", { defaultValue: "Edit Promotion" })}
        mb={"8"}
        breadcrumb={true}
        goBack={true}
        t={t}
      />
      <PromotionUpdateForm promotion={promotion} />
    </>
  );
}
