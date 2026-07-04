import { describe, expect, it } from "vitest";
import {
  parseInvoiceKind,
  parseInvoiceOrderIds,
  readInvoiceCreateSearchParams,
} from "./invoice-create-search-params";

describe("invoice create search params", () => {
  it("normalizes repeated and comma-separated order ids", () => {
    expect(parseInvoiceOrderIds([" first, second ", "third"])).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("returns undefined when order ids are empty", () => {
    expect(parseInvoiceOrderIds(["", "  , "])).toBeUndefined();
  });

  it("accepts only supported invoice kinds", () => {
    expect(parseInvoiceKind("vat")).toBe("vat");
    expect(parseInvoiceKind("proforma")).toBe("proforma");
    expect(parseInvoiceKind("receipt")).toBe("receipt");
    expect(parseInvoiceKind("estimate")).toBe("estimate");
    expect(parseInvoiceKind("unknown")).toBeUndefined();
  });

  it("reads invoice create params from URLSearchParams", () => {
    const searchParams = new URLSearchParams({
      channelId: " channel-a ",
      kind: "receipt",
      orderId: " order-a ",
      orderIds: "order-b, order-c",
    });
    searchParams.append("orderIds", "order-d");

    expect(readInvoiceCreateSearchParams(searchParams)).toEqual({
      channelId: "channel-a",
      kind: "receipt",
      orderId: "order-a",
      orderIds: ["order-b", "order-c", "order-d"],
    });
  });
});
