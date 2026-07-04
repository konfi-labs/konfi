"use client";

import { useT } from "@/i18n/client";
import {
  Badge,
  Box,
  Button,
  Card,
  Code,
  HStack,
  Separator,
  Spinner,
  Stack,
  Table,
  Text,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CAD_PRINT_CALCULATOR_LEGACY_STORAGE_KEYS,
  CAD_PRINT_CALCULATOR_STORAGE_KEY,
  type CadPageResult,
  type CadSizeTotal,
  findMatchingDigitalPrintFormat,
  findMatchingCadRollWidth,
  getCadSizeTotals,
  parseCadPrintCalculatorStoredResults,
  serializeCadPrintCalculatorResults,
} from "./cad-print-calculator-utils";

type PdfJsModule = typeof import("pdfjs-dist");

type BrowserPdfPage = {
  cleanup: () => void;
  getViewport: (options: { scale: number }) => {
    height: number;
    width: number;
  };
};

type BrowserPdfDocument = {
  destroy: () => Promise<void>;
  getPage: (pageNumber: number) => Promise<unknown>;
  numPages: number;
};

const PDF_POINTS_PER_INCH = 72;
const MM_PER_INCH = 25.4;

let pdfWorkerConfigured = false;

function roundMm(value: number): number {
  return Math.round(value * 10) / 10;
}

function pointsToMm(points: number): number {
  return roundMm((points / PDF_POINTS_PER_INCH) * MM_PER_INCH);
}

async function loadPdfJs(): Promise<PdfJsModule> {
  const pdfjsLib = await import("pdfjs-dist");

  if (!pdfWorkerConfigured) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    pdfWorkerConfigured = true;
  }

  return pdfjsLib;
}

async function readPdfPageResults(file: File): Promise<CadPageResult[]> {
  const pdfjsLib = await loadPdfJs();
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
  });
  const pdf = (await loadingTask.promise) as BrowserPdfDocument;
  const results: CadPageResult[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = (await pdf.getPage(pageNumber)) as unknown as BrowserPdfPage;

      try {
        const viewport = page.getViewport({ scale: 1 });
        const widthMm = pointsToMm(viewport.width);
        const heightMm = pointsToMm(viewport.height);
        const shortSideMm = Math.min(widthMm, heightMm);
        const longSideMm = Math.max(widthMm, heightMm);
        const digitalFormat = findMatchingDigitalPrintFormat(widthMm, heightMm);
        const matchedCadSize =
          digitalFormat === null ? findMatchingCadRollWidth(shortSideMm) : null;

        results.push({
          filename: file.name,
          pageNumber,
          widthMm,
          heightMm,
          shortSideMm,
          longSideMm,
          printMethod:
            digitalFormat !== null
              ? "digital"
              : matchedCadSize !== null
                ? "cad"
                : null,
          matchedSize: digitalFormat?.label ?? matchedCadSize?.label ?? null,
          ratio:
            matchedCadSize !== null
              ? Math.round((longSideMm / matchedCadSize.baseLongMm) * 100) / 100
              : null,
        });
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await pdf.destroy();
  }

  return results;
}

export function CadPrintCalculator() {
  const { t } = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<CadPageResult[]>([]);
  const [hasLoadedStoredResults, setHasLoadedStoredResults] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const totals = useMemo(() => getCadSizeTotals(results), [results]);

  useEffect(() => {
    try {
      setResults(
        parseCadPrintCalculatorStoredResults(
          window.localStorage.getItem(CAD_PRINT_CALCULATOR_STORAGE_KEY),
        ),
      );
    } catch {
      setResults([]);
    } finally {
      setHasLoadedStoredResults(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedStoredResults) {
      return;
    }

    try {
      if (results.length === 0) {
        window.localStorage.removeItem(CAD_PRINT_CALCULATOR_STORAGE_KEY);
        return;
      }

      window.localStorage.setItem(
        CAD_PRINT_CALCULATOR_STORAGE_KEY,
        serializeCadPrintCalculatorResults(results),
      );
    } catch {
      // Browser storage can be unavailable or full; the calculator remains usable.
    }
  }, [hasLoadedStoredResults, results]);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const pdfFiles = Array.from(files).filter(
        (f) =>
          f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
      );

      if (pdfFiles.length === 0) {
        setIsLoading(false);
        setError(
          t("calculators.cadPrint.errors.noPdfFilesSelected", {
            defaultValue: "No PDF files selected.",
          }),
        );
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const allResults: CadPageResult[] = [];

        for (const file of pdfFiles) {
          const pageResults = await readPdfPageResults(file);
          allResults.push(...pageResults);
        }

        setResults((currentResults) => [...currentResults, ...allResults]);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    },
    [t],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        handleFiles(e.target.files);
      }
    },
    [handleFiles],
  );

  const handleReset = useCallback(() => {
    setResults([]);
    setError(null);
    try {
      window.localStorage.removeItem(CAD_PRINT_CALCULATOR_STORAGE_KEY);
      for (const storageKey of CAD_PRINT_CALCULATOR_LEGACY_STORAGE_KEYS) {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      // Ignore storage failures because visible state has already been cleared.
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const renderPrintCategory = useCallback(
    (
      row: Pick<CadPageResult | CadSizeTotal, "printMethod" | "matchedSize">,
    ) => {
      if (row.printMethod === "digital" && row.matchedSize !== null) {
        return (
          <HStack gap={2} wrap="wrap">
            <Badge colorPalette="blue">
              {t("calculators.cadPrint.results.digitalPrint", {
                defaultValue: "Digital print",
              })}
            </Badge>
            <Badge colorPalette="gray">{row.matchedSize}</Badge>
          </HStack>
        );
      }

      if (row.printMethod === "cad" && row.matchedSize !== null) {
        return (
          <HStack gap={2} wrap="wrap">
            <Badge colorPalette="primary">
              {t("calculators.cadPrint.results.cadPrint", {
                defaultValue: "CAD print",
              })}
            </Badge>
            <Badge colorPalette="gray">{row.matchedSize}</Badge>
          </HStack>
        );
      }

      return (
        <Badge colorPalette="gray">
          {t("calculators.cadPrint.results.noMatch", {
            defaultValue: "No match",
          })}
        </Badge>
      );
    },
    [t],
  );

  return (
    <Stack gap={6}>
      <Box
        asChild
        border="2px dashed"
        borderColor="border.muted"
        borderRadius="3xl"
        p={8}
        textAlign="center"
        cursor="pointer"
        _hover={{ borderColor: "border.emphasized" }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <label htmlFor="cad-print-calculator-files">
          <input
            id="cad-print-calculator-files"
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            style={{ display: "none" }}
            onChange={handleInputChange}
          />
          <MaterialSymbol style={{ fontSize: 40, marginBottom: 8 }}>
            upload_file
          </MaterialSymbol>
          <Text fontWeight="medium">
            {t("calculators.cadPrint.dropzone.title", {
              defaultValue: "Drop PDF files here or click to select",
            })}
          </Text>
          <Text fontSize="sm" color="fg.muted" mt={1}>
            {t("calculators.cadPrint.dropzone.hint", {
              defaultValue:
                "Supported formats: PDF. You can add more PDFs later; totals stay combined.",
            })}
          </Text>
        </label>
      </Box>

      {isLoading && (
        <HStack justify="center" gap={3}>
          <Spinner size="sm" />
          <Text>
            {t("calculators.cadPrint.reading", {
              defaultValue: "Reading PDF dimensions…",
            })}
          </Text>
        </HStack>
      )}

      {error && (
        <Card.Root colorPalette="red">
          <Card.Body>
            <Text color="fg.error">{error}</Text>
          </Card.Body>
        </Card.Root>
      )}

      {results.length > 0 && (
        <Stack gap={4}>
          <HStack justify="space-between" align="center">
            <Text fontWeight="medium">
              {t("calculators.cadPrint.results.title", {
                defaultValue: "Results",
              })}
            </Text>
            <Button variant="ghost" size="sm" onClick={handleReset}>
              {t("calculators.cadPrint.reset", { defaultValue: "Reset" })}
            </Button>
          </HStack>

          <Box
            borderWidth="1px"
            borderColor="border.muted"
            borderRadius="3xl"
            overflow="hidden"
          >
            <Box overflowX="auto">
              <Table.Root minW="420px" size="sm">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader>
                      {t("calculators.cadPrint.results.category", {
                        defaultValue: "Print category",
                      })}
                    </Table.ColumnHeader>
                    <Table.ColumnHeader>
                      {t("calculators.cadPrint.results.pages", {
                        defaultValue: "Pages",
                      })}
                    </Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="end">
                      {t("calculators.cadPrint.results.totalCadRatio", {
                        defaultValue: "Total CAD ratio",
                      })}
                    </Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {(() => {
                    const locale =
                      typeof navigator !== "undefined"
                        ? navigator.language
                        : undefined;
                    const ratioFormatter = new Intl.NumberFormat(locale, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    });

                    return totals.map((total) => (
                      <Table.Row
                        key={`${total.printMethod ?? "none"}:${
                          total.matchedSize ?? "unmatched"
                        }`}
                      >
                        <Table.Cell>{renderPrintCategory(total)}</Table.Cell>
                        <Table.Cell>{total.pageCount}</Table.Cell>
                        <Table.Cell textAlign="end">
                          {total.totalRatio !== null ? (
                            <Text fontWeight="semibold">
                              {ratioFormatter.format(total.totalRatio)}
                            </Text>
                          ) : (
                            <Text color="fg.muted">—</Text>
                          )}
                        </Table.Cell>
                      </Table.Row>
                    ));
                  })()}
                </Table.Body>
              </Table.Root>
            </Box>
          </Box>

          <Box
            borderWidth="1px"
            borderColor="border.muted"
            borderRadius="3xl"
            overflow="hidden"
          >
            <Box overflowX="auto">
              <Table.Root minW="720px">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader>
                      {t("calculators.cadPrint.results.file", {
                        defaultValue: "File",
                      })}
                    </Table.ColumnHeader>
                    <Table.ColumnHeader>
                      {t("calculators.cadPrint.results.page", {
                        defaultValue: "Page",
                      })}
                    </Table.ColumnHeader>
                    <Table.ColumnHeader>
                      {t("calculators.cadPrint.results.dimensions", {
                        defaultValue: "Dimensions (mm)",
                      })}
                    </Table.ColumnHeader>
                    <Table.ColumnHeader>
                      {t("calculators.cadPrint.results.category", {
                        defaultValue: "Print category",
                      })}
                    </Table.ColumnHeader>
                    <Table.ColumnHeader>
                      {t("calculators.cadPrint.results.cadRatio", {
                        defaultValue: "CAD ratio",
                      })}
                    </Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {(() => {
                    const locale =
                      typeof navigator !== "undefined"
                        ? navigator.language
                        : undefined;
                    const dimensionFormatter = new Intl.NumberFormat(locale, {
                      maximumFractionDigits: 2,
                    });
                    const ratioFormatter = new Intl.NumberFormat(locale, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    });

                    return results.map((row, index) => (
                      <Table.Row
                        key={`${row.filename}:${row.pageNumber}:${index}`}
                      >
                        <Table.Cell>
                          <Text fontSize="sm" truncate maxW="200px">
                            {row.filename}
                          </Text>
                        </Table.Cell>
                        <Table.Cell>{row.pageNumber}</Table.Cell>
                        <Table.Cell>
                          <Code fontSize="sm">
                            {dimensionFormatter.format(row.widthMm)} ×{" "}
                            {dimensionFormatter.format(row.heightMm)}
                          </Code>
                        </Table.Cell>
                        <Table.Cell>{renderPrintCategory(row)}</Table.Cell>
                        <Table.Cell>
                          {row.ratio !== null ? (
                            <Text fontWeight="semibold">
                              {ratioFormatter.format(row.ratio)}
                            </Text>
                          ) : (
                            <Text color="fg.muted">—</Text>
                          )}
                        </Table.Cell>
                      </Table.Row>
                    ));
                  })()}
                </Table.Body>
              </Table.Root>
            </Box>
          </Box>

          <Separator />

          <Box>
            <Text fontSize="sm" color="fg.muted">
              {t("calculators.cadPrint.results.explanation", {
                defaultValue:
                  "Only 297 x 420 mm or 420 x 297 mm pages are counted as digital print. CAD ratio = file long side ÷ base sheet long side for the selected roll width.",
              })}
            </Text>
          </Box>
        </Stack>
      )}
    </Stack>
  );
}
