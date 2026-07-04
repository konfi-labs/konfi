import { CourierService } from "./courier-service";

export class RodCourierService extends CourierService {
  private rod: boolean = false;

  setRod(rod: boolean): this {
    this.rod = rod;
    return this;
  }

  toArray(): Record<string, unknown> {
    return {
      ROD: this.rod,
    };
  }
}
