import {
  ChartScatter,
  ScanLine,
  Scissors,
  Scroll,
  Sparkles,
} from "lucide-react";
import { AiIcon } from "../AiIcon";
import { getLucideIconForMaterialSymbol } from "../materialSymbolToLucide";

describe("AiIcon", () => {
  test.each(["auto_awesome", "model_training", "network_intelligence"])(
    "maps %s to AiIcon",
    (name) => {
      expect(getLucideIconForMaterialSymbol(name)).toBe(AiIcon);
    },
  );

  test.each([
    ["grain", Scroll],
    ["scatter_plot", ChartScatter],
    ["stylus_laser_pointer", ScanLine],
    ["content_cut", Scissors],
    ["fluorescent", Sparkles],
  ])("maps %s to the expected Lucide icon", (name, icon) => {
    expect(getLucideIconForMaterialSymbol(name)).toBe(icon);
  });
});
