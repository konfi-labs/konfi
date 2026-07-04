import {
  ArrowLeftRight,
  Crop,
  FlipHorizontal2,
  LayoutGrid,
} from "lucide-react";
import { getLucideIconForMaterialSymbol } from "../materialSymbolToLucide";

describe("workspace mode icon mappings", () => {
  test.each([
    ["grid_view", LayoutGrid],
    ["swap_horiz", ArrowLeftRight],
    ["flip_to_back", FlipHorizontal2],
    ["crop", Crop],
  ])("maps %s to the expected Lucide icon", (name, icon) => {
    expect(getLucideIconForMaterialSymbol(name)).toBe(icon);
  });
});
