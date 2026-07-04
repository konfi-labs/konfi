import { describe, expect, it } from "vitest";
import {
  buildProductSnapshot,
  calculateDiscountedTotals,
  calculateTotalDiscountAmount,
  calculateUndiscountedTotals,
  createPriceListPositionMap,
  findUniqueExactFakturowniaBuyerClient,
  getFakturowniaClientBuyerId,
  findUniqueFakturowniaClientByRecipient,
  getFakturowniaClientTaxNo,
  hasDiscountedPosition,
  extractTaxIdDigits,
  toTaxDisplayValue,
  toTaxNumeric,
  toTaxString,
  type InvoiceTotalsPosition,
} from "../invoice-helpers";

describe("Fakturownia invoice helpers", () => {
  describe("extractTaxIdDigits", () => {
    it("keeps only tax id digits", () => {
      expect(extractTaxIdDigits("PL 000-000-00-00")).toBe("0000000000");
    });

    it("returns an empty string for missing values", () => {
      expect(extractTaxIdDigits()).toBe("");
      expect(extractTaxIdDigits(null)).toBe("");
    });
  });

  describe("getFakturowniaClientTaxNo", () => {
    it("prefers normalized camelCase tax id", () => {
      expect(
        getFakturowniaClientTaxNo({
          additionalData: { tax_no: "9876543210" },
          taxNo: " 000-000-00-00 ",
        }),
      ).toBe("000-000-00-00");
    });

    it("falls back to serialized snake_case additional data", () => {
      expect(
        getFakturowniaClientTaxNo({
          additionalData: { tax_no: " 0000000000 " },
        }),
      ).toBe("0000000000");
    });
  });

  describe("getFakturowniaClientBuyerId", () => {
    it("reads typed buyer id", () => {
      expect(getFakturowniaClientBuyerId({ buyerId: 123 })).toBe("123");
    });

    it("falls back to serialized additional data buyer id", () => {
      expect(
        getFakturowniaClientBuyerId({
          additionalData: { buyer_id: "456" },
        }),
      ).toBe("456");
    });
  });

  describe("findUniqueFakturowniaClientByRecipient", () => {
    it("returns a unique exact name match with a tax id", () => {
      expect(
        findUniqueFakturowniaClientByRecipient(
          [
            { name: "Other client", taxNo: "1111111111" },
            {
              additionalData: { tax_no: "0000000000" },
              name: "  Example Office  ",
            },
          ],
          { name: "Example   Office" },
        ),
      ).toEqual({
        additionalData: { tax_no: "0000000000" },
        name: "  Example Office  ",
      });
    });

    it("prefers the recipient linked to the selected buyer", () => {
      expect(
        findUniqueFakturowniaClientByRecipient(
          [
            {
              additionalData: { buyer_id: "wrong-buyer" },
              name: "Example Office",
              taxNo: "1111111111",
            },
            {
              additionalData: { buyer_id: "buyer-1" },
              name: "Example Office",
              taxNo: "2222222222",
            },
          ],
          { buyerId: "buyer-1", name: "Example Office" },
        ),
      ).toEqual({
        additionalData: { buyer_id: "buyer-1" },
        name: "Example Office",
        taxNo: "2222222222",
      });
    });

    it("does not choose ambiguous exact name matches", () => {
      expect(
        findUniqueFakturowniaClientByRecipient(
          [
            { name: "Example Office", taxNo: "1111111111" },
            { name: " example office ", taxNo: "2222222222" },
          ],
          { name: "Example Office" },
        ),
      ).toBeUndefined();
    });

    it("uses address fields to choose the exact recipient", () => {
      expect(
        findUniqueFakturowniaClientByRecipient(
          [
            {
              city: "Wrong",
              name: "Example Office",
              postCode: "00-000",
              street: "Wrong street 1",
              taxNo: "1111111111",
            },
            {
              city: "Example Town",
              name: "Example Office",
              postCode: "05-270",
              street: "Example Avenue 95",
              taxNo: "2222222222",
            },
          ],
          {
            city: "Example Town",
            name: "Example Office",
            postCode: "05-270",
            street: "Example Avenue 95",
          },
        ),
      ).toEqual({
        city: "Example Town",
        name: "Example Office",
        postCode: "05-270",
        street: "Example Avenue 95",
        taxNo: "2222222222",
      });
    });

    it("does not choose a single taxable result with the wrong name", () => {
      expect(
        findUniqueFakturowniaClientByRecipient(
          [{ name: "Wrong Example Office", taxNo: "1111111111" }],
          { name: "Example Office" },
        ),
      ).toBeUndefined();
    });

    it("ignores matches without tax ids", () => {
      expect(
        findUniqueFakturowniaClientByRecipient([{ name: "Example Office" }], {
          name: "Example Office",
        }),
      ).toBeUndefined();
    });
  });

  describe("findUniqueExactFakturowniaBuyerClient", () => {
    it("returns one client that exactly matches buyer identity and address", () => {
      expect(
        findUniqueExactFakturowniaBuyerClient(
          [
            {
              city: "Example City",
              name: "Example Office",
              postCode: "00-000",
              street: "Wrong street 1",
              taxNo: "0000000000",
            },
            {
              city: "Example Town",
              name: "  Example Office  ",
              postCode: "05-270",
              street: "Example Avenue 95",
              taxNo: "000-000-00-00",
            },
          ],
          {
            city: "Example Town",
            name: "Example   Office",
            postCode: "05 270",
            street: "Example Avenue 95",
            taxNo: "0000000000",
          },
        ),
      ).toEqual({
        city: "Example Town",
        name: "  Example Office  ",
        postCode: "05-270",
        street: "Example Avenue 95",
        taxNo: "000-000-00-00",
      });
    });

    it("does not return an ambiguous exact buyer match", () => {
      expect(
        findUniqueExactFakturowniaBuyerClient(
          [
            {
              city: "Example Town",
              name: "Example Office",
              postCode: "05-270",
              street: "Main 1",
              taxNo: "0000000000",
            },
            {
              city: "Example Town",
              name: "Example Office",
              postCode: "05-270",
              street: "Main 1",
              taxNo: "0000000000",
            },
          ],
          {
            city: "Example Town",
            name: "Example Office",
            postCode: "05-270",
            street: "Main 1",
            taxNo: "0000000000",
          },
        ),
      ).toBeUndefined();
    });

    it("requires all buyer match fields", () => {
      expect(
        findUniqueExactFakturowniaBuyerClient(
          [
            {
              city: "Example Town",
              name: "Example Office",
              postCode: "05-270",
              street: "Main 1",
              taxNo: "0000000000",
            },
          ],
          {
            name: "Example Office",
            taxNo: "0000000000",
          },
        ),
      ).toBeUndefined();
    });
  });

  describe("createPriceListPositionMap", () => {
    it("indexes price list positions by product id", () => {
      const firstPosition = { productId: "product-a", priceNet: 10 };
      const secondPosition = { productId: "product-b", priceNet: 20 };

      expect(
        createPriceListPositionMap({
          positions: [
            firstPosition,
            { productId: "", priceNet: 30 },
            { priceNet: 40 },
            secondPosition,
          ],
        }),
      ).toEqual({
        "product-a": firstPosition,
        "product-b": secondPosition,
      });
    });
  });

  describe("tax formatting", () => {
    it("normalizes numeric and textual tax values", () => {
      expect(toTaxString(23)).toBe("23");
      expect(toTaxString(" 8 ")).toBe("8");
      expect(toTaxString("")).toBeUndefined();
      expect(toTaxNumeric("5,5")).toBe(5.5);
      expect(toTaxNumeric("zw")).toBeUndefined();
      expect(toTaxDisplayValue(23)).toBe("23%");
      expect(toTaxDisplayValue("zw")).toBe("zw");
    });
  });

  describe("buildProductSnapshot", () => {
    it("reads camelCase product fields", () => {
      expect(
        buildProductSnapshot({
          id: 123,
          name: " Business cards ",
          description: "Premium paper",
          code: "BC-001",
          currency: "PLN",
          quantityUnit: "pcs",
          tax: 23,
          priceNet: 10.1234,
          priceGross: 12.3456,
        }),
      ).toEqual({
        id: "123",
        name: "Business cards",
        description: "Premium paper",
        code: "BC-001",
        currency: "PLN",
        quantityUnit: "pcs",
        taxString: "23",
        taxNumber: 23,
        priceNet: 10.12,
        priceGross: 12.35,
      });
    });

    it("reads snake_case product fields from API responses", () => {
      expect(
        buildProductSnapshot({
          product_id: "remote-1",
          sku: "SKU-1",
          quantity_unit: "m2",
          tax_rate: "8,5",
          price_net: "1 234,56",
          price_gross: "1518.51",
        }),
      ).toMatchObject({
        id: "remote-1",
        code: "SKU-1",
        quantityUnit: "m2",
        taxString: "8,5",
        taxNumber: 8.5,
        priceNet: 1234.56,
        priceGross: 1518.51,
      });
    });
  });

  describe("invoice totals", () => {
    const positions: InvoiceTotalsPosition[] = [
      { totalNet: 100, totalGross: 123, discountPercent: 10 },
      { totalNet: 50, totalGross: 61.5 },
      { totalNet: null, totalGross: undefined, discountPercent: null },
    ];

    it("detects when at least one position has a discount", () => {
      expect(hasDiscountedPosition(positions)).toBe(true);
      expect(hasDiscountedPosition([{ discountPercent: 0 }])).toBe(false);
      expect(hasDiscountedPosition([{ discountPercent: -10 }])).toBe(false);
      expect(hasDiscountedPosition(null)).toBe(false);
    });

    it("calculates undiscounted totals", () => {
      expect(calculateUndiscountedTotals(positions)).toEqual({
        net: 150,
        gross: 184.5,
      });
    });

    it("calculates discounted totals using per-position rounding", () => {
      expect(calculateDiscountedTotals(positions)).toEqual({
        net: 140,
        gross: 172.2,
      });
    });

    it("calculates the total discount amount", () => {
      expect(calculateTotalDiscountAmount(184.5, 172.2)).toBe(12.3);
    });
  });
});
