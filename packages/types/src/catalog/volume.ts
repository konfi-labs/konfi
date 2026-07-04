import type { PrintingMethodId } from "../configuration/printing-methods";

export type Volume = {
  value: number;
  deliveryTime: number;
  markup?: number;
  printType?: PrintingMethodId;
};
