import { PaymentStatus } from "@konfi/types";
import { describe, expect, it } from "vitest";
import { getPaymentProofOptimisticOrderUpdate } from "./payment-proof-utils";

describe("getPaymentProofOptimisticOrderUpdate", () => {
  it("sets payment document id and completed payment status", () => {
    expect(getPaymentProofOptimisticOrderUpdate("FV/123")).toEqual({
      paymentDocumentId: "FV/123",
      paymentStatus: PaymentStatus.COMPLETED,
    });
  });
});
