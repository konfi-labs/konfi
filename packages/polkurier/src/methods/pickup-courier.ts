import { AbstractMethod } from "./abstract-method";
import { RequestBody } from "../types/interfaces";

export class PickupCourier extends AbstractMethod {
  private pickupDate?: string;
  private courier?: string;
  private shipFrom?: string;
  private parcel?: string;

  getName(): string {
    return "pickup_courier";
  }

  getRequestData(): RequestBody {
    return {
      pickupdate: this.pickupDate,
      courier: this.courier,
      shipfrom: this.shipFrom,
      parcel: this.parcel,
    };
  }

  setPickupdate(pickupDate: string): this {
    this.pickupDate = pickupDate;
    return this;
  }

  setDate(date: string): this {
    return this.setPickupdate(date);
  }

  setCourier(courier: string): this {
    this.courier = courier;
    return this;
  }

  setShipfrom(shipFrom: string): this {
    this.shipFrom = shipFrom;
    return this;
  }

  setShipFrom(shipFrom: string): this {
    return this.setShipfrom(shipFrom);
  }

  setParcel(parcel: string): this {
    this.parcel = parcel;
    return this;
  }

  setOrderId(_orderId: string): this {
    return this;
  }

  setTimeFrom(_timeFrom: string): this {
    return this;
  }

  setTimeTo(_timeTo: string): this {
    return this;
  }
}
