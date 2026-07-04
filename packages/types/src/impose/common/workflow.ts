import { Base } from "../../base";
import {
  bindingEdge,
  bleedType,
  duplexMode,
  backPageRotation,
  layoutType,
  paperOrientation,
  sourceSizing,
} from "../../enums";

export interface ImpositionWorkflow extends Omit<
  Base,
  "createdBy" | "createdAt" | "updatedBy" | "updatedAt" | "active"
> {
  sheetSizeName?: string;
  customSheetSizeWidth?: number;
  customSheetSizeHeight?: number;
  sheetOrientation: keyof typeof paperOrientation;
  itemSizeName?: string;
  customItemSizeWidth?: number;
  customItemSizeHeight?: number;
  itemOrientation: keyof typeof paperOrientation;
  numItemsHorizontal?: number;
  numItemsVertical?: number;
  spacingHorizontal?: number[];
  spacingVertical?: number[];
  bleed: number;
  bleedType: keyof typeof bleedType;
  sourceSizing?: keyof typeof sourceSizing;
  cropMarks: boolean;
  layout?: layoutType;
  pagesPerSignature?: number;
  bindingEdge?: bindingEdge;
  duplexMode?: duplexMode;
  backPageRotation?: backPageRotation;
  frontBackAlignment?: boolean;
  mirrorBack?: boolean;
}
