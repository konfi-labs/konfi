"use client";

import {
  Circle,
  Drawer,
  Flex,
  Float,
  Heading,
  HStack,
  IconButton,
  Portal,
  Show,
  Separator,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  ButtonLink,
  DrawerCloseTrigger,
  MaterialSymbol,
} from "@konfi/components";
import { useCart } from "@/context/cart";
import { useStoreCurrency } from "@/context/currency";
import { useT } from "@/i18n/client";
import { OrderItem } from "@konfi/types";
import { STORE_CART } from "@konfi/utils";
import { isNull } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import { useState } from "react";
import CartItems from "../cart/CartItems";

interface Props {
  items?: OrderItem[] | null;
  lng: string;
}

export default function CartMenu({ items, lng }: Props) {
  const { t, i18n } = useT();
  const {
    items: cartItems,
    subtotal,
    total,
    shippingPrice,
    discountAmount,
    uploaders,
    preflightIssues,
  } = useCart();
  const { formatPrice } = useStoreCurrency();
  const [open, setOpen] = useState(false);
  const resolvedItems = isNull(items) ? cartItems : (items ?? cartItems);
  const hasItems = !isNull(resolvedItems) && resolvedItems.length > 0;
  const orderHref =
    uploaders.length > 0 || preflightIssues.length > 0
      ? STORE_CART
      : `${STORE_CART}#order-details`;

  return (
    <Drawer.Root
      open={open}
      onOpenChange={({ open }) => setOpen(open)}
      placement="end"
      lazyMount
      size="lg"
      preventScroll
    >
      <Flex position={"relative"}>
        <Drawer.Trigger
          asChild
          aria-label={t("store.cart.label", { defaultValue: "Cart", lng })}
          title={t("store.cart.label", { defaultValue: "Cart", lng })}
        >
          <IconButton variant={"ghost"}>
            <Show when={!isEmpty(resolvedItems)}>
              <Float>
                <Circle
                  size={"5"}
                  bg={"primary.solid"}
                  color={{ base: "white", _dark: "primary.900" }}
                >
                  {resolvedItems?.length}
                </Circle>
              </Float>
            </Show>
            <MaterialSymbol>shopping_cart</MaterialSymbol>
          </IconButton>
        </Drawer.Trigger>
      </Flex>
      <Portal>
        <Drawer.Backdrop zIndex="overlay" />
        <Drawer.Positioner zIndex="modal" padding={{ base: 0, md: 4 }}>
          <Drawer.Content
            maxH={{ base: "100dvh", md: "calc(100dvh - 2rem)" }}
            display="flex"
            flexDirection="column"
            borderRadius={{ base: 0, md: "3xl" }}
            overflow="hidden"
            p={0}
          >
            <DrawerCloseTrigger />
            <Drawer.Header>
              <Heading size={"lg"} mb={0}>
                {t("store.cart.label", { defaultValue: "Cart", lng })}
              </Heading>
            </Drawer.Header>
            <Drawer.Body pt={0} flex="1" minH={0} overflowY="auto">
              {hasItems ? (
                <CartItems minimal />
              ) : (
                <Text my={2}>
                  {t("store.cart.empty", {
                    defaultValue: "Cart is empty",
                    lng,
                  })}
                </Text>
              )}
            </Drawer.Body>
            {hasItems && (
              <Drawer.Footer
                flexDirection={"column"}
                alignItems={"stretch"}
                gap={4}
                borderTopWidth={"1px"}
                borderColor={{
                  base: "blackAlpha.100",
                  _dark: "whiteAlpha.200",
                }}
              >
                <VStack align={"stretch"} gap={2}>
                  <Drawer.ActionTrigger asChild>
                    <ButtonLink
                      lng={lng}
                      href={STORE_CART}
                      prefetch={true}
                      variant={"subtle"}
                      ariaLabel={t("store.cart.goToCart", {
                        defaultValue: "Go to cart",
                        lng,
                      })}
                      w="full"
                    >
                      <MaterialSymbol>shopping_cart</MaterialSymbol>
                      {t("store.cart.goToCart", {
                        defaultValue: "Go to cart",
                        lng,
                      })}
                    </ButtonLink>
                  </Drawer.ActionTrigger>
                  <Drawer.ActionTrigger asChild>
                    <ButtonLink
                      lng={lng}
                      href={orderHref}
                      prefetch={true}
                      colorPalette={"primary"}
                      variant={"solid"}
                      ariaLabel={t("store.cart.checkout", {
                        defaultValue: "Checkout",
                        lng,
                      })}
                      w="full"
                    >
                      <MaterialSymbol>shopping_cart_checkout</MaterialSymbol>
                      {t("store.cart.checkout", {
                        defaultValue: "Checkout",
                        lng,
                      })}
                    </ButtonLink>
                  </Drawer.ActionTrigger>
                </VStack>
                <VStack align={"stretch"} gap={2}>
                  <HStack justify={"space-between"}>
                    <Text color={"fg.muted"}>
                      {t("store.cart.products", {
                        defaultValue: "Products",
                        lng,
                      })}
                    </Text>
                    <Text fontWeight={"semibold"}>
                      {formatPrice(subtotal, i18n.resolvedLanguage)}
                    </Text>
                  </HStack>
                  <HStack justify={"space-between"}>
                    <Text color={"fg.muted"}>
                      {t("store.cart.shipping", {
                        defaultValue: "Shipping",
                        lng,
                      })}
                    </Text>
                    <Text fontWeight={"semibold"}>
                      {formatPrice(shippingPrice, i18n.resolvedLanguage)}
                    </Text>
                  </HStack>
                  {discountAmount > 0 && (
                    <HStack justify={"space-between"}>
                      <Text color={"fg.muted"}>
                        {t("store.discountOn", {
                          defaultValue: "Discount on {{target}}",
                          lng,
                          target: t("store.cart.label", {
                            defaultValue: "Cart",
                            lng,
                          }).toLowerCase(),
                        })}
                      </Text>
                      <Text fontWeight={"semibold"} color={"success.600"}>
                        - {formatPrice(discountAmount, i18n.resolvedLanguage)}
                      </Text>
                    </HStack>
                  )}
                  <Separator />
                  <HStack justify={"space-between"}>
                    <Heading size={"md"} mb={0}>
                      {t("store.cart.checkout", {
                        defaultValue: "Checkout",
                        lng,
                      })}
                    </Heading>
                    <Heading size={"md"} mb={0}>
                      {formatPrice(total, i18n.resolvedLanguage)}
                    </Heading>
                  </HStack>
                </VStack>
              </Drawer.Footer>
            )}
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}
