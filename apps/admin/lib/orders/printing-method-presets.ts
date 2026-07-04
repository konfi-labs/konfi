import { PrintingMethod, type PrintingMethodId } from "@konfi/types";

export const DIGITAL_PRINT_PRESET_METHODS: readonly PrintingMethodId[] = [
  PrintingMethod.DIGITAL,
];

export const BIG_FORMAT_PRESET_METHODS: readonly PrintingMethodId[] = [
  PrintingMethod.LARGE_FORMAT,
  PrintingMethod.ECO_SOLVENT,
  PrintingMethod.UV,
  PrintingMethod.CUTTING,
  PrintingMethod.INSTALLATION,
];
