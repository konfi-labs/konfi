export const CAD_ROLL_WIDTHS = [
  { label: "297 mm", widthMm: 297, baseLongMm: 420 },
  { label: "420 mm", widthMm: 420, baseLongMm: 594 },
  { label: "594 mm", widthMm: 594, baseLongMm: 841 },
  { label: "610 mm", widthMm: 610, baseLongMm: 914 },
  { label: "841 mm", widthMm: 841, baseLongMm: 1189 },
  { label: "914 mm", widthMm: 914, baseLongMm: 1219 },
  { label: "1067 mm", widthMm: 1067, baseLongMm: 1500 },
] as const;

export const CAD_TOLERANCE_MM = 10;
export const DIGITAL_PRINT_TOLERANCE_MM = 5;

export const DIGITAL_PRINT_FORMATS = [
  { label: "A3", widthMm: 297, heightMm: 420 },
] as const;

export const CAD_PRINT_CALCULATOR_STORAGE_KEY =
  "konfi.admin.cadPrintCalculator.v2";
export const CAD_PRINT_CALCULATOR_LEGACY_STORAGE_KEYS = [
  "konfi.admin.cadPrintCalculator.v1",
] as const;
const CAD_PRINT_CALCULATOR_STORAGE_VERSION = 2;

export type CadRollWidthLabel = (typeof CAD_ROLL_WIDTHS)[number]["label"];
export type DigitalPrintFormatLabel =
  (typeof DIGITAL_PRINT_FORMATS)[number]["label"];
export type CadPrintMethod = "cad" | "digital";
export type CadMatchedSizeLabel = CadRollWidthLabel | DigitalPrintFormatLabel;

export type CadPageResult = {
  filename: string;
  pageNumber: number;
  widthMm: number;
  heightMm: number;
  shortSideMm: number;
  longSideMm: number;
  printMethod: CadPrintMethod | null;
  matchedSize: CadMatchedSizeLabel | null;
  ratio: number | null;
};

export type CadSizeTotal = {
  printMethod: CadPrintMethod | null;
  matchedSize: CadMatchedSizeLabel | null;
  pageCount: number;
  totalRatio: number | null;
};

type CadPrintCalculatorStorageState = {
  results: CadPageResult[];
  version: typeof CAD_PRINT_CALCULATOR_STORAGE_VERSION;
};

export function findMatchingCadRollWidth(
  shortSideMm: number,
): (typeof CAD_ROLL_WIDTHS)[number] | null {
  for (const roll of CAD_ROLL_WIDTHS) {
    if (shortSideMm <= roll.widthMm + CAD_TOLERANCE_MM) {
      return roll;
    }
  }
  return null;
}

export function findMatchingDigitalPrintFormat(
  widthMm: number,
  heightMm: number,
): (typeof DIGITAL_PRINT_FORMATS)[number] | null {
  const shortSideMm = Math.min(widthMm, heightMm);
  const longSideMm = Math.max(widthMm, heightMm);

  for (const format of DIGITAL_PRINT_FORMATS) {
    if (
      Math.abs(shortSideMm - format.widthMm) <= DIGITAL_PRINT_TOLERANCE_MM &&
      Math.abs(longSideMm - format.heightMm) <= DIGITAL_PRINT_TOLERANCE_MM
    ) {
      return format;
    }
  }

  return null;
}

export function serializeCadPrintCalculatorResults(
  results: CadPageResult[],
): string {
  const state: CadPrintCalculatorStorageState = {
    results,
    version: CAD_PRINT_CALCULATOR_STORAGE_VERSION,
  };

  return JSON.stringify(state);
}

export function parseCadPrintCalculatorStoredResults(
  rawValue: string | null,
): CadPageResult[] {
  if (rawValue === null) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(rawValue);

    if (!isStorageState(parsed)) {
      return [];
    }

    return parsed.results;
  } catch {
    return [];
  }
}

function isStorageState(
  value: unknown,
): value is CadPrintCalculatorStorageState {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.version === CAD_PRINT_CALCULATOR_STORAGE_VERSION &&
    Array.isArray(value.results) &&
    value.results.every(isCadPageResult)
  );
}

function isCadPageResult(value: unknown): value is CadPageResult {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.filename === "string" &&
    Number.isInteger(value.pageNumber) &&
    isFiniteNumber(value.widthMm) &&
    isFiniteNumber(value.heightMm) &&
    isFiniteNumber(value.shortSideMm) &&
    isFiniteNumber(value.longSideMm) &&
    isCadPrintMethod(value.printMethod) &&
    isCadMatchedSize(value.matchedSize) &&
    (value.ratio === null || isFiniteNumber(value.ratio))
  );
}

function isCadPrintMethod(value: unknown): value is CadPrintMethod | null {
  return value === null || value === "cad" || value === "digital";
}

function isCadMatchedSize(value: unknown): value is CadMatchedSizeLabel | null {
  if (value === null) {
    return true;
  }

  return (
    CAD_ROLL_WIDTHS.some((roll) => roll.label === value) ||
    DIGITAL_PRINT_FORMATS.some((format) => format.label === value)
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getCadSizeTotals(results: CadPageResult[]): CadSizeTotal[] {
  const totalsBySize = new Map<
    string,
    {
      printMethod: CadPrintMethod;
      matchedSize: CadMatchedSizeLabel;
      pageCount: number;
      totalRatio: number | null;
    }
  >();
  let unmatchedPageCount = 0;

  for (const row of results) {
    if (row.printMethod === null || row.matchedSize === null) {
      unmatchedPageCount += 1;
      continue;
    }

    const key = `${row.printMethod}:${row.matchedSize}`;
    const total = totalsBySize.get(key) ?? {
      printMethod: row.printMethod,
      matchedSize: row.matchedSize,
      pageCount: 0,
      totalRatio: row.printMethod === "cad" ? 0 : null,
    };

    total.pageCount += 1;

    if (row.printMethod === "cad" && row.ratio !== null) {
      total.totalRatio = (total.totalRatio ?? 0) + row.ratio;
    }

    totalsBySize.set(key, total);
  }

  const digitalTotals = DIGITAL_PRINT_FORMATS.flatMap<CadSizeTotal>(
    (format) => {
      const total = totalsBySize.get(`digital:${format.label}`);

      if (total === undefined) {
        return [];
      }

      return [
        {
          printMethod: "digital",
          matchedSize: format.label,
          pageCount: total.pageCount,
          totalRatio: null,
        },
      ];
    },
  );

  const cadTotals = CAD_ROLL_WIDTHS.flatMap<CadSizeTotal>((roll) => {
    const total = totalsBySize.get(`cad:${roll.label}`);

    if (total === undefined) {
      return [];
    }

    return [
      {
        printMethod: "cad",
        matchedSize: roll.label,
        pageCount: total.pageCount,
        totalRatio:
          total.totalRatio !== null
            ? Math.round(total.totalRatio * 100) / 100
            : null,
      },
    ];
  });

  const totals = [...digitalTotals, ...cadTotals];

  if (unmatchedPageCount > 0) {
    totals.push({
      printMethod: null,
      matchedSize: null,
      pageCount: unmatchedPageCount,
      totalRatio: null,
    });
  }

  return totals;
}
