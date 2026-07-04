import { Timestamp } from "firebase/firestore";
import { ActivityStatus } from "../enums";
import type { PaymentMethodId } from "../configuration/payment-methods";

export interface IActivity {
  type: keyof typeof ActivityStatus;
  value: string;
  timestamp: Omit<Timestamp, "toJSON">;
  metadata?: {
    before?: PaymentMethodId;
    after?: PaymentMethodId;
    dynamicTemplateData?: {
      [key: string]: unknown;
    };
    stage?: string;
    to?: string;
    subject?: string;
    [key: string]: unknown;
  };
}
