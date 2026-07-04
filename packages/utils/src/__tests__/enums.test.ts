import {
  isOrderFilesStatus,
  isOrderStatus,
  isPaymentStatus,
} from "@konfi/types";

describe("enums", () => {
  it("isOrderStatus", () => {
    expect(isOrderStatus("NEW")).toBe(true);
    expect(isOrderStatus("IN_PROGRESS")).toBe(true);
    expect(isOrderStatus("READY")).toBe(true);
    expect(isOrderStatus("FULFILLED")).toBe(true);
    expect(isOrderStatus("CANCELED")).toBe(true);
    expect(isOrderStatus("DRAFT")).toBe(true);
  });

  it("isPaymentStatus", () => {
    expect(isPaymentStatus("NEW")).toBe(true);
    expect(isPaymentStatus("PENDING")).toBe(true);
    expect(isPaymentStatus("COMPLETED")).toBe(true);
    expect(isPaymentStatus("CANCELED")).toBe(true);
    expect(isPaymentStatus("DRAFT")).toBe(true);
  });

  it("isOrderFilesStatus", () => {
    expect(isOrderFilesStatus("WAITING_FOR_FILES")).toBe(true);
    expect(isOrderFilesStatus("FOR_PREPARATION")).toBe(true);
    expect(isOrderFilesStatus("UNKNOWN")).toBe(false);
    expect(isOrderFilesStatus(null)).toBe(false);
  });
});
