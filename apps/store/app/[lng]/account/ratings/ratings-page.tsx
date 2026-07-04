"use client";

import { Button, Heading, HStack, Spinner, Stack } from "@chakra-ui/react";
import { CustomDialog, CustomHeading, Empty, Image } from "@konfi/components";
import { db, get, getDoc } from "@konfi/firebase";
import { Rating as IRating, Product } from "@konfi/types";
import Rating from "@/components/products/Rating";
import { useAuth } from "@/context/auth";
import { useStoreRuntimeConfig } from "@/context/runtime-config";
import { isUndefined } from "es-toolkit";
import { where } from "firebase/firestore";
import { firestore } from "@/lib/firebase/clientApp";
import { buildRuntimeAssetUrl } from "@/lib/runtime-config";
import { startTransition, useEffect, useState } from "react";
import useSWRMutation from "swr/mutation";
import { useT } from "@/i18n/client";

async function fetchData([uid, channelId]: [string, string]) {
  try {
    const result = await get(
      db.collectionGroup<IRating>(firestore, `ratings`, 1, [
        where("userId", "==", uid),
        where("isRated", "==", false),
      ]),
    );
    const ratings: (IRating & { image: string; productName: string })[] = [];
    if (!isUndefined(result)) {
      for (let i = 0; i < result[0].length; i++) {
        const rating = result[0][i];
        const product = await getDoc(
          db.doc<Product>(
            firestore,
            `channels/${channelId}/products`,
            rating.productId,
          ),
        );
        if (!isUndefined(product) && product.spec.images[0]) {
          ratings.push({
            ...rating,
            image: product.spec.images[0],
            productName: product.name,
          });
        }
      }
      return ratings;
    } else return [];
  } catch (error) {
    console.error(error);
    return [];
  }
}

export default function RatingsPage() {
  const { t } = useT();
  const runtimeConfig = useStoreRuntimeConfig();
  const { loading: loadingAuth, user } = useAuth();
  const {
    trigger,
    data: ratings,
    isMutating,
  } = useSWRMutation(
    user ? [user.uid, runtimeConfig.channelId] : null,
    fetchData,
  );
  const [showForm, setShowForm] = useState(false);

  function handleCreateFormOpen() {
    startTransition(() => {
      setShowForm(true);
    });
  }

  useEffect(() => {
    trigger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isMutating || loadingAuth) {
    return (
      <>
        <CustomHeading
          heading={t("common.ratings", { defaultValue: "Ratings" })}
          mb={"8"}
        />
        <Spinner color="primary.solid" />
      </>
    );
  }

  if (isUndefined(ratings) || ratings.length === 0) {
    return (
      <Empty
        title={t("common.noRatingsToAdd", {
          defaultValue: "No ratings to add",
        })}
        description={t("common.noRatingsDescription", {
          defaultValue: "You don't have any ratings to add at the moment.",
        })}
        icon={"star"}
      />
    );
  }

  return (
    <>
      <CustomHeading
        heading={t("common.ratings", { defaultValue: "Ratings" })}
        mb={"8"}
      />
      {ratings?.map((rating, index) => (
        <Stack
          key={index}
          w={"100%"}
          direction={["column", "column", "row", "row"]}
          justify={"space-between"}
        >
          <HStack h={"100%"}>
            <Image
              src={
                buildRuntimeAssetUrl(
                  runtimeConfig.cdnUrl,
                  `channels/${runtimeConfig.channelId}/products/${rating.productId}/${rating.image}?fit=crop&auto=format`,
                ) ?? ""
              }
              alt={"Produkt"}
              ratio={1}
              w={"100%"}
              h={"100%"}
              width={250}
              height={250}
              priority={false}
              borderRadius={32}
            />
            <Heading size={"md"}>{rating.productName}</Heading>
          </HStack>
          <Button onClick={() => handleCreateFormOpen()}>
            {t("rating.addRating", { defaultValue: "Add Rating" })}
          </Button>
          <CustomDialog
            header={t("rating.addRating", { defaultValue: "Add Rating" })}
            open={showForm}
            setOpen={setShowForm}
          >
            <Rating
              id={rating.id}
              productId={rating.productId}
              channelId={runtimeConfig.channelId}
              trigger={trigger}
            />
          </CustomDialog>
        </Stack>
      ))}
    </>
  );
}
