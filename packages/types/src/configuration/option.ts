import { AdvancedFinishingPreset } from "./advanced-attribute";

export interface Option {
  label: string;
  value: string;
  customFormat: boolean;
  hidden: boolean;
  formatWidth?: number | null;
  formatHeight?: number | null;
  pages?: number | null;
  cost?: number | null;
  unitsPerSheet?: number | null;
  image?: string;
  color?: string;
  advancedPreset?: AdvancedFinishingPreset;
}
