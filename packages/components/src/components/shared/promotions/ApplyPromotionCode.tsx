"use client";

import {
  Box,
  Button,
  CreateToasterReturn,
  Heading,
  HStack,
  Input,
} from "@chakra-ui/react";
import { getCampaign, getPromotion } from "@konfi/firebase";
import {
  ApplicationMethodTargetTypeEnum,
  type CurrencyCode,
  CurrencyEnum,
  Discount,
  OrderItem,
  type PromotionRuleContext,
} from "@konfi/types";
import { applyPromotion, formatPrice, getSubtotalPrice } from "@konfi/utils";
import { isEmpty } from "es-toolkit/compat";
import { Firestore } from "firebase/firestore";
import { TFunction } from "i18next";
import { Dispatch, SetStateAction, useState } from "react";
import { Controller, SubmitHandler, useForm } from "react-hook-form";

type Inputs = {
  code: string;
};

interface Props {
  setItemsWithDiscount: (items: OrderItem[]) => void;
  setAppliedPromotionCodes: Dispatch<SetStateAction<string[]>>;
  setShippingPriceDiscount: Dispatch<SetStateAction<Discount | null>>;
  setTotalDiscount: Dispatch<SetStateAction<Discount | null>>;
}

interface FnProps {
  firestore: Firestore;
  code: string;
  appliedPromotionCodes: string[];
  items: OrderItem[] | null;
  shippingPrice?: number;
  shippingPriceDiscount?: Discount | null;
  total?: number;
  currency?: CurrencyCode;
  totalDiscount: Discount | null;
  revalidate?: boolean;
  toast?: CreateToasterReturn;
  userId?: string;
  ruleContext?: PromotionRuleContext;
  t: TFunction;
}

interface ReturnProps {
  valid: boolean;
  appliedPromotionCodes?: string[];
  itemsWithDiscount?: OrderItem[];
  shippingPriceDiscount?: Discount;
  totalDiscount?: Discount;
}

export interface IApplyPromotionCodeFn {
  (props: FnProps): Promise<ReturnProps | void>;
}

let applyPromotionCode: IApplyPromotionCodeFn;

applyPromotionCode = async function (props) {
  const {
    code,
    appliedPromotionCodes,
    items,
    shippingPrice,
    shippingPriceDiscount,
    total,
    currency,
    totalDiscount,
    revalidate,
    toast,
    firestore,
    userId,
    ruleContext,
    t,
  } = props;
  try {
    if (!items)
      throw new Error(
        t("promotions.noItems", { defaultValue: "No items found" }),
      );

    const subtotal = getSubtotalPrice(items);

    if (items.find((item) => item.discount.code === code)) {
      if (revalidate) return;
      throw new Error(
        t("promotions.promotionCodeAlreadyApplied", {
          defaultValue:
            "Promotion code has already been applied to one of the items",
        }),
      );
    }
    if (shippingPriceDiscount?.code === code) {
      if (revalidate) return;
      throw new Error(
        t("promotions.promotionCodeAlreadyApplied", {
          defaultValue:
            "Promotion code has already been applied to the shipping cost",
        }),
      );
    }
    if (totalDiscount?.code === code) {
      if (revalidate) return;
      throw new Error(
        t("promotions.promotionCodeAlreadyApplied", {
          defaultValue:
            "Promotion code has already been applied to the order total",
        }),
      );
    }
    const promotion = await getPromotion(firestore, code);
    if (!promotion) {
      throw new Error(
        t("promotions.promotionCodeNotFound", {
          defaultValue: "Promotion code not found",
        }),
      );
    }
    let campaign;
    // Get campaign if promotion has campaignId
    if (promotion.campaignId) {
      campaign = await getCampaign(firestore, promotion.campaignId);
    }

    if (
      promotion.minimumOrderValue &&
      promotion.minimumOrderValue > 0 &&
      subtotal < promotion.minimumOrderValue
    ) {
      throw new Error(
        t("promotions.minimumOrderValueNotMet", {
          defaultValue: "Minimum order total for this promotion is {{amount}}",
          amount: formatPrice(
            promotion.minimumOrderValue,
            currency ??
              promotion.applicationMethod?.currencyCode ??
              CurrencyEnum.PLN,
          ),
        }),
      );
    }

    let result;
    let itemsWithDiscount: OrderItem[] | undefined;
    let nextShippingPriceDiscount: Discount | undefined;
    let nextTotalDiscount: Discount | undefined;
    // Apply promotion
    if (
      promotion.applicationMethod?.targetType ===
      ApplicationMethodTargetTypeEnum.ITEMS
    ) {
      result = applyPromotion(
        promotion,
        items,
        undefined,
        undefined,
        campaign,
        undefined,
        userId,
        subtotal,
        currency,
        ruleContext,
      );
      if (result.itemsWithDiscount) {
        itemsWithDiscount = result.itemsWithDiscount;
      } else {
        throw new Error(
          t("promotions.promotionCodeNotFound", {
            defaultValue: "Promotion code could not be applied to the items",
          }),
        );
      }
    } else if (
      promotion.applicationMethod?.targetType ===
      ApplicationMethodTargetTypeEnum.SHIPPING_METHODS
    ) {
      result = applyPromotion(
        promotion,
        undefined,
        shippingPrice,
        undefined,
        campaign,
        shippingPriceDiscount,
        userId,
        subtotal,
        currency,
        ruleContext,
      );
      if (result.discount) {
        nextShippingPriceDiscount = result.discount;
      } else {
        throw new Error(
          t("promotions.promotionCodeNotFound", {
            defaultValue:
              "Promotion code could not be applied to the shipping cost",
          }),
        );
      }
    } else if (
      promotion.applicationMethod?.targetType ===
      ApplicationMethodTargetTypeEnum.ORDER
    ) {
      result = applyPromotion(
        promotion,
        undefined,
        undefined,
        total,
        campaign,
        totalDiscount,
        userId,
        subtotal,
        currency,
        ruleContext,
      );
      if (result.discount) {
        nextTotalDiscount = result.discount;
      } else {
        throw new Error(
          t("promotions.promotionCodeNotFound", {
            defaultValue:
              "Promotion code could not be applied to the order total",
          }),
        );
      }
    }

    if (isEmpty(result)) {
      if (toast) {
        toast.error({
          title: t("common.error", { defaultValue: "Error" }),
          description: t("promotions.promotionCodeNotFound", {
            defaultValue: "Promotion code could not be applied",
          }),
        });
      }
    } else {
      // Only show success toast if we actually applied discount changes
      const hasItemDiscounts =
        itemsWithDiscount?.some((item) => item.discount?.code === code) ??
        false;
      const hasShippingDiscount = nextShippingPriceDiscount !== undefined;
      const hasTotalDiscount = nextTotalDiscount !== undefined;

      if (hasItemDiscounts || hasShippingDiscount || hasTotalDiscount) {
        if (toast) {
          toast.success({
            title: t("common.success", { defaultValue: "Success" }),
            description: t("promotions.promotionCodeApplied", { code }),
          });
        }
      } else {
        if (toast) {
          toast.error({
            title: t("common.error", { defaultValue: "Error" }),
            description: t("promotions.promotionCodeNotFound", { code }),
          });
        }
        return { valid: false };
      }
    }

    let nextAppliedPromotionCodes = [...appliedPromotionCodes];
    if (result?.removedCodes && result.removedCodes.length > 0) {
      const removedCodes = result.removedCodes;
      const filteredCodes = appliedPromotionCodes.filter(
        (appliedCode) => !removedCodes.includes(appliedCode),
      );
      nextAppliedPromotionCodes = [...filteredCodes, code];
    } else {
      nextAppliedPromotionCodes = [...nextAppliedPromotionCodes, code];
    }
    return {
      valid: true,
      appliedPromotionCodes: nextAppliedPromotionCodes,
      itemsWithDiscount,
      shippingPriceDiscount: nextShippingPriceDiscount,
      totalDiscount: nextTotalDiscount,
    };
  } catch (error) {
    console.error(error);
    if (toast) {
      toast.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: `${error}`,
      });
    }
    return { valid: false };
  }
};

export function ApplyPromotionCode(props: Omit<FnProps, "code"> & Props) {
  const { control, handleSubmit } = useForm({
    defaultValues: {
      code: "",
    },
  });
  const [isLoading, setIsLoading] = useState(false);

  const onSubmit: SubmitHandler<Inputs> = async ({ code }) => {
    setIsLoading(true);
    try {
      const result = await applyPromotionCode({ code, ...props });
      if (result) {
        const {
          valid,
          appliedPromotionCodes,
          itemsWithDiscount,
          shippingPriceDiscount,
          totalDiscount,
        } = result;
        if (valid) {
          if (appliedPromotionCodes && !isEmpty(appliedPromotionCodes)) {
            props.setAppliedPromotionCodes(appliedPromotionCodes);
            if (itemsWithDiscount && itemsWithDiscount.length > 0) {
              props.setItemsWithDiscount(itemsWithDiscount);
            } else if (shippingPriceDiscount) {
              props.setShippingPriceDiscount(shippingPriceDiscount);
            } else if (totalDiscount) {
              props.setTotalDiscount(totalDiscount);
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box>
      <Heading size={"sm"} mb={2}>
        {props.t("promotions.applyPromotionCode", {
          defaultValue: "Apply Promotion Code",
        })}
      </Heading>
      <form onSubmit={handleSubmit(onSubmit)}>
        <HStack>
          <Controller
            name={"code"}
            control={control}
            render={({ field }) => <Input {...field} />}
          />
          <Button
            colorPalette={"primary"}
            w={"50%"}
            type={"submit"}
            disabled={isLoading}
            loading={isLoading}
          >
            {isLoading
              ? props.t("promotions.applying", { defaultValue: "Loading…" })
              : props.t("promotions.apply", { defaultValue: "Apply" })}
          </Button>
        </HStack>
      </form>
    </Box>
  );
}

export { applyPromotionCode };
