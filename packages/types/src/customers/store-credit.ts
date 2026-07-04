import type { CurrencyCode } from "../enums";
import type { TenantOwned } from "../tenant";
import type { Base } from "../base";

export enum StoreCreditTransactionType {
  ISSUE = "ISSUE",
  ADJUSTMENT = "ADJUSTMENT",
  REDEMPTION = "REDEMPTION",
  REVERSAL = "REVERSAL",
}

export interface StoreCreditTransaction extends Base, TenantOwned {
  amount: number;
  balanceAfter: number;
  currency: CurrencyCode;
  customerId: string;
  orderId?: string;
  reason: string;
  reversalTransactionId?: string;
  reversedTransactionId?: string;
  type: StoreCreditTransactionType;
}

export interface StoreCreditRedemption {
  amount: number;
  balanceAfter: number;
  balanceBefore: number;
  currency: CurrencyCode;
  transactionId?: string;
}
