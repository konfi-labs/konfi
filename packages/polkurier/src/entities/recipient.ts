import { Address } from "./address";

export class Recipient extends Address {
  private point?: string;

  setPoint(point: string): this {
    this.point = point;
    return this;
  }

  getPoint(): string | undefined {
    return this.point;
  }

  override toArray(): Record<string, unknown> {
    return super.toArray();
  }
}
