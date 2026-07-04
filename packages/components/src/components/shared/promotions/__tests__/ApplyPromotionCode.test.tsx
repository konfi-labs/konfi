import "@testing-library/jest-dom";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ApplicationMethodTargetTypeEnum,
  CurrencyEnum,
  Discount,
  DiscountTypeEnum,
  OrderItem,
  PriceTypeEnum,
  type PromotionRuleContext,
  Unit,
} from "@konfi/types";
import { render } from "../../../test-utils/render";
import { ApplyPromotionCode } from "../ApplyPromotionCode";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetPromotion = vi.fn();
const mockGetCampaign = vi.fn();
const mockApplyPromotion = vi.fn();

vi.mock("@konfi/firebase", () => ({
  getCampaign: (...args: unknown[]) => mockGetCampaign(...args),
  getPromotion: (...args: unknown[]) => mockGetPromotion(...args),
}));

vi.mock("@konfi/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@konfi/utils")>();

  return {
    ...actual,
    applyPromotion: (...args: unknown[]) => mockApplyPromotion(...args),
  };
});

const createDiscount = (code: string) =>
  new Discount(undefined, DiscountTypeEnum.FIXED, 1000, 1000, code);

const mockT = (
  key: string,
  options?: { defaultValue?: string; code?: string },
) => {
  if (key === "promotions.promotionCodeApplied" && options?.code) {
    return `Promotion code ${options.code} applied`;
  }

  return options?.defaultValue || key;
};

const baseItem: OrderItem = {
  id: "item-1",
  name: "Test item",
  quantity: 1,
  totalPrice: 5000,
  unit: Unit.PCS,
  description: "desc",
  customFormat: false,
  customPrice: null,
  discount: new Discount(undefined, DiscountTypeEnum.FIXED, 0, 0),
  product: {
    id: "product-1",
    name: "Product",
    description: "Product description",
    priceType: PriceTypeEnum.SINGLE,
    prefferedUnit: Unit.PCS,
    prices: [],
    defaultPrice: { value: 0, currency: CurrencyEnum.PLN },
    lowPrice: { value: 0, currency: CurrencyEnum.PLN },
    highPrice: { value: 0, currency: CurrencyEnum.PLN },
    volumes: [],
    attributes: [],
    attributeOptions: {},
    customSize: false,
    allowCustomPrice: false,
    recommended: false,
    difficulty: 1,
    shipping: {
      types: [],
    },
    category: { id: "category-1", name: "Category" },
    spec: {
      images: [],
      defaultOrder: 1,
      minimumOrder: 1,
      maximumOrder: 100,
      step: 1,
    },
    productType: null,
  },
};

function renderComponent(ruleContext?: PromotionRuleContext) {
  const setItemsWithDiscount = vi.fn();
  const setAppliedPromotionCodes = vi.fn();
  const setShippingPriceDiscount = vi.fn();
  const setTotalDiscount = vi.fn();
  const toast = {
    success: vi.fn(),
    error: vi.fn(),
  };

  render(
    <ApplyPromotionCode
      appliedPromotionCodes={[]}
      items={[baseItem]}
      shippingPrice={1500}
      shippingPriceDiscount={null}
      total={6500}
      totalDiscount={null}
      revalidate={false}
      toast={toast as never}
      setItemsWithDiscount={setItemsWithDiscount}
      setAppliedPromotionCodes={setAppliedPromotionCodes}
      setShippingPriceDiscount={setShippingPriceDiscount}
      setTotalDiscount={setTotalDiscount}
      firestore={{} as never}
      userId={"user-1"}
      ruleContext={ruleContext}
      t={mockT as never}
    />,
  );

  return {
    setItemsWithDiscount,
    setAppliedPromotionCodes,
    setShippingPriceDiscount,
    setTotalDiscount,
    toast,
  };
}

describe("ApplyPromotionCode", () => {
  beforeEach(() => {
    mockGetCampaign.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("applies shipping discounts without replacing cart items", async () => {
    const user = userEvent.setup();
    const shippingDiscount = createDiscount("SHIP10");

    mockGetPromotion.mockResolvedValue({
      code: "SHIP10",
      applicationMethod: {
        targetType: ApplicationMethodTargetTypeEnum.SHIPPING_METHODS,
      },
    });
    mockApplyPromotion.mockReturnValue({ discount: shippingDiscount });

    const {
      setAppliedPromotionCodes,
      setItemsWithDiscount,
      setShippingPriceDiscount,
      setTotalDiscount,
      toast,
    } = renderComponent();

    await user.type(screen.getByRole("textbox"), "SHIP10");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(setAppliedPromotionCodes).toHaveBeenCalledWith(["SHIP10"]);
    expect(setShippingPriceDiscount).toHaveBeenCalledWith(shippingDiscount);
    expect(setItemsWithDiscount).not.toHaveBeenCalled();
    expect(setTotalDiscount).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
  });

  it("applies order discounts without replacing cart items", async () => {
    const user = userEvent.setup();
    const totalDiscount = createDiscount("ORDER10");

    mockGetPromotion.mockResolvedValue({
      code: "ORDER10",
      applicationMethod: {
        targetType: ApplicationMethodTargetTypeEnum.ORDER,
      },
    });
    mockApplyPromotion.mockReturnValue({ discount: totalDiscount });

    const {
      setAppliedPromotionCodes,
      setItemsWithDiscount,
      setShippingPriceDiscount,
      setTotalDiscount,
      toast,
    } = renderComponent();

    await user.type(screen.getByRole("textbox"), "ORDER10");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(setAppliedPromotionCodes).toHaveBeenCalledWith(["ORDER10"]);
    expect(setTotalDiscount).toHaveBeenCalledWith(totalDiscount);
    expect(setItemsWithDiscount).not.toHaveBeenCalled();
    expect(setShippingPriceDiscount).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
  });

  it("passes promotion rule context into discount evaluation", async () => {
    const user = userEvent.setup();
    const totalDiscount = createDiscount("GROUP10");
    const ruleContext: PromotionRuleContext = {
      channelId: "channel-1",
      customerGroupIds: ["group-1"],
      isFirstOrder: true,
    };

    mockGetPromotion.mockResolvedValue({
      code: "GROUP10",
      applicationMethod: {
        targetType: ApplicationMethodTargetTypeEnum.ORDER,
      },
    });
    mockApplyPromotion.mockReturnValue({ discount: totalDiscount });

    renderComponent(ruleContext);

    await user.type(screen.getByRole("textbox"), "GROUP10");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(mockApplyPromotion).toHaveBeenCalledWith(
      expect.objectContaining({ code: "GROUP10" }),
      undefined,
      undefined,
      6500,
      undefined,
      null,
      "user-1",
      5000,
      undefined,
      ruleContext,
    );
  });

  it("shows an error when subtotal is below the promotion minimum order value", async () => {
    const user = userEvent.setup();

    mockGetPromotion.mockResolvedValue({
      code: "ORDER100",
      minimumOrderValue: 7000,
      applicationMethod: {
        targetType: ApplicationMethodTargetTypeEnum.ORDER,
      },
    });

    const {
      setAppliedPromotionCodes,
      setItemsWithDiscount,
      setShippingPriceDiscount,
      setTotalDiscount,
      toast,
    } = renderComponent();

    await user.type(screen.getByRole("textbox"), "ORDER100");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(mockApplyPromotion).not.toHaveBeenCalled();
    expect(setAppliedPromotionCodes).not.toHaveBeenCalled();
    expect(setItemsWithDiscount).not.toHaveBeenCalled();
    expect(setShippingPriceDiscount).not.toHaveBeenCalled();
    expect(setTotalDiscount).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });
});
