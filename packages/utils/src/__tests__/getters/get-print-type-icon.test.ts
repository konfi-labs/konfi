import { PrintingMethod } from "@konfi/types";
import { getPrintTypeIcon } from "../../getters/get-print-type-icon";

describe("getPrintTypeIcon", () => {
  it("should return the correct icon for each print type", () => {
    expect(getPrintTypeIcon(PrintingMethod.DIGITAL)).toBe("print");
    expect(getPrintTypeIcon(PrintingMethod.LARGE_FORMAT)).toBe("grain");
    expect(getPrintTypeIcon(PrintingMethod.OFFSET)).toBe("scatter_plot");
    expect(getPrintTypeIcon(PrintingMethod.DTF)).toBe("laundry");
    expect(getPrintTypeIcon(PrintingMethod.LASER)).toBe("stylus_laser_pointer");
    expect(getPrintTypeIcon(PrintingMethod.CUTTING)).toBe("content_cut");
    expect(getPrintTypeIcon(PrintingMethod.UV)).toBe("fluorescent");
  });

  it("should return an empty string for unknown print types", () => {
    expect(getPrintTypeIcon("unknown" as PrintingMethod)).toBe("");
  });
});
