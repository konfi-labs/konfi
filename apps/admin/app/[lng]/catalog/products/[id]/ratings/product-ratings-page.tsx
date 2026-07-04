"use client";

import AdminLoadingSkeleton from "@/components/layout/AdminLoadingSkeleton";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { Button, HStack, Text, VStack } from "@chakra-ui/react";
import { CustomHeading, Empty, MaterialSymbol } from "@konfi/components";
import { db, update } from "@konfi/firebase";
import { Rating } from "@konfi/types";
import { useChannels } from "context/channels";
import { isNull, isUndefined } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import { getDocs } from "firebase/firestore";
import { useParams } from "next/navigation";
import { Fragment } from "react";
import useSWR from "swr";

async function fetchRatings(key: string) {
  try {
    const ratingsQuery = db.query<Rating>(firestore, key, 10);
    const snapshot = await getDocs(ratingsQuery);
    if (snapshot.empty) return [];
    return snapshot.docs.map((doc) => doc.data());
  } catch (error) {
    console.error(error);
    return [];
  }
}

export default function ProductRatingsPage() {
  const { t } = useT();
  const { channel } = useChannels();
  const tenantContext = useTenantContext();
  const params = useParams<{ id: string; }>();
  const productId = params?.id;
  const {
    data: ratings,
    isLoading,
    mutate,
  } = useSWR(
    isNull(channel) || !productId
      ? null
      : `/channels/${channel?.id}/products/${productId}/ratings`,
    fetchRatings,
  );

  function handleToggleRating(ratingId: string, ratingActive: boolean) {
    const ratingRef = db.doc<Partial<Rating>>(
      firestore,
      `/channels/${channel?.id}/products/${productId}/ratings`,
      ratingId,
    );
    update({ active: !ratingActive }, ratingRef, tenantContext);
    mutate(); // Revalidate after update
  }

  if (isLoading) return <AdminLoadingSkeleton variant="list" rows={3} />;
  if (isUndefined(ratings) || isEmpty(ratings))
    return (
      <Empty
        title={t("common.noRatings", { defaultValue: "No ratings" })}
        description={t("common.noRatingsForProduct", {
          defaultValue: "No ratings found for this product",
        })}
        icon={"star"}
      />
    );

  return (
    <>
      <CustomHeading
        heading={t("common.productRatings", {
          defaultValue: "Product Ratings",
        })}
        mb="8"
        breadcrumb={true}
        goBack={true}
        t={t}
      />
      <VStack align={"start"}>
        {ratings.map((rating, index) => (
          <Fragment key={rating.id}>
            <HStack key={index} gap={4} mb={4}>
              <HStack gap={0}>
                <MaterialSymbol color={"primary.solid"} pb={"2px"}>
                  star
                </MaterialSymbol>
                <Text ml={2} fontWeight={"bold"} color={"primary.solid"}>
                  {" "}
                  {rating.isRated
                    ? rating.rating
                    : t("common.waitingForRating", {
                      defaultValue: "Waiting for rating",
                    })}
                </Text>
              </HStack>
              {rating.comment && <Text>{rating.comment}</Text>}
            </HStack>
            <Button
              colorPalette={"primary"}
              onClick={() => handleToggleRating(rating.id, rating.active)}
            >
              {rating.active
                ? t("admin.deactivate", { defaultValue: "Deactivate" })
                : t("admin.activate", { defaultValue: "Activate" })}
            </Button>
          </Fragment>
        ))}
      </VStack>
    </>
  );
}
