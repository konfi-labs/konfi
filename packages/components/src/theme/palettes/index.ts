import { accentColors } from "./accents";
import { brandColors } from "./brand";
import { neutralColors } from "./neutral";

export const themeColors = {
  ...brandColors,
  ...accentColors,
  ...neutralColors,
} as const;
