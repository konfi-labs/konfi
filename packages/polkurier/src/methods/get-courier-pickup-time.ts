import { AbstractMethod } from "./abstract-method";
import { RequestBody } from "../types/interfaces";

export class GetCourierPickupTime extends AbstractMethod {
  private courier?: string;
  private shipFrom?: string;
  private shipTo?: string;
  private parcel?: string;

  getName(): string {
    return "get_courier_pickup_time";
  }

  getRequestData(): RequestBody {
    return {
      courier: this.courier,
      shipfrom: this.shipFrom,
      shipto: this.shipTo,
      parcel: this.parcel,
    };
  }

  setCourier(courier: string): this {
    this.courier = courier;
    return this;
  }

  setShipFrom(shipFrom: string): this {
    this.shipFrom = shipFrom;
    return this;
  }

  setShipTo(shipTo: string): this {
    this.shipTo = shipTo;
    return this;
  }

  setParcel(parcel: string): this {
    this.parcel = parcel;
    return this;
  }
}
