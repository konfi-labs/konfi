import { AbstractMethod } from "./abstract-method";
import { RequestBody } from "../types/interfaces";

export class InpostParcelMachines extends AbstractMethod {
  private city?: string;

  getName(): string {
    return "inpost_parcel_machines";
  }

  getRequestData(): RequestBody {
    return {
      city: this.city,
    };
  }

  setCity(city: string): this {
    this.city = city;
    return this;
  }
}
