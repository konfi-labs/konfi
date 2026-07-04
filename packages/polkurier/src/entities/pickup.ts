import { BaseEntity } from "./base-entity";

export class Pickup extends BaseEntity {
  private date?: string;
  private timeFrom?: string;
  private timeTo?: string;
  private noCourierOrder?: boolean;
  private multiPickup?: boolean;

  setDate(date: string): this {
    this.date = date;
    return this;
  }

  setTimeFrom(timeFrom: string): this {
    this.timeFrom = timeFrom;
    return this;
  }

  setTimeTo(timeTo: string): this {
    this.timeTo = timeTo;
    return this;
  }

  setNoCourierOrder(noCourierOrder: boolean): this {
    this.noCourierOrder = noCourierOrder;
    return this;
  }

  setMultiPickup(multiPickup: boolean): this {
    this.multiPickup = multiPickup;
    return this;
  }

  toArray(): Record<string, unknown> {
    const payload: Record<string, unknown> = {};

    if (this.date !== undefined) {
      payload.pickupdate = this.date;
    }
    if (this.timeFrom !== undefined) {
      payload.pickuptimefrom = this.timeFrom;
    }
    if (this.timeTo !== undefined) {
      payload.pickuptimeto = this.timeTo;
    }
    if (this.noCourierOrder !== undefined) {
      payload.nocourierorder = this.noCourierOrder;
    }

    return payload;
  }
}
