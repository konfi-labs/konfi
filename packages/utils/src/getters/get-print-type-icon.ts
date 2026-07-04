import {
  PrintingMethod,
  type PrintingMethodId,
  type PrintingMethodsSettings,
} from "@konfi/types";
import { getPrintingMethodIcon } from "../printing-methods";

export function getPrintTypeIcon(
  printType: PrintingMethodId,
  settings?: Partial<PrintingMethodsSettings> | null,
) {
  if (settings) {
    return getPrintingMethodIcon(printType, settings);
  }

  switch (printType) {
    case PrintingMethod.DIGITAL:
      return "print";
    case PrintingMethod.LARGE_FORMAT:
      return "grain";
    case PrintingMethod.OFFSET:
      return "scatter_plot";
    case PrintingMethod.DTF:
      return "laundry";
    case PrintingMethod.LASER:
      return "stylus_laser_pointer";
    case PrintingMethod.CUTTING:
      return "content_cut";
    case PrintingMethod.UV:
      return "fluorescent";
    default:
      return "";
  }
}
