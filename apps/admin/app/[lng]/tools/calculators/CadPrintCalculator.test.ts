import { describe, expect, it } from "vitest";
import {
  type CadMatchedSizeLabel,
  type CadPrintMethod,
  findMatchingDigitalPrintFormat,
  findMatchingCadRollWidth,
  getCadSizeTotals,
  parseCadPrintCalculatorStoredResults,
  serializeCadPrintCalculatorResults,
} from "./cad-print-calculator-utils";

describe("findMatchingCadRollWidth", () => {
  it.each([
    [210, "297 mm"],
    [297, "297 mm"],
    [420, "420 mm"],
    [500, "594 mm"],
    [610, "610 mm"],
    [841, "841 mm"],
    [914, "914 mm"],
    [1067, "1067 mm"],
  ])("matches %dmm short side to %s roll", (shortSideMm, expectedLabel) => {
    expect(findMatchingCadRollWidth(shortSideMm)?.label).toBe(expectedLabel);
  });

  it("does not match dimensions wider than the largest roll", () => {
    expect(findMatchingCadRollWidth(1200)).toBeNull();
  });
});

describe("findMatchingDigitalPrintFormat", () => {
  it.each([
    [297, 420, "A3"],
    [420, 297, "A3"],
  ])(
    "matches %dx%dmm to digital print format %s",
    (widthMm, heightMm, expectedLabel) => {
      expect(findMatchingDigitalPrintFormat(widthMm, heightMm)?.label).toBe(
        expectedLabel,
      );
    },
  );

  it.each([
    [210, 297],
    [297, 210],
    [297, 500],
    [420, 594],
    [420, 1000],
  ])("does not classify %dx%dmm as digital print", (widthMm, heightMm) => {
    expect(findMatchingDigitalPrintFormat(widthMm, heightMm)).toBeNull();
  });

  it("keeps A4 dimensions in the 297mm CAD bucket", () => {
    expect(findMatchingCadRollWidth(210)?.label).toBe("297 mm");
  });

  it("keeps 420mm long prints in the 420mm CAD bucket", () => {
    expect(findMatchingDigitalPrintFormat(420, 1000)).toBeNull();
    expect(findMatchingCadRollWidth(420)?.label).toBe("420 mm");
  });
});

describe("getCadSizeTotals", () => {
  it("groups totals by matched standard size", () => {
    expect(
      getCadSizeTotals([
        makeResult({ matchedSize: "A3", printMethod: "digital", ratio: null }),
        makeResult({ matchedSize: "297 mm", printMethod: "cad", ratio: 1 }),
        makeResult({
          matchedSize: "297 mm",
          printMethod: "cad",
          ratio: 2.62,
        }),
        makeResult({
          matchedSize: "594 mm",
          printMethod: "cad",
          ratio: 0.83,
        }),
        makeResult({ matchedSize: "610 mm", printMethod: "cad", ratio: 1 }),
        makeResult({ matchedSize: "914 mm", printMethod: "cad", ratio: 1 }),
      ]),
    ).toEqual([
      {
        printMethod: "digital",
        matchedSize: "A3",
        pageCount: 1,
        totalRatio: null,
      },
      {
        printMethod: "cad",
        matchedSize: "297 mm",
        pageCount: 2,
        totalRatio: 3.62,
      },
      {
        printMethod: "cad",
        matchedSize: "594 mm",
        pageCount: 1,
        totalRatio: 0.83,
      },
      {
        printMethod: "cad",
        matchedSize: "610 mm",
        pageCount: 1,
        totalRatio: 1,
      },
      {
        printMethod: "cad",
        matchedSize: "914 mm",
        pageCount: 1,
        totalRatio: 1,
      },
    ]);
  });
});

describe("calculator storage", () => {
  it("round-trips valid stored results", () => {
    const results = [
      makeResult({ matchedSize: "A3", printMethod: "digital", ratio: null }),
      makeResult({ matchedSize: "594 mm", printMethod: "cad", ratio: 0.83 }),
    ];

    expect(
      parseCadPrintCalculatorStoredResults(
        serializeCadPrintCalculatorResults(results),
      ),
    ).toEqual(results);
  });

  it("ignores invalid stored results", () => {
    expect(parseCadPrintCalculatorStoredResults(null)).toEqual([]);
    expect(parseCadPrintCalculatorStoredResults("{")).toEqual([]);
    expect(
      parseCadPrintCalculatorStoredResults(
        JSON.stringify({
          version: 1,
          results: [
            makeResult({
              matchedSize: "A3",
              printMethod: "digital",
              ratio: null,
            }),
          ],
        }),
      ),
    ).toEqual([]);
    expect(
      parseCadPrintCalculatorStoredResults(
        JSON.stringify({
          version: 2,
          results: [{ matchedSize: "A3" }],
        }),
      ),
    ).toEqual([]);
  });

  it("ignores old stored A4 digital classifications", () => {
    expect(
      parseCadPrintCalculatorStoredResults(
        JSON.stringify({
          version: 2,
          results: [
            {
              ...makeResult({
                matchedSize: "A3",
                printMethod: "digital",
                ratio: null,
              }),
              matchedSize: "A4",
            },
          ],
        }),
      ),
    ).toEqual([]);
  });
});

function makeResult({
  matchedSize,
  printMethod,
  ratio,
}: {
  matchedSize: CadMatchedSizeLabel;
  printMethod: CadPrintMethod;
  ratio: number | null;
}) {
  return {
    filename: "drawing.pdf",
    heightMm: 297,
    longSideMm: 297,
    matchedSize,
    pageNumber: 1,
    printMethod,
    ratio,
    shortSideMm: 210,
    widthMm: 210,
  };
}
