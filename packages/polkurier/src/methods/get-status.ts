import { AbstractMethod } from "./abstract-method";
import { RequestBody } from "../types/interfaces";

export class GetStatus extends AbstractMethod {
  private orderNumber?: string;

  getName(): string {
    return "get_status";
  }

  getRequestData(): RequestBody {
    return {
      orderno: this.orderNumber,
    };
  }

  setOrderNumber(orderNumber: string): this {
    const trimmed = orderNumber?.toString().trim();
    this.orderNumber = trimmed && trimmed.length > 0 ? trimmed : undefined;
    return this;
  }

  setOrderId(orderId: string): this {
    return this.setOrderNumber(orderId);
  }
}
