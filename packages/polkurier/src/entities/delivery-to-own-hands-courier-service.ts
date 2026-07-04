import { CourierService } from "./courier-service";

export class DeliveryToOwnHandsCourierService extends CourierService {
  private deliveryToOwnHands: boolean = false;

  setDeliveryToOwnHands(deliveryToOwnHands: boolean): this {
    this.deliveryToOwnHands = deliveryToOwnHands;
    return this;
  }

  toArray(): Record<string, unknown> {
    return {
      DOSTAWA_DO_RAK_WLASNYCH: this.deliveryToOwnHands,
    };
  }
}
