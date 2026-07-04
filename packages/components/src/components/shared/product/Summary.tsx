"use client";

import {
  Alert,
  Box,
  Button,
  CloseButton,
  Dialog,
  GridItem,
  Heading,
  HStack,
  Portal,
  SimpleGrid,
  Text,
  useDisclosure,
} from "@chakra-ui/react";
import {
  Attribute,
  Configuration,
  CurrencyCode,
  CurrencySettings,
  Discount,
  IDiscount,
  OrderItem,
  Price,
  PriceTypeEnum,
  type PrintingMethodId,
  Product,
  Promotion,
  Unit,
  type UnitId,
} from "@konfi/types";
import {
  AUTH_LOGIN,
  calculateQuantityForMultipleSizes,
  AUTH_REGISTER,
  calculateConfiguredProductPrice,
  formatPageCountBreakdown,
  canAddToCart,
  DEFAULT_COMBINATION,
  formatOrderItem,
  getPageCountPricingMode,
  getClosestVolume,
  isMatrixLikePriceType,
  resolvePageCountConfigForSelection,
} from "@konfi/utils";
import { isNull, isUndefined } from "es-toolkit";
import { Analytics } from "firebase/analytics";
import { User } from "firebase/auth";
import { DocumentData, DocumentReference, Firestore } from "firebase/firestore";
import { i18n, TFunction } from "i18next";
import { memo, useEffect, useState } from "react";
import { toaster } from "../../ui/toaster";
import { themeGradients } from "../../../theme/gradients";
import { ButtonLink } from "../ButtonLink";
import { CustomHeading } from "../CustomHeading";
import { Link } from "../Link";
import { MaterialSymbol } from "../MaterialSymbol";
import { Price as ProductPrice } from "../product/Price";
import { SummaryDescription } from "../SummaryDescription";

type Props = {
  product: Product;
  configuration: Configuration;
  resolvedPrices?: Product["prices"];
  add?: (orderItem: OrderItem, user?: User) => Promise<string | undefined>;
  user?: User | null;
  loginAsGuest?: (
    addToCart: (_user: User, newItem?: boolean) => Promise<boolean | string>,
  ) => Promise<void>;
  analytics?: Analytics;
  channelId?: string;
  firestore: Firestore;
  db?: any;
  getDoc?: <T>(
    docRef: DocumentReference<T, DocumentData>,
  ) => Promise<T | undefined>;
  saveConfiguration?: (
    configuration: Configuration,
    totalPrice?: number,
    printingMethod?: PrintingMethodId,
    newItem?: boolean,
    prices?: Price[],
    expressPercent?: number,
  ) => void;
  saveConfigurationIcon?: string;
  saveConfigurationLabel?: string;
  saveAsNewLabel?: string;
  discount?: IDiscount;
  unit?: UnitId;
  customPrice?: number | null;
  displayCurrency?: CurrencyCode | null;
  currencySettings?: CurrencySettings | null;
  promotions?: Promotion[];
  customerDiscount?: number;
  attributes?: Attribute[];
  expressMode?: boolean;
  expressPercent?: number;
  allowOutOfSpec?: boolean;
  allowSaveAsNew?: boolean;
  registerAddToCartAction?: (
    action: (() => Promise<boolean | string>) | null,
  ) => void;
  t: TFunction;
  i18n: i18n;
  isStuck?: boolean;
};

export const Summary = memo(function Summary({
  product,
  configuration,
  resolvedPrices,
  add,
  user,
  loginAsGuest,
  analytics,
  channelId,
  firestore,
  db,
  getDoc,
  saveConfiguration,
  saveConfigurationIcon,
  saveConfigurationLabel,
  saveAsNewLabel,
  discount,
  unit,
  customPrice,
  displayCurrency,
  currencySettings,
  promotions,
  customerDiscount,
  attributes,
  expressMode,
  expressPercent,
  allowOutOfSpec,
  allowSaveAsNew = true,
  registerAddToCartAction,
  t,
  i18n,
  isStuck,
}: Props) {
  const { name, priceType } = product;
  const {
    descriptionCombination,
    combination,
    calculatedCombination,
    volume,
    customFormat,
    width,
    height,
    quantity,
    customSizes,
  } = configuration;
  const bleed = product.designSpec?.includeBleed
    ? product.designSpec.bleed
    : undefined;
  const hasSaveConfiguration = !isUndefined(saveConfiguration);
  const primaryActionLabel = hasSaveConfiguration
    ? (saveConfigurationLabel ??
      t("summary.saveConfiguration", {
        defaultValue: "Save configuration",
      }))
    : t("summary.addToCart", { defaultValue: "Add to cart" });
  const primaryActionIcon = hasSaveConfiguration
    ? (saveConfigurationIcon ?? "tune")
    : "add_shopping_cart";
  const hasCustomSizes = (customSizes?.length ?? 0) > 0;
  const summaryQuantity = hasCustomSizes
    ? calculateQuantityForMultipleSizes(customSizes ?? [], bleed)
    : isMatrixLikePriceType(priceType)
      ? volume
      : quantity;
  const summaryUnit = hasCustomSizes ? Unit.M2 : (unit ?? Unit.PCS);
  const { open, onOpen, onClose } = useDisclosure();
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [badConfiguration, setBadConfiguration] = useState<boolean>(false);
  const [isLoadingContinueAsGuest, setIsLoadingContinueAsGuest] =
    useState<boolean>(false);
  const canSubmitConfiguration =
    !badConfiguration &&
    !isValidating &&
    canAddToCart(product, configuration, { allowOutOfSpec });

  async function addToCart(
    _user?: User,
    newItem?: boolean,
  ): Promise<boolean | string> {
    try {
      if (!canSubmitConfiguration) {
        return false;
      }
      if (isNull(user) && isUndefined(_user)) {
        onOpen();
        return false;
      }
      if (isUndefined(product)) throw "isUndefined(product)";
      const fetchConfiguredPrices = (await import("./Price"))
        .fetchConfiguredPrices;
      const { pageCountStepPrices, prices } = await fetchConfiguredPrices(
        firestore,
        product,
        calculatedCombination || DEFAULT_COMBINATION,
        channelId,
        resolvedPrices,
        configuration.pageCount,
        {
          combination,
          customFormat,
          height,
          quantity,
          selectedAttributeOptions: configuration.selectedAttributeOptions,
          volume,
          width,
        },
      );
      if (isUndefined(prices)) throw "isUndefined(prices)";
      if (process.env.NODE_ENV === "development") {
        console.log(prices);
      }
      const activePageCount = resolvePageCountConfigForSelection(
        product.pageCount,
        configuration.selectedAttributeOptions,
      );
      const pageCountConfig = activePageCount
        ? getPageCountPricingMode(activePageCount.pricing) === "exact"
          ? activePageCount
          : {
              ...activePageCount,
              pricing:
                pageCountStepPrices && pageCountStepPrices.length > 0
                  ? {
                      ...(activePageCount.pricing ?? {}),
                      stepPrices: pageCountStepPrices,
                    }
                  : activePageCount.pricing,
            }
        : undefined;
      const { result: totalPrice } = calculateConfiguredProductPrice({
        quantity,
        prices,
        priceType: product?.priceType,
        discount: discount?.discountValue || undefined,
        calculatedCombination: calculatedCombination ?? undefined,
        volume,
        customFormat,
        width,
        height,
        minimumOrder: product?.spec?.minimumOrder,
        customPrice,
        bleed: product?.designSpec?.includeBleed
          ? product?.designSpec?.bleed
          : undefined,
        customerDiscount,
        customSizes,
        expressPercent:
          expressMode && expressPercent ? expressPercent : undefined,
        pageCount: configuration.pageCount,
        pageCountConfig,
        selectedAttributeOptions: configuration.selectedAttributeOptions,
      });
      if (isUndefined(totalPrice)) throw "isUndefined(totalPrice)";
      if (!isUndefined(saveConfiguration)) {
        const closestVolume = getClosestVolume(
          isMatrixLikePriceType(product.priceType) ? (volume ?? 1) : quantity,
          product.volumes.map((v) => Number(v.value)),
        );
        if (isUndefined(closestVolume)) throw "isUndefined(closestVolume)";
        const closestVolumeIndex = product.volumes.findIndex(
          (v) => Number(v.value) === closestVolume,
        );
        if (isUndefined(closestVolumeIndex))
          throw "isUndefined(closestVolumeIndex)";
        saveConfiguration(
          configuration,
          totalPrice,
          product.volumes[closestVolumeIndex]?.printType,
          newItem,
          prices,
          expressMode && expressPercent ? expressPercent : undefined,
        );
        return true;
      }

      let formatWidth, formatHeight;
      if (attributes && !customFormat) {
        const formatAttribute =
          attributes[
            attributes.findIndex((attribute) => attribute.format === true)
          ];
        if (formatAttribute && formatAttribute.options) {
          const formatAttributeOption =
            formatAttribute.options[
              formatAttribute.options.findIndex(
                (option) =>
                  option.value ===
                  configuration.selectedAttributeOptions?.[formatAttribute.id],
              )
            ];
          if (formatAttribute && formatAttributeOption) {
            if (
              formatAttributeOption.formatWidth &&
              formatAttributeOption.formatHeight
            ) {
              formatWidth = formatAttributeOption.formatWidth;
              formatHeight = formatAttributeOption.formatHeight;
            }
          }
        }
      }
      let orderItem: OrderItem = formatOrderItem({
        id: "",
        name: "",
        product: {
          ...product,
          prices,
          pageCount: pageCountConfig,
        },
        description: [
          descriptionCombination ?? "",
          formatPageCountBreakdown(configuration.pageCount, pageCountConfig),
        ]
          .filter((value) => value && value.length > 0)
          .join(", "),
        combination: combination ?? null,
        calculatedCombination: calculatedCombination ?? null,
        volume: volume,
        customFormat: customFormat,
        customPrice: 0,
        totalPrice: totalPrice ?? 0,
        width: formatWidth ?? width,
        height: formatHeight ?? height,
        quantity: quantity,
        pageCount: configuration.pageCount,
        customSizes: customSizes,
        advancedAttributeSelections: configuration.advancedAttributeSelections,
        discount: customerDiscount
          ? new Discount(
              undefined,
              "PERCENTAGE",
              customerDiscount,
              Math.floor(totalPrice * (customerDiscount / 100)),
            )
          : new Discount(),
        unit: hasCustomSizes ? Unit.M2 : Unit.PCS,
      });
      if (
        configuration.preview &&
        configuration.preview.pages &&
        configuration.preview.width &&
        configuration.preview.height
      ) {
        orderItem.preview = configuration.preview;
      }
      if (process.env.NODE_ENV === "development") {
        console.log(orderItem);
      }
      if (canAddToCart(product, configuration, { allowOutOfSpec })) {
        if (!add) {
          return true;
        }

        return (await add(orderItem, _user)) ?? false;
      } else {
        toaster.error({
          title: t("common.error"),
          description: t("cart.error.cantAddProduct"),
          duration: 5000,
        });
        return false;
      }
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  useEffect(() => {
    if (!registerAddToCartAction) {
      return;
    }

    registerAddToCartAction(() => addToCart(undefined, false));

    return () => {
      registerAddToCartAction(null);
    };
  }, [registerAddToCartAction, addToCart]);

  async function handleContinueAsGuest() {
    setIsLoadingContinueAsGuest(true);
    try {
      loginAsGuest && (await loginAsGuest(addToCart));
      onClose();
    } catch (error) {
      console.error(error);
      toaster.error({
        title: t("common.error"),
        description: t("account.error.cantContinueAsGuest"),
        duration: 5000,
      });
    } finally {
      setIsLoadingContinueAsGuest(false);
    }
  }

  return (
    <Box w={"100%"}>
      <Box
        overflow={"hidden"}
        maxH={isStuck ? "0px" : "80px"}
        opacity={isStuck ? 0 : 1}
        transition={"max-height 0.25s ease, opacity 0.2s ease"}
      >
        <CustomHeading
          heading={t("summary.heading")}
          goBack={false}
          mb={"4"}
          pt={"2"}
          size={"3xl"}
        />
      </Box>
      <Dialog.Root size={"xl"} open={open} motionPreset={"slide-in-bottom"}>
        <Portal>
          <Dialog.Positioner>
            <Dialog.Backdrop />
            <Dialog.Content mx={2} mt={[2, 16]}>
              <Dialog.Header>
                <Heading size={"4xl"}>
                  {t("cart.guest.continueAsGuest", {
                    defaultValue: "Continue as guest",
                  })}
                </Heading>
                <MaterialSymbol
                  position={"absolute"}
                  bottom={"4"}
                  left={"4"}
                  color="primary.solid"
                  fontSize={148}
                >
                  verified_user
                </MaterialSymbol>
              </Dialog.Header>
              <Dialog.Body>
                <SimpleGrid columns={3} gap={8}>
                  <GridItem
                    colSpan={[3, 1]}
                    borderRight={"1px solid"}
                    borderColor={{
                      base: "blackAlpha.200",
                      _dark: "whiteAlpha.200",
                    }}
                    pr={4}
                  >
                    {t("cart.guest.cantContinueAsGuest", {
                      defaultValue:
                        "To add a product to cart, log in or continue as a guest.",
                    })}
                  </GridItem>
                  <GridItem
                    colSpan={[3, 1]}
                    borderRight={"1px solid"}
                    borderColor={{
                      base: "blackAlpha.200",
                      _dark: "whiteAlpha.200",
                    }}
                    pr={8}
                  >
                    <Heading fontSize={"xl"}>
                      {t("cart.guest.shouldContinueAsGuest", {
                        defaultValue: "Do you want to continue as a guest?",
                      })}
                    </Heading>
                    <br />
                    <Button
                      w={"100%"}
                      colorPalette={"primary"}
                      onClick={handleContinueAsGuest}
                      disabled={isLoadingContinueAsGuest}
                    >
                      {t("cart.guest.continueAsGuest", {
                        defaultValue: "Continue as guest",
                      })}
                    </Button>
                    <Text fontSize={"xs"} mt={"4"} alignSelf={"center"}>
                      {t("cart.guest.acceptTerms.part1", {
                        defaultValue:
                          "By continuing as a guest, you agree to the",
                      })}{" "}
                      <Link
                        lng={i18n.resolvedLanguage}
                        href={"/help/regulations"}
                      >
                        {t("cart.guest.acceptTerms.part2", {
                          defaultValue: "terms of service",
                        })}
                      </Link>
                      <br />
                      {t("cart.guest.acceptTerms.part3", {
                        defaultValue: "and",
                      })}
                      <Link
                        lng={i18n.resolvedLanguage}
                        href={"/help/privacy-policy"}
                      >
                        {t("cart.guest.acceptTerms.part4", {
                          defaultValue: "privacy policy",
                        })}
                      </Link>
                      .
                    </Text>
                  </GridItem>
                  <GridItem colSpan={[3, 1]}>
                    <Heading fontSize={"xl"}>
                      {t("cart.guest.loginOrRegister", {
                        defaultValue: "Login or Register",
                      })}
                    </Heading>
                    <br />
                    <HStack>
                      <ButtonLink
                        lng={i18n.resolvedLanguage}
                        w={"100%"}
                        href={AUTH_LOGIN}
                        colorPalette={"primary"}
                        variant={"subtle"}
                        onClick={onClose}
                        ariaLabel={t("store.account.signIn", {
                          defaultValue: "Login",
                        })}
                      >
                        {t("store.account.signin", { defaultValue: "Login" })}
                      </ButtonLink>
                      <ButtonLink
                        lng={i18n.resolvedLanguage}
                        w={"100%"}
                        href={AUTH_REGISTER}
                        colorPalette={"primary"}
                        variant={"solid"}
                        onClick={onClose}
                        ariaLabel={t("store.account.signUp", {
                          defaultValue: "Register",
                        })}
                      >
                        {t("store.account.signup", {
                          defaultValue: "Register",
                        })}
                      </ButtonLink>
                    </HStack>
                  </GridItem>
                </SimpleGrid>
              </Dialog.Body>
              <Dialog.Footer>
                <Button onClick={onClose}>
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </Button>
              </Dialog.Footer>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </Dialog.CloseTrigger>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
      <SummaryDescription
        productName={name}
        quantity={summaryQuantity}
        unit={summaryUnit}
        descriptionCombination={descriptionCombination}
        customFormat={customFormat}
        customSizes={customSizes}
        width={width}
        height={height}
        bleed={bleed}
        t={t}
        collapsed={isStuck}
      />
      <Button
        disabled={!canSubmitConfiguration}
        mt={"6"}
        onClick={() => addToCart(undefined, false)}
        py={"8"}
        pl={"6"}
        pr={"2"}
        minW={"50%"}
        w={"100%"}
        colorPalette={"primary"}
        variant={"blurGlow"}
      >
        <MaterialSymbol>{primaryActionIcon}</MaterialSymbol>
        {primaryActionLabel}
        <Box
          bgColor={{ base: "white", _dark: "gray.950" }}
          border={"1px solid"}
          borderColor={{ base: "whiteAlpha.700", _dark: "whiteAlpha.200" }}
          py={"2"}
          px={"6"}
          borderRadius={"3xl"}
          ml={"auto"}
          mr={"2"}
          w={"175px"}
        >
          <ProductPrice
            product={product}
            combination={combination}
            calculatedCombination={calculatedCombination || DEFAULT_COMBINATION}
            resolvedPrices={resolvedPrices}
            customFormat={customFormat}
            width={width}
            height={height}
            pageCount={configuration.pageCount}
            quantity={quantity}
            volume={volume}
            selectedAttributeOptions={configuration.selectedAttributeOptions}
            setIsValidating={setIsValidating}
            setBadConfiguration={setBadConfiguration}
            descriptionCombination={descriptionCombination}
            analytics={analytics}
            channelId={channelId}
            firestore={firestore}
            db={db}
            getDoc={getDoc}
            customPrice={customPrice}
            displayCurrency={displayCurrency}
            currencySettings={currencySettings}
            customDiscount={
              discount instanceof Discount ? discount : new Discount(discount)
            }
            promotions={isUndefined(saveConfiguration) ? promotions : undefined}
            customerDiscount={customerDiscount}
            customSizes={customSizes}
            expressPercent={
              expressMode && expressPercent ? expressPercent : undefined
            }
            t={t}
            i18n={i18n}
          />
        </Box>
        <Box
          position={"absolute"}
          inset={"-2px"}
          h={"1px"}
          bgImage={themeGradients.topShine}
          mx={"auto"}
          mt={"auto"}
        />
      </Button>
      {hasSaveConfiguration && allowSaveAsNew && (
        <Button
          onClick={() => addToCart(undefined, true)}
          disabled={!canSubmitConfiguration}
          minW={"50%"}
          w={"100%"}
          mt={"4"}
          colorPalette={"primary"}
        >
          {saveAsNewLabel ??
            t("summary.saveAsNew", {
              defaultValue: "Add as new item to cart",
            })}
        </Button>
      )}
      {badConfiguration && (
        <Alert.Root status={"warning"} mt={4} borderRadius="3xl">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              {t("summary.noConfiguration", {
                defaultValue: "No configuration",
              })}
            </Alert.Title>
            <Alert.Description>
              {t("summary.badConfiguration", {
                defaultValue: "Invalid configuration",
              })}
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}
    </Box>
  );
});

Summary.displayName = "Summary";
