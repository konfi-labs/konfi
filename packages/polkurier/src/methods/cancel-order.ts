import { AbstractMethod } from "./abstract-method";
import { RequestBody } from "../types/interfaces";

export class CancelOrder extends AbstractMethod {
  private orderIdentifier?: string;

  getName(): string {
    return "cancel_order";
  }

  getRequestData(): RequestBody {
    return {
      orderno: this.orderIdentifier,
    };
  }

  setOrderId(orderId: string): this {
    const trimmed = orderId?.toString().trim();
    this.orderIdentifier = trimmed && trimmed.length > 0 ? trimmed : undefined;
    return this;
  }

  setOrderNumber(orderNumber: string): this {
    return this.setOrderId(orderNumber);
  }
}
