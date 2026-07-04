import "@testing-library/jest-dom";
import {
  CurrencyEnum,
  Discount,
  DiscountTypeEnum,
  OrderItem,
  PriceTypeEnum,
  Unit,
} from "@konfi/types";
import { screen } from "@testing-library/react";
import type { TFunction } from "i18next";
import type { ImgHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../test-utils/render";
import { Item } from "./Item";

vi.mock("next/image", () => ({
  default: ({
    alt,
    blurDataURL: _blurDataURL,
    fill: _fill,
    loader: _loader,
    placeholder: _placeholder,
    preload: _preload,
    quality: _quality,
    src,
    unoptimized: _unoptimized,
    ...rest
  }: ImgHTMLAttributes<HTMLImageElement> & {
    blurDataURL?: string;
    fill?: boolean;
    loader?: unknown;
    placeholder?: string;
    preload?: boolean;
    quality?: number;
    src: string;
    unoptimized?: boolean;
  }) => <img alt={alt} src={src} {...rest} />,
}));

const mockT = ((key: string, options?: { defaultValue?: string }) => {
  if (key === "forms.labels.express") return "Express";
  if (key === "Unit.PCS") return "pcs";
  if (key === "Unit.M2") return "m²";
  if (key === "product.finishing.currentConfiguration") {
    return "Current configuration";
  }
  if (key === "product.finishing.reinforcement") return "Reinforcement";
  if (key === "product.finishing.grommets") return "Grommets";
  if (key === "product.finishing.grommetsSummary") {
    return `Spacing ${options?.spacing} cm • first corner ${options?.offsetStart} cm • last corner ${options?.offsetEnd} cm`;
  }
  if (key === "product.finishing.sides.top") return "Top";
  if (key === "product.finishing.sides.left") return "Left";

  return options?.defaultValue ?? key;
}) as TFunction;

function createOrderItem(expressPercent?: number): OrderItem {
  return {
    id: "item-1",
    name: "Business Cards",
    quantity: 1,
    totalPrice: 1500,
    unit: Unit.PCS,
    description: "Paper: 350g, Finish: Matte",
    customFormat: false,
    customPrice: null,
    discount: new Discount(undefined, DiscountTypeEnum.FIXED, 0, 0),
    expressPercent,
    product: {
      id: "product-1",
      name: "Business Cards",
      description: "Printed business cards",
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
      channelId: "channel-1",
    },
  };
}

describe("Item", () => {
  it("shows an express badge when express pricing is enabled", () => {
    render(
      <Item
        item={createOrderItem(20)}
        channelId="channel-1"
        t={mockT}
        i18n={{ resolvedLanguage: "en" } as never}
      />,
    );

    expect(screen.getByText("Express")).toBeInTheDocument();
    expect(screen.queryByText("+20%")).not.toBeInTheDocument();
  });

  it("does not show express pricing badges when express pricing is not enabled", () => {
    render(
      <Item
        item={createOrderItem()}
        channelId="channel-1"
        t={mockT}
        i18n={{ resolvedLanguage: "en" } as never}
      />,
    );

    expect(screen.queryByText("Express")).not.toBeInTheDocument();
    expect(screen.queryByText("+20%")).not.toBeInTheDocument();
  });

  it("shows volume as quantity for dynamic price items", () => {
    const item = createOrderItem();
    item.quantity = 1;
    item.volume = 250;
    if (item.product) {
      item.product.priceType = PriceTypeEnum.DYNAMIC;
    }

    render(
      <Item
        item={item}
        channelId="channel-1"
        t={mockT}
        i18n={{ resolvedLanguage: "en" } as never}
      />,
    );

    expect(screen.getAllByText("250 pcs").length).toBeGreaterThan(0);
    expect(screen.queryByText("1 pcs")).not.toBeInTheDocument();
  });

  it("falls back to quantity while a dynamic item volume is hydrating", () => {
    const item = createOrderItem();
    item.quantity = 100;
    item.volume = undefined;
    if (item.product) {
      item.product.priceType = PriceTypeEnum.DYNAMIC;
    }

    render(
      <Item
        item={item}
        channelId="channel-1"
        t={mockT}
        i18n={{ resolvedLanguage: "en" } as never}
      />,
    );

    expect(screen.getAllByText("100 pcs").length).toBeGreaterThan(0);
    expect(screen.queryByText("0 pcs")).not.toBeInTheDocument();
  });

  it("shows m² for custom-size items", () => {
    const item = createOrderItem();
    item.unit = Unit.M2;
    item.customFormat = true;
    item.customSizes = [{ width: 100, height: 200, quantity: 2 }];

    render(
      <Item
        item={item}
        channelId="channel-1"
        t={mockT}
        i18n={{ resolvedLanguage: "en" } as never}
      />,
    );

    expect(screen.getAllByText("0.04 m²")).toHaveLength(2);
  });

  it("renders preserved advanced finishing details", () => {
    const item = createOrderItem();
    item.advancedAttributeSelections = {
      finishing: {
        preset: "custom",
        reinforcementSides: ["top"],
        tunnelSides: [],
        grommets: {
          sides: ["left"],
          spacing: 40,
          offsetStart: 5,
          offsetEnd: 10,
        },
        cutToSize: false,
      },
    };

    render(
      <Item
        item={item}
        channelId="channel-1"
        t={mockT}
        i18n={{ resolvedLanguage: "en" } as never}
      />,
    );

    expect(screen.getByText("Current configuration")).toBeInTheDocument();
    expect(screen.getByText("Reinforcement: Top")).toBeInTheDocument();
    expect(screen.getByText("Grommets: Left")).toBeInTheDocument();
    expect(
      screen.getByText("Spacing 40 cm • first corner 5 cm • last corner 10 cm"),
    ).toBeInTheDocument();
  });
});
