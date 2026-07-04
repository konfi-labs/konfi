import { PaymentType } from "@konfi/types";

export const agentPaymentTypeValues = Object.values(PaymentType) as [
  PaymentType,
  ...PaymentType[],
];
