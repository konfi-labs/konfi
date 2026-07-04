import { AbstractMethod } from "./abstract-method";
import { RequestBody } from "../types/interfaces";

export class GetLabel extends AbstractMethod {
  private orderNumbers: string[] = [];
  private type?: string;

  getName(): string {
    return "get_label";
  }

  getRequestData(): RequestBody {
    const payload: RequestBody = {
      orderno: this.orderNumbers,
    };

    if (this.type) {
      payload.type = this.type;
    }

    return payload;
  }

  setOrderNumbers(orderNumbers: string[]): this {
    this.orderNumbers = orderNumbers
      .map((orderNumber) => orderNumber?.toString().trim())
      .filter((orderNumber): orderNumber is string =>
        Boolean(orderNumber && orderNumber.length > 0),
      );
    return this;
  }

  addOrderNumber(orderNumber: string): this {
    const trimmed = orderNumber?.toString().trim();

    if (trimmed) {
      this.orderNumbers.push(trimmed);
    }

    return this;
  }

  setOrderId(orderNumbers: string[]): this {
    return this.setOrderNumbers(orderNumbers);
  }

  setOrderNumber(orderNumber: string): this {
    return this.setOrderNumbers([orderNumber]);
  }

  setOrderno(orderNumbers: string[]): this {
    return this.setOrderNumbers(orderNumbers);
  }

  setOrdernoSingle(orderNumber: string): this {
    return this.setOrderNumber(orderNumber);
  }

  clearOrderNumbers(): this {
    this.orderNumbers = [];
    return this;
  }

  setType(type: string): this {
    this.type = type;
    return this;
  }
}
