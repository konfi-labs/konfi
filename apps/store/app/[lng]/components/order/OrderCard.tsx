import { useAuth } from "@/context/auth";
import { useStoreRuntimeConfig } from "@/context/runtime-config";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { storage } from "@/lib/firebase/clientApp";
import {
  Box,
  Grid,
  GridItem,
  HStack,
  Presence,
  Separator,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ButtonLink, Item, MaterialSymbol } from "@konfi/components";
import {
  fetchThumbnail,
  tenantStoragePaths,
  type TenantContext,
} from "@konfi/firebase";
import { Order } from "@konfi/types";
import {
  canChangePaymentMethod,
  formatDate,
  STORE_ACCOUNT_ORDERS,
} from "@konfi/utils";
import { isNull } from "es-toolkit";
import { Fragment } from "react";
import useSWRImmutable from "swr/immutable";

async function checkHasAttachments(
  tenantContext: TenantContext,
  channelId: string,
  orderId: string,
  customerId: string,
): Promise<boolean> {
  try {
    const { list } = await import("@/lib/firebase/storage");
    const data = await list(
      `${tenantStoragePaths.orderAttachmentFolder(
        tenantContext,
        channelId,
        customerId,
        orderId,
      )}/`,
    );
    return !!(data && data.length > 0);
  } catch {
    return false;
  }
}

const OrderCard = ({ order }: { order: Order }) => {
  const { t, i18n } = useT();
  const { user } = useAuth();
  const runtimeConfig = useStoreRuntimeConfig();
  const tenantContext = useTenantContext();
  const orderItemsThumbnailKey = order.items
    .map(
      (item, index) =>
        `${item.id ?? index}:${item.product?.id ?? ""}:${item.product?.channelId ?? ""}`,
    )
    .join("|");
  const { data: itemsThumbnails, isValidating } = useSWRImmutable(
    !isNull(user)
      ? [
          "order-card-thumbnails",
          user.uid,
          order.id,
          runtimeConfig.channelId,
          orderItemsThumbnailKey,
        ]
      : null,
    ([, userId]) => fetchListResults(userId),
  );

  const { data: hasAttachments } = useSWRImmutable(
    !isNull(user) && order.customer && typeof order.customer !== "string"
      ? [order.channelId, order.id, order.customer.id]
      : null,
    ([channelId, orderId, customerId]) =>
      checkHasAttachments(tenantContext, channelId, orderId, customerId),
  );

  async function fetchListResults(
    userId: string,
  ): Promise<{ index: number; url: string }[] | undefined> {
    const thumbnails = await Promise.all(
      order.items.map(async (item, index) => {
        const data = await fetchThumbnail(
          undefined,
          storage,
          userId,
          order.id,
          index,
          item.product?.id,
          item.product?.channelId,
          true,
          order.channelId,
          undefined,
          tenantContext,
        );

        return data ? { index, url: data } : null;
      }),
    );

    return thumbnails.filter(
      (thumbnail): thumbnail is { index: number; url: string } =>
        !isNull(thumbnail),
    );
  }

  const canChangePayment = canChangePaymentMethod(
    order.paymentStatus,
    order.activities,
  );
  const showActionButtons = canChangePayment || (hasAttachments ?? false);

  return (
    <Grid
      asChild
      templateColumns="repeat(3, 1fr)"
      transition={"ease-in-out .15s"}
      shadow={"inset 0 5px 10px 0 rgba(0, 102, 255, 0.1)"}
      border={"1px solid"}
      borderRadius={"3xl"}
      borderColor={{ base: "whiteAlpha.500", _dark: "whiteAlpha.200" }}
      overflow={"hidden"}
      w={"100%"}
    >
      <Presence
        present={true}
        animationName={{ _open: "fade-in" }}
        animationDuration="moderate"
      >
        <GridItem
          colSpan={[3, 3]}
          p={6}
          minW={"100%"}
          maxW={"24rem"}
          shadow={"0 1px 1px 0 rgba(0, 102, 255, 0.1)"}
        >
          <VStack gap={4} align={"stretch"}>
            <HStack justify={"space-between"}>
              <Box>
                <Text>{`#${order.number} (${order.id})`}</Text>
                <Text>
                  {formatDate(order.createdAt, i18n.resolvedLanguage, {
                    month: "long",
                    day: "2-digit",
                    year: "numeric",
                  })}
                </Text>
              </Box>
              <ButtonLink
                lng={i18n.resolvedLanguage}
                colorPalette={"primary"}
                href={STORE_ACCOUNT_ORDERS + "/" + order.id}
                rel={"nofollow"}
                ariaLabel={t("store.orderPreview", {
                  defaultValue: "Order preview",
                })}
              >
                <MaterialSymbol>open_in_new</MaterialSymbol>
                {t("store.orderPreview", { defaultValue: "Order preview" })}
              </ButtonLink>
            </HStack>
            {showActionButtons && (
              <HStack gap={2} justify={"flex-start"} flexWrap={"wrap"}>
                {canChangePayment && (
                  <ButtonLink
                    lng={i18n.resolvedLanguage}
                    variant={"outline"}
                    size={"sm"}
                    colorPalette={"primary"}
                    href={`${STORE_ACCOUNT_ORDERS}/${order.id}?action=changePayment`}
                    rel={"nofollow"}
                    ariaLabel={t("orderCard.changePayment", {
                      defaultValue: "Change payment",
                    })}
                  >
                    <MaterialSymbol>payments</MaterialSymbol>
                    {t("orderCard.changePayment", {
                      defaultValue: "Change payment",
                    })}
                  </ButtonLink>
                )}
                {hasAttachments && (
                  <ButtonLink
                    lng={i18n.resolvedLanguage}
                    variant={"outline"}
                    size={"sm"}
                    colorPalette={"primary"}
                    href={`${STORE_ACCOUNT_ORDERS}/${order.id}?action=downloadInvoice`}
                    rel={"nofollow"}
                    ariaLabel={t("orderCard.downloadInvoice", {
                      defaultValue: "Download invoice",
                    })}
                  >
                    <MaterialSymbol>download</MaterialSymbol>
                    {t("orderCard.downloadInvoice", {
                      defaultValue: "Download invoice",
                    })}
                  </ButtonLink>
                )}
              </HStack>
            )}
          </VStack>
        </GridItem>
        <GridItem colSpan={[3, 2]} p={6} my={"auto"} mr={"auto"} w={"100%"}>
          {!isValidating &&
            order.items.map((item, index) => (
              <Fragment key={index}>
                <Item
                  item={item}
                  channelId={order.channelId}
                  thumbnailURL={itemsThumbnails?.[index]?.url}
                  amountCurrency={order.currency}
                  t={t}
                  i18n={i18n}
                />
                {index !== order.items.length - 1 && <Separator my={8} />}
              </Fragment>
            ))}
        </GridItem>
      </Presence>
    </Grid>
  );
};

export default OrderCard;
