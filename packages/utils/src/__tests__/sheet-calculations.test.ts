import {
  calculateSheetsNeeded,
  calculateSheetsNeededForOrder,
  calculateSheetStockRequirements,
  calculateUnitsPerSheet,
  extractPaperAndFormat,
  type SheetCalculationParams,
  type StockCalculationResult,
} from "../sheet-calculations";

describe("calculateUnitsPerSheet", () => {
  it("should calculate units per sheet without rotation", () => {
    const params: SheetCalculationParams = {
      sheetWidth: 1000,
      sheetHeight: 700,
      itemWidth: 100,
      itemHeight: 70,
      margin: 0,
      bleed: 0,
      allowRotation: false,
    };

    const result = calculateUnitsPerSheet(params);
    expect(result).toBe(100); // 10 columns * 10 rows
  });

  it("should calculate units per sheet with margins and bleeds", () => {
    const params: SheetCalculationParams = {
      sheetWidth: 1000,
      sheetHeight: 700,
      itemWidth: 100,
      itemHeight: 70,
      margin: 10,
      bleed: 5,
    };

    const result = calculateUnitsPerSheet(params);
    // Item with bleed: 110x80, with margin: 120x90
    // Columns: floor((1000 + 10) / 120) = 8
    // Rows: floor((700 + 10) / 90) = 7
    expect(result).toBe(56); // 8 * 7
  });

  it("should use default values for optional parameters", () => {
    const params: SheetCalculationParams = {
      sheetWidth: 1000,
      sheetHeight: 700,
      itemWidth: 100,
      itemHeight: 70,
    };

    const result = calculateUnitsPerSheet(params);
    // Default margin: 0, bleed: 3, allowRotation: true
    // Item with bleed: 106x76
    // Normal: floor(1000/106) * floor(700/76) = 9 * 9 = 81
    // Rotated: floor(1000/76) * floor(700/106) = 13 * 6 = 78
    expect(result).toBe(81);
  });

  it("should consider rotation when it provides better results", () => {
    const params: SheetCalculationParams = {
      sheetWidth: 1000,
      sheetHeight: 500,
      itemWidth: 200,
      itemHeight: 80,
      margin: 0,
      bleed: 0,
      allowRotation: true,
    };

    const result = calculateUnitsPerSheet(params);
    // Normal: floor(1000/200) * floor(500/80) = 5 * 6 = 30
    // Rotated: floor(1000/80) * floor(500/200) = 12 * 2 = 24
    expect(result).toBe(30);
  });

  it("should prefer rotation when it gives more units", () => {
    const params: SheetCalculationParams = {
      sheetWidth: 500,
      sheetHeight: 1000,
      itemWidth: 200,
      itemHeight: 80,
      margin: 0,
      bleed: 0,
      allowRotation: true,
    };

    const result = calculateUnitsPerSheet(params);
    // Normal: floor(500/200) * floor(1000/80) = 2 * 12 = 24
    // Rotated: floor(500/80) * floor(1000/200) = 6 * 5 = 30
    expect(result).toBe(30);
  });

  it("should handle edge cases with zero dimensions", () => {
    const params: SheetCalculationParams = {
      sheetWidth: 0,
      sheetHeight: 700,
      itemWidth: 100,
      itemHeight: 70,
    };

    const result = calculateUnitsPerSheet(params);
    expect(result).toBe(0);
  });

  it("should handle items larger than sheet", () => {
    const params: SheetCalculationParams = {
      sheetWidth: 100,
      sheetHeight: 70,
      itemWidth: 200,
      itemHeight: 140,
      margin: 0,
      bleed: 0,
    };

    const result = calculateUnitsPerSheet(params);
    expect(result).toBe(0);
  });
});

describe("calculateSheetsNeeded", () => {
  it("should calculate sheets needed for exact fit", () => {
    const result = calculateSheetsNeeded(100, 10, 0);
    expect(result).toBe(10);
  });

  it("should round up for partial sheets", () => {
    const result = calculateSheetsNeeded(105, 10, 0);
    expect(result).toBe(11);
  });

  it("should add wastage percentage", () => {
    const result = calculateSheetsNeeded(100, 10, 10);
    expect(result).toBe(11); // 10 base + 1 waste (10% of 10)
  });

  it("should handle zero units per sheet", () => {
    const result = calculateSheetsNeeded(100, 0, 5);
    expect(result).toBe(0);
  });

  it("should handle zero quantity", () => {
    const result = calculateSheetsNeeded(0, 10, 5);
    expect(result).toBe(0);
  });

  it("should round up wastage calculation", () => {
    const result = calculateSheetsNeeded(15, 10, 5);
    // Base sheets: ceil(15/10) = 2
    // Waste sheets: ceil(2 * 0.05) = 1
    expect(result).toBe(3);
  });
});

describe("calculateSheetStockRequirements", () => {
  it("should return complete calculation result", () => {
    const result = calculateSheetStockRequirements(100, 1000, 700, 90, 60, {
      margin: 5,
      bleed: 2,
      wastagePercent: 10,
      allowRotation: false,
    });

    expect(result).toEqual<StockCalculationResult>({
      unitsPerSheet: expect.any(Number),
      sheetsNeeded: expect.any(Number),
      wastagePercent: 10,
      sheetDimensions: { width: 1000, height: 700 },
      itemDimensions: { width: 90, height: 60 },
      totalUnits: 100,
    });
  });

  it("should use default options when not provided", () => {
    const result = calculateSheetStockRequirements(50, 1000, 700, 100, 70);

    expect(result.wastagePercent).toBe(5);
    expect(result.sheetDimensions).toEqual({ width: 1000, height: 700 });
    expect(result.itemDimensions).toEqual({ width: 100, height: 70 });
    expect(result.totalUnits).toBe(50);
  });

  it("should calculate correct units per sheet and sheets needed", () => {
    const result = calculateSheetStockRequirements(20, 200, 200, 50, 50, {
      margin: 0,
      bleed: 0,
      wastagePercent: 0,
      allowRotation: false,
    });

    expect(result.unitsPerSheet).toBe(16); // 4x4 grid
    expect(result.sheetsNeeded).toBe(2); // ceil(20/16) = 2
  });
});

describe("calculateSheetsNeededForOrder", () => {
  const mockPaperAttribute = {
    id: "paper",
    trackStock: true,
    calculateStockFromSheet: {
      enabled: true,
      sheetWidth: 1000,
      sheetHeight: 700,
      margin: 5,
      bleed: 3,
    },
  };

  const mockFormatOption = {
    formatWidth: 100,
    formatHeight: 70,
  };

  it("should calculate sheets needed with valid parameters", () => {
    const result = calculateSheetsNeededForOrder(
      50,
      mockFormatOption,
      mockPaperAttribute,
      5,
    );

    expect(result).toBeGreaterThan(0);
    expect(typeof result).toBe("number");
  });

  it("should return quantity when sheet calculation is not enabled", () => {
    const disabledPaper = {
      ...mockPaperAttribute,
      calculateStockFromSheet: {
        ...mockPaperAttribute.calculateStockFromSheet,
        enabled: false,
      },
    };

    const result = calculateSheetsNeededForOrder(
      50,
      mockFormatOption,
      disabledPaper,
      5,
    );

    expect(result).toBe(50);
  });

  it("should return quantity when paper attribute is null", () => {
    const result = calculateSheetsNeededForOrder(50, mockFormatOption, null, 5);

    expect(result).toBe(50);
  });

  it("should return quantity when format option is null", () => {
    const result = calculateSheetsNeededForOrder(
      50,
      null,
      mockPaperAttribute,
      5,
    );

    expect(result).toBe(50);
  });

  it("should return quantity when format dimensions are missing", () => {
    const incompleteFormat = {
      formatWidth: 100,
      formatHeight: null,
    };

    const result = calculateSheetsNeededForOrder(
      50,
      incompleteFormat,
      mockPaperAttribute,
      5,
    );

    expect(result).toBe(50);
  });

  it("should use default wastage when not provided", () => {
    const result1 = calculateSheetsNeededForOrder(
      50,
      mockFormatOption,
      mockPaperAttribute,
    );

    const result2 = calculateSheetsNeededForOrder(
      50,
      mockFormatOption,
      mockPaperAttribute,
      5,
    );

    expect(result1).toBe(result2);
  });

  it("should handle calculation errors gracefully", () => {
    const invalidPaper = {
      ...mockPaperAttribute,
      calculateStockFromSheet: {
        ...mockPaperAttribute.calculateStockFromSheet,
        sheetWidth: 0,
        sheetHeight: 0,
      },
    };

    const result = calculateSheetsNeededForOrder(
      50,
      mockFormatOption,
      invalidPaper,
      5,
    );

    expect(result).toBe(50); // Should fallback to original quantity
  });
});

describe("extractPaperAndFormat", () => {
  const mockAttributes = [
    {
      id: "paper",
      trackStock: true,
      calculateStockFromSheet: {
        enabled: true,
        sheetWidth: 1000,
        sheetHeight: 700,
      },
      format: false,
      options: [
        { value: "glossy", formatWidth: null, formatHeight: null },
        { value: "matte", formatWidth: null, formatHeight: null },
      ],
    },
    {
      id: "format",
      trackStock: false,
      format: true,
      options: [
        { value: "A4", formatWidth: 210, formatHeight: 297 },
        { value: "A3", formatWidth: 297, formatHeight: 420 },
      ],
    },
    {
      id: "color",
      trackStock: false,
      format: false,
      options: [
        { value: "red", formatWidth: null, formatHeight: null },
        { value: "blue", formatWidth: null, formatHeight: null },
      ],
    },
  ];

  it("should extract paper attribute and format option correctly", () => {
    const selectedOptions = {
      paper: "glossy",
      format: "A4",
      color: "red",
    };

    const result = extractPaperAndFormat(mockAttributes, selectedOptions);

    expect(result.paperAttribute).toEqual(mockAttributes[0]);
    expect(result.formatOption).toEqual(mockAttributes[1].options[0]);
  });

  it("should return null when no paper attribute is found", () => {
    const attributesWithoutPaper = mockAttributes.filter(
      (attr) => attr.id !== "paper",
    );
    const selectedOptions = {
      format: "A4",
      color: "red",
    };

    const result = extractPaperAndFormat(
      attributesWithoutPaper,
      selectedOptions,
    );

    expect(result.paperAttribute).toBeNull();
    expect(result.formatOption).toEqual(mockAttributes[1].options[0]);
  });

  it("should return null when no format attribute is found", () => {
    const attributesWithoutFormat = mockAttributes.filter(
      (attr) => attr.id !== "format",
    );
    const selectedOptions = {
      paper: "glossy",
      color: "red",
    };

    const result = extractPaperAndFormat(
      attributesWithoutFormat,
      selectedOptions,
    );

    expect(result.paperAttribute).toEqual(mockAttributes[0]);
    expect(result.formatOption).toBeNull();
  });

  it("should return null for both when selectedOptions is null", () => {
    const result = extractPaperAndFormat(mockAttributes, null);

    expect(result.paperAttribute).toBeNull();
    expect(result.formatOption).toBeNull();
  });

  it("should return null when selected values don't match", () => {
    const selectedOptions = {
      paper: "nonexistent",
      format: "nonexistent",
    };

    const result = extractPaperAndFormat(mockAttributes, selectedOptions);

    expect(result.paperAttribute).toBeNull();
    expect(result.formatOption).toBeNull();
  });

  it("should handle empty attributes array", () => {
    const selectedOptions = {
      paper: "glossy",
      format: "A4",
    };

    const result = extractPaperAndFormat([], selectedOptions);

    expect(result.paperAttribute).toBeNull();
    expect(result.formatOption).toBeNull();
  });

  it("should find paper attribute even without calculateStockFromSheet enabled", () => {
    const modifiedAttributes = [
      {
        ...mockAttributes[0],
        calculateStockFromSheet: {
          enabled: false,
          sheetWidth: 1000,
          sheetHeight: 700,
        },
      },
      ...mockAttributes.slice(1),
    ];

    const selectedOptions = {
      paper: "glossy",
      format: "A4",
    };

    const result = extractPaperAndFormat(modifiedAttributes, selectedOptions);

    expect(result.paperAttribute).toBeNull(); // Should be null because enabled: false
    expect(result.formatOption).toEqual(mockAttributes[1].options[0]);
  });

  it("should handle numeric selected values", () => {
    const selectedOptions = {
      paper: "glossy",
      format: "A4",
      quantity: 100, // numeric value
    };

    const result = extractPaperAndFormat(mockAttributes, selectedOptions);

    expect(result.paperAttribute).toEqual(mockAttributes[0]);
    expect(result.formatOption).toEqual(mockAttributes[1].options[0]);
  });
});
