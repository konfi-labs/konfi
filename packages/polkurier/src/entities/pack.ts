import { BaseEntity } from "./base-entity";
import { PackType } from "../types/enums";

export class Pack extends BaseEntity {
  private width?: number;
  private height?: number;
  private length?: number;
  private weight?: number;
  private amount?: number;
  private type?: PackType;

  setWidth(width: number): this {
    this.width = width;
    return this;
  }

  setHeight(height: number): this {
    this.height = height;
    return this;
  }

  setLength(length: number): this {
    this.length = length;
    return this;
  }

  setWeight(weight: number): this {
    this.weight = weight;
    return this;
  }

  setAmount(amount: number): this {
    this.amount = amount;
    return this;
  }

  setType(type: PackType): this {
    this.type = type;
    return this;
  }

  toArray(): Record<string, unknown> {
    return {
      width: this.width,
      height: this.height,
      length: this.length,
      weight: this.weight,
      amount: this.amount,
      type: this.type,
    };
  }
}
