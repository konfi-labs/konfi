import { AbstractMethod } from "./abstract-method";
import { RequestBody } from "../types/interfaces";

export class GetProtocol extends AbstractMethod {
  private orderNumbers: string[] = [];

  getName(): string {
    return "get_protocol";
  }

  getRequestData(): RequestBody {
    return {
      orderno: this.orderNumbers,
    };
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

  setOrderId(orderId: string): this {
    return this.setOrderNumbers([orderId]);
  }

  setOrderNumber(orderNumber: string): this {
    return this.setOrderNumbers([orderNumber]);
  }

  setOrderno(orderNumbers: string[]): this {
    return this.setOrderNumbers(orderNumbers);
  }

  clearOrderNumbers(): this {
    this.orderNumbers = [];
    return this;
  }
}
