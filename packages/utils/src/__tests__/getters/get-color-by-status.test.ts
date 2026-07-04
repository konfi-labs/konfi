import { describe, expect, it } from "vitest";
import { PaymentStatus } from "@konfi/types";
import {
  getColorByStatus,
  getOrderPaymentStatusColorPalette,
} from "../../getters/get-color-by-status";

describe("getColorByStatus", () => {
  it("should return blue style for NEW status", () => {
    const result = getColorByStatus("NEW");
    expect(result).toEqual({
      bgColor: { base: "blue.100", _dark: "blue.900/33" },
      color: { base: "blue.900", _dark: "blue.100" },
      colorPalette: "blue",
    });
  });

  it("should return orange style for PENDING status", () => {
    const result = getColorByStatus("PENDING");
    expect(result).toEqual({
      bgColor: { base: "orange.100", _dark: "orange.900/33" },
      color: { base: "orange.900", _dark: "orange.100" },
      colorPalette: "orange",
    });
  });

  it("should return yellow style for UNDER_REVIEW status", () => {
    const result = getColorByStatus("UNDER_REVIEW");
    expect(result).toEqual({
      bgColor: { base: "yellow.100", _dark: "yellow.900/33" },
      color: { base: "yellow.900", _dark: "yellow.100" },
      colorPalette: "yellow",
    });
  });

  it("should return orange style for IN_PROGRESS status", () => {
    const result = getColorByStatus("IN_PROGRESS");
    expect(result).toEqual({
      bgColor: { base: "orange.100", _dark: "orange.900/33" },
      color: { base: "orange.900", _dark: "orange.100" },
      colorPalette: "orange",
    });
  });

  it("should return purple style for WAITING_FOR_MATERIALS status", () => {
    const result = getColorByStatus("WAITING_FOR_MATERIALS");
    expect(result).toEqual({
      bgColor: { base: "purple.100", _dark: "purple.900/33" },
      color: { base: "purple.900", _dark: "purple.100" },
      colorPalette: "purple",
    });
  });

  it("should return green style for READY status", () => {
    const result = getColorByStatus("READY");
    expect(result).toEqual({
      bgColor: { base: "green.100", _dark: "green.900/33" },
      color: { base: "green.900", _dark: "green.100" },
      colorPalette: "green",
    });
  });

  it("should return green style for COMPLETED status", () => {
    const result = getColorByStatus("COMPLETED");
    expect(result).toEqual({
      bgColor: { base: "green.100", _dark: "green.900/33" },
      color: { base: "green.900", _dark: "green.100" },
      colorPalette: "green",
    });
  });

  it("should return gray style for FULFILLED status", () => {
    const result = getColorByStatus("FULFILLED");
    expect(result).toEqual({
      bgColor: { base: "gray.100", _dark: "gray.900/33" },
      color: { base: "gray.900", _dark: "gray.100" },
      colorPalette: "gray",
    });
  });

  it("should return red style for CANCELED status", () => {
    const result = getColorByStatus("CANCELED");
    expect(result).toEqual({
      bgColor: { base: "red.100", _dark: "red.900/33" },
      color: { base: "red.900", _dark: "red.100" },
      colorPalette: "red",
    });
  });

  it("should return red style for DELAYED status", () => {
    const result = getColorByStatus("DELAYED");
    expect(result).toEqual({
      bgColor: { base: "red.100", _dark: "red.900/33" },
      color: { base: "red.900", _dark: "red.100" },
      colorPalette: "red",
    });
  });

  it("should return dark gray style for DRAFT status", () => {
    const result = getColorByStatus("DRAFT");
    expect(result).toEqual({
      bgColor: { base: "gray.900", _dark: "gray.900/33" },
      color: { base: "white", _dark: "white" },
      colorPalette: "gray",
    });
  });

  it("should return purple style for REFUNDED status", () => {
    const result = getColorByStatus("REFUNDED");
    expect(result).toEqual({
      bgColor: { base: "purple.900", _dark: "purple.900/33" },
      color: { base: "white", _dark: "white" },
      colorPalette: "purple",
    });
  });

  it("should return default style for unknown status", () => {
    const result = getColorByStatus(
      "UNKNOWN" as Parameters<typeof getColorByStatus>[0],
    );
    expect(result).toEqual({
      bgColor: { base: "white", _dark: "gray.900/33" },
      color: { base: "gray.900", _dark: "gray.200" },
      colorPalette: "gray",
    });
  });

  it("should return orange style for order files status WAITING_FOR_FILES", () => {
    const result = getColorByStatus("WAITING_FOR_FILES");
    expect(result).toEqual({
      bgColor: { base: "orange.100", _dark: "orange.900/33" },
      color: { base: "orange.900", _dark: "orange.100" },
      colorPalette: "orange",
    });
  });

  it("should return gray style for order files status FILES_ARE_READY", () => {
    const result = getColorByStatus("FILES_ARE_READY");
    expect(result).toEqual({
      bgColor: { base: "gray.100", _dark: "gray.900/33" },
      color: { base: "gray.900", _dark: "gray.100" },
      colorPalette: "gray",
    });
  });

  it("should return purple for completed payments without a payment document", () => {
    const result = getOrderPaymentStatusColorPalette(
      PaymentStatus.COMPLETED,
      "",
    );

    expect(result).toBe("purple");
  });

  it("should keep completed payments gray when a payment document exists", () => {
    const result = getOrderPaymentStatusColorPalette(
      PaymentStatus.COMPLETED,
      "FV/1/2026",
    );

    expect(result).toBe("gray");
  });
});
