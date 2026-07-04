import { CodType, ReturnCodType } from "../types/enums";
import { BaseEntity } from "./base-entity";

export class COD extends BaseEntity {
  private type: CodType = CodType.STANDARD;
  private amount?: number;
  private bankAccount?: string;
  private returnCod: ReturnCodType = ReturnCodType.BANK_ACCOUNT;

  setType(type: CodType): this {
    this.type = type;
    return this;
  }

  setAmount(amount: number): this {
    this.amount = amount;
    return this;
  }

  setBankAccount(bankAccount: string): this {
    this.bankAccount = bankAccount;
    return this;
  }

  setReturnCod(returnCod: ReturnCodType): this {
    this.returnCod = returnCod;
    return this;
  }

  hasValue(): boolean {
    return typeof this.amount === "number" && this.amount > 0;
  }

  toArray(): Record<string, unknown> {
    return {
      codtype: this.type,
      codamount: this.amount,
      codbankaccount: this.bankAccount,
      return_cod: this.returnCod,
    };
  }
}
