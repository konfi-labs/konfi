"use client";

import { generateAdminText } from "@/actions/ai";
import { useT } from "@/i18n/client";
import {
  buildCombinationAttributes,
  type CombinationAttribute,
} from "@/lib/combination-parsing";
import { diagnoseCombinationFailures } from "@/lib/diagnose-combination-failures";
import {
  getPricedMatrixCombinationIds,
  filterPricedMatrixCombinations,
  filterValidMatrixCombinations,
  generateDependencyAwareCombinations,
  partitionMatrixPricesByVisibility,
} from "@/lib/matrix-combinations";
import { matrixPriceWorkerClient } from "@/lib/matrix-price-worker-client";
import type {
  MatrixGridRow,
  MatrixGridRowsSnapshot,
  MatrixWorksheetBuildInput,
} from "@/lib/matrix-price-worksheets";
import {
  Alert,
  Button,
  Center,
  CloseButton,
  Drawer,
  FileUpload,
  Flex,
  HStack,
  Portal,
  Tabs,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol, toaster } from "@konfi/components";
import { MODELS } from "@konfi/firebase";
import {
  Attribute,
  Option,
  Price,
  PriceTypeEnum,
  Product,
  Volume,
} from "@konfi/types";
import { getCombinations } from "@konfi/utils";
import { useConfiguration } from "context/configuration";
import { isNull, isUndefined } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type CellCopyArgs,
  type CellPasteArgs,
  Column,
  DataGrid,
  FillEvent,
  renderTextEditor,
} from "react-data-grid";
import "react-data-grid/lib/styles.css";
import { useFormContext, useWatch } from "react-hook-form";

type Row = MatrixGridRow;

function getColumns(
  volumes: readonly Omit<Volume, "deliveryTime">[],
  combinationLabel: string,
): readonly Column<Row>[] {
  return [
    {
      key: "combination",
      name: combinationLabel,
      editable: false,
      frozen: true,
      width: 200,
      resizable: true,
    },
    ...volumes.map((volume) => ({
      key: String(volume.value),
      name: String(volume.value),
      renderEditCell: renderTextEditor,
    })),
  ];
}

function rowKeyGetter(row: Row): string {
  return row.combination;
}

type MatrixSheetGridProps = {
  columns: readonly Column<Row>[];
  onCellCopy: (
    args: CellCopyArgs<Row>,
    event: React.ClipboardEvent<HTMLDivElement>,
  ) => void;
  onCellPaste: (
    args: CellPasteArgs<Row>,
    event: React.ClipboardEvent<HTMLDivElement>,
  ) => Row;
  onFill: (event: FillEvent<Row>) => Row;
  onRowsChange: (rows: Row[]) => void;
  rows: Row[];
};

const MatrixSheetGrid = memo(function MatrixSheetGrid({
  columns,
  onCellCopy,
  onCellPaste,
  onFill,
  onRowsChange,
  rows,
}: MatrixSheetGridProps) {
  return (
    <DataGrid
      style={dataGridStyle}
      rows={rows}
      columns={columns}
      onRowsChange={onRowsChange}
      onFill={onFill}
      onCellCopy={onCellCopy}
      onCellPaste={onCellPaste}
      rowKeyGetter={rowKeyGetter}
    />
  );
});

const dataGridStyle: React.CSSProperties = {
  // Fixed viewport-relative height so react-data-grid can virtualize rows.
  // Without a concrete pixel height the grid expands to full content and
  // renders every row, which kills performance for large matrices.
  height: "calc(100vh - 20rem)",
  borderRadius: "1rem",
  // RDG CSS custom properties — using Chakra semantic tokens for dark mode support
  "--rdg-color": "var(--chakra-colors-fg)",
  "--rdg-background-color": "var(--chakra-colors-bg)",
  "--rdg-header-background-color": "var(--chakra-colors-bg-muted)",
  "--rdg-header-draggable-background-color":
    "var(--chakra-colors-bg-emphasized)",
  "--rdg-border-color": "var(--chakra-colors-border)",
  "--rdg-summary-border-color": "var(--chakra-colors-border-emphasized)",
  "--rdg-row-hover-background-color": "var(--chakra-colors-bg-subtle)",
  "--rdg-row-selected-background-color": "var(--chakra-colors-primary-subtle)",
  "--rdg-row-selected-hover-background-color":
    "var(--chakra-colors-primary-muted)",
  "--rdg-selection-color": "var(--chakra-colors-primary-solid)",
  "--rdg-checkbox-focus-color": "var(--chakra-colors-primary-focus-ring)",
  "--rdg-font-size": "13px",
} as React.CSSProperties;

interface HistoryState {
  prices: Row[];
  thresholds: Row[];
  deliveryTimes: Row[];
  active: Row[];
}

const MAX_HISTORY = 50;

function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function areStringMatricesEqual(left: string[][], right: string[][]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((values, index) => {
    const otherValues = right[index];

    return otherValues ? areStringArraysEqual(values, otherValues) : false;
  });
}

function areVolumeListsEqual(
  left: Omit<Volume, "deliveryTime">[],
  right: Omit<Volume, "deliveryTime">[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((volume, index) => volume.value === right[index]?.value);
}

function areOptionLabelPairsEqual(
  left: Record<string, string>,
  right: Record<string, string>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => left[key] === right[key]);
}

function areCombinationAttributesEqual(
  left: CombinationAttribute[] | undefined,
  right: CombinationAttribute[] | undefined,
): boolean {
  const leftAttributes = left ?? [];
  const rightAttributes = right ?? [];

  if (leftAttributes.length !== rightAttributes.length) {
    return false;
  }

  return leftAttributes.every((attribute, index) => {
    const otherAttribute = rightAttributes[index];

    if (
      !otherAttribute ||
      attribute.id !== otherAttribute.id ||
      attribute.calculated !== otherAttribute.calculated ||
      attribute.options.length !== otherAttribute.options.length
    ) {
      return false;
    }

    return attribute.options.every((option, optionIndex) => {
      const otherOption = otherAttribute.options[optionIndex];

      return (
        otherOption?.value === option.value &&
        otherOption.label === option.label &&
        Boolean(otherOption.customFormat) === Boolean(option.customFormat)
      );
    });
  });
}

function areAttributeDependenciesEqual(
  left: Product["attributeDependencies"] | undefined,
  right: Product["attributeDependencies"] | undefined,
): boolean {
  return JSON.stringify(left ?? {}) === JSON.stringify(right ?? {});
}

function arePriceListsEqual(left: Price[], right: Price[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((price, index) => {
    const other = right[index];

    return (
      price.value === other?.value &&
      price.threshold === other?.threshold &&
      price.currency === other?.currency &&
      price.combination?.id === other?.combination?.id &&
      price.combination?.active === other?.combination?.active &&
      price.combination?.customFormat === other?.combination?.customFormat &&
      price.volume?.value === other?.volume?.value &&
      price.volume?.deliveryTime === other?.volume?.deliveryTime
    );
  });
}

function areMatrixWorksheetInputsEqual(
  left: MatrixWorksheetBuildInput,
  right: MatrixWorksheetBuildInput,
): boolean {
  return (
    areAttributeDependenciesEqual(
      left.attributeDependencies,
      right.attributeDependencies,
    ) &&
    areCombinationAttributesEqual(
      left.combinationAttributes,
      right.combinationAttributes,
    ) &&
    areStringArraysEqual(left.combinations, right.combinations) &&
    areOptionLabelPairsEqual(
      left.optionsValueLabelPairs,
      right.optionsValueLabelPairs,
    ) &&
    arePriceListsEqual(left.prices, right.prices) &&
    areVolumeListsEqual(left.volumes, right.volumes)
  );
}

function useGridHistory() {
  const pastRef = useRef<HistoryState[]>([]);
  const futureRef = useRef<HistoryState[]>([]);

  const pushState = useCallback((state: HistoryState) => {
    pastRef.current = [...pastRef.current.slice(-(MAX_HISTORY - 1)), state];
    futureRef.current = [];
  }, []);

  const undo = useCallback((current: HistoryState): HistoryState | null => {
    if (pastRef.current.length === 0) return null;
    const previous = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [...futureRef.current, current];
    return previous;
  }, []);

  const redo = useCallback((current: HistoryState): HistoryState | null => {
    if (futureRef.current.length === 0) return null;
    const next = futureRef.current[futureRef.current.length - 1];
    futureRef.current = futureRef.current.slice(0, -1);
    pastRef.current = [...pastRef.current, current];
    return next;
  }, []);

  return { pushState, undo, redo };
}

const PRICES_WORKSHEET_NAME = "prices";
const THRESHOLDS_WORKSHEET_NAME = "thresholds";
const DELIVERY_TIMES_WORKSHEET_NAME = "deliveryTimes";
const ACTIVE_WORKSHEET_NAME = "active";
const SHEET_NAMES: string[] = [
  "prices",
  "thresholds",
  "deliveryTimes",
  "active",
];
const EMPTY_ATTRIBUTE_IDS: Product["attributes"] = [];
const EMPTY_ATTRIBUTE_OPTIONS: Product["attributeOptions"] = {};
const EMPTY_VOLUMES: Product["volumes"] = [];

type PricesMatrixProps = {
  fieldName?: string;
  drawerTitle?: string;
  editButtonLabel?: string;
  exportButtonLabel?: string;
};

export default function PricesMatrix({
  fieldName = "prices",
  drawerTitle,
  editButtonLabel,
  exportButtonLabel,
}: PricesMatrixProps = {}) {
  const { t } = useT();
  const { setValue } = useFormContext();
  const [arr, setArr] = useState<string[][]>([]);
  const [optionsValueLabelPairs, setOptionsValueLabelPairs] = useState<{
    [x: string]: string;
  }>({});
  const [optionsLabelValuePairs, setOptionsLabelValuePairs] = useState<{
    [x: string]: string;
  }>({});
  const { attributes } = useConfiguration();
  const [currentSheet, setCurrentSheet] = useState<string>(SHEET_NAMES[0]);
  const [processing, setProcessing] = useState(false);
  const bgColor = { base: "gray.100", _dark: "gray.900" };
  const borderColor = { base: "gray.100", _dark: "gray.900" };
  const [
    watchName,
    watchAttributes,
    watchAttributeOptions,
    watchVolumes,
    watchPriceType,
    watchAttributeDependencies,
  ]: [
    Product["name"],
    Product["attributes"],
    Product["attributeOptions"],
    Product["volumes"],
    Product["priceType"],
    Product["attributeDependencies"],
  ] = useWatch({
    name: [
      "name",
      "attributes",
      "attributeOptions",
      "volumes",
      "priceType",
      "attributeDependencies",
    ],
  });
  const watchPrices = useWatch({
    name: fieldName,
  }) as Product["prices"] | undefined;
  const selectedAttributeIds = watchAttributes ?? EMPTY_ATTRIBUTE_IDS;
  const selectedAttributeOptions =
    watchAttributeOptions ?? EMPTY_ATTRIBUTE_OPTIONS;
  const selectedVolumes = watchVolumes ?? EMPTY_VOLUMES;
  const [instructions, setInstructions] = useState<string>("");
  const [tableEditorOpen, setTableEditorOpen] = useState(false);
  const [pricesSheetRows, setPricesSheetRows] = useState<Row[]>([]);
  const [thresholdsSheetRows, setThresholdsSheetRows] = useState<Row[]>([]);
  const [deliveryTimesSheetRows, setDeliveryTimesSheetRows] = useState<Row[]>(
    [],
  );
  const [activeSheetRows, setActiveSheetRows] = useState<Row[]>([]);
  const [sheetsLoading, setSheetsLoading] = useState(false);
  const { pushState, undo, redo } = useGridHistory();
  const currentPricesRef = useRef<Price[]>([]);
  const currentPrices = useMemo(() => {
    const nextPrices = watchPrices ?? [];

    if (arePriceListsEqual(currentPricesRef.current, nextPrices)) {
      return currentPricesRef.current;
    }

    currentPricesRef.current = nextPrices;
    return nextPrices;
  }, [watchPrices]);
  const combinationAttributes = useMemo<CombinationAttribute[]>(() => {
    if (!attributes || selectedAttributeIds.length === 0) {
      return [];
    }

    const calculatedAttributeIds = selectedAttributeIds.filter((attributeId) =>
      attributes.some(
        (attribute) => attribute.id === attributeId && attribute.calculated,
      ),
    );

    return buildCombinationAttributes({
      attributeIds: calculatedAttributeIds,
      attributeOptions: selectedAttributeOptions,
      attributes,
      missingOptionMode: "consume-single-token",
    });
  }, [attributes, selectedAttributeIds, selectedAttributeOptions]);
  const pricedCombinationCandidates = useMemo(() => {
    return filterValidMatrixCombinations({
      attributeDependencies: watchAttributeDependencies,
      combinationAttributes,
      combinations: getPricedMatrixCombinationIds({
        prices: currentPrices,
        volumes: selectedVolumes,
      }),
    });
  }, [
    combinationAttributes,
    currentPrices,
    selectedVolumes,
    watchAttributeDependencies,
  ]);
  const candidateCombinations: string[] = useMemo(() => {
    const allCombinations =
      pricedCombinationCandidates.length > 0
        ? pricedCombinationCandidates
        : watchAttributeDependencies &&
            Object.keys(watchAttributeDependencies).length > 0
          ? generateDependencyAwareCombinations({
              attributeDependencies: watchAttributeDependencies,
              combinationAttributes,
            })
          : getCombinations(arr);

    return filterValidMatrixCombinations({
      attributeDependencies: watchAttributeDependencies,
      combinationAttributes,
      combinations: allCombinations,
    });
  }, [
    arr,
    combinationAttributes,
    pricedCombinationCandidates,
    watchAttributeDependencies,
  ]);
  const memoizedCombinations: string[] = useMemo(
    () =>
      pricedCombinationCandidates.length > 0
        ? candidateCombinations
        : filterPricedMatrixCombinations({
            combinations: candidateCombinations,
            prices: currentPrices,
            volumes: selectedVolumes,
          }),
    [
      candidateCombinations,
      currentPrices,
      pricedCombinationCandidates.length,
      selectedVolumes,
    ],
  );
  const visiblePrices = useMemo(
    () =>
      partitionMatrixPricesByVisibility({
        prices: currentPrices,
        visibleCombinations: memoizedCombinations,
      }).visiblePrices,
    [currentPrices, memoizedCombinations],
  );
  const mergeVisiblePricesWithHidden = useCallback(
    (nextVisiblePrices: Price[]) => {
      const { hiddenPrices } = partitionMatrixPricesByVisibility({
        prices: currentPrices,
        visibleCombinations: memoizedCombinations,
      });

      return [...nextVisiblePrices, ...hiddenPrices];
    },
    [currentPrices, memoizedCombinations],
  );

  const getCurrentState = useCallback(
    (): HistoryState => ({
      prices: pricesSheetRows,
      thresholds: thresholdsSheetRows,
      deliveryTimes: deliveryTimesSheetRows,
      active: activeSheetRows,
    }),
    [
      pricesSheetRows,
      thresholdsSheetRows,
      deliveryTimesSheetRows,
      activeSheetRows,
    ],
  );

  const trackedSetPricesRows = useCallback(
    (rows: Row[]) => {
      pushState(getCurrentState());
      setPricesSheetRows(rows);
    },
    [getCurrentState, pushState],
  );
  const trackedSetThresholdsRows = useCallback(
    (rows: Row[]) => {
      pushState(getCurrentState());
      setThresholdsSheetRows(rows);
    },
    [getCurrentState, pushState],
  );
  const trackedSetDeliveryTimesRows = useCallback(
    (rows: Row[]) => {
      pushState(getCurrentState());
      setDeliveryTimesSheetRows(rows);
    },
    [getCurrentState, pushState],
  );
  const trackedSetActiveRows = useCallback(
    (rows: Row[]) => {
      pushState(getCurrentState());
      setActiveSheetRows(rows);
    },
    [getCurrentState, pushState],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" && !e.shiftKey) {
          e.preventDefault();
          const prev = undo(getCurrentState());
          if (prev) {
            setPricesSheetRows(prev.prices);
            setThresholdsSheetRows(prev.thresholds);
            setDeliveryTimesSheetRows(prev.deliveryTimes);
            setActiveSheetRows(prev.active);
          }
        } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
          e.preventDefault();
          const next = redo(getCurrentState());
          if (next) {
            setPricesSheetRows(next.prices);
            setThresholdsSheetRows(next.thresholds);
            setDeliveryTimesSheetRows(next.deliveryTimes);
            setActiveSheetRows(next.active);
          }
        }
      }
    },
    [getCurrentState, undo, redo],
  );

  const combinationColumnLabel = t("matrix.labels.combination", {
    defaultValue: "Combination",
  });

  // Guard against undefined volumes when building columns
  const pricesSheetColumns = useMemo(
    () => getColumns(selectedVolumes, combinationColumnLabel),
    [combinationColumnLabel, selectedVolumes],
  );
  const thresholdsSheetColumns = useMemo(
    () => getColumns(selectedVolumes, combinationColumnLabel),
    [combinationColumnLabel, selectedVolumes],
  );
  const deliveryTimesSheetColumns = useMemo(
    () => getColumns(selectedVolumes, combinationColumnLabel),
    [combinationColumnLabel, selectedVolumes],
  );
  const activeSheetColumns = useMemo(
    () => getColumns(selectedVolumes, combinationColumnLabel),
    [combinationColumnLabel, selectedVolumes],
  );

  const isMissingAttributes = useMemo(() => {
    if (!attributes) return false;
    for (let i = 0; i < selectedAttributeIds.length; i++) {
      if (
        isUndefined(
          attributes?.find((obj) => obj.id === selectedAttributeIds[i]),
        )
      ) {
        console.error(`Nie znaleziono atrybutu ${selectedAttributeIds[i]}`);
        return true;
      }
    }
    return false;
  }, [selectedAttributeIds, attributes]);

  const matrixWorksheetBaseInput = useMemo(
    () =>
      !isUndefined(watchVolumes)
        ? {
            attributeDependencies: watchAttributeDependencies,
            combinationAttributes,
            combinations: memoizedCombinations,
            optionsValueLabelPairs,
            volumes: selectedVolumes,
          }
        : null,
    [
      combinationAttributes,
      memoizedCombinations,
      optionsValueLabelPairs,
      selectedVolumes,
      watchAttributeDependencies,
      watchVolumes,
    ],
  );
  const stableGridRowsBuildInputRef = useRef<MatrixWorksheetBuildInput | null>(
    null,
  );
  const gridRowsBuildInput = useMemo(() => {
    if (!matrixWorksheetBaseInput) {
      stableGridRowsBuildInputRef.current = null;
      return null;
    }

    const nextInput: MatrixWorksheetBuildInput = {
      ...matrixWorksheetBaseInput,
      prices: visiblePrices,
    };

    if (
      stableGridRowsBuildInputRef.current &&
      areMatrixWorksheetInputsEqual(
        stableGridRowsBuildInputRef.current,
        nextInput,
      )
    ) {
      return stableGridRowsBuildInputRef.current;
    }

    stableGridRowsBuildInputRef.current = nextInput;
    return nextInput;
  }, [matrixWorksheetBaseInput, visiblePrices]);

  const clearSheetRows = useCallback(() => {
    startTransition(() => {
      setPricesSheetRows([]);
      setThresholdsSheetRows([]);
      setDeliveryTimesSheetRows([]);
      setActiveSheetRows([]);
    });
  }, []);

  const applySheetRows = useCallback(
    (worksheetData: MatrixGridRowsSnapshot) => {
      startTransition(() => {
        setPricesSheetRows(worksheetData.pricesRows);
        setThresholdsSheetRows(worksheetData.thresholdsRows);
        setDeliveryTimesSheetRows(worksheetData.deliveryTimesRows);
        setActiveSheetRows(worksheetData.activeRows);
      });
    },
    [],
  );

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (isUndefined(file)) return;

      if (isUndefined(watchVolumes)) {
        console.error(
          t("volumes.missing", { defaultValue: "Missing volumes" }),
        );
        return;
      }

      setProcessing(true);

      try {
        const data = await matrixPriceWorkerClient.readWorkbook(
          new Uint8Array(await file.arrayBuffer()),
        );
        const { data: prices, error } =
          await matrixPriceWorkerClient.parseWorksheetData({
            attributeDependencies: watchAttributeDependencies,
            combinationAttributes,
            optionsLabelValuePairs,
            watchAttributes: selectedAttributeIds,
            attributes,
            memoizedCombinations,
            xlsxParseResult: data,
            volumes: selectedVolumes,
          });
        if (error) throw error;
        startTransition(() => {
          setValue(fieldName, mergeVisiblePricesWithHidden(prices));
        });
        toaster.success({
          title: t("common.success", { defaultValue: "Success" }),
          description: t("file.importedSuccessfully", {
            defaultValue: "File imported successfully",
          }),
        });
      } catch (error) {
        console.error(error);

        toaster.error({
          title: t("common.error", { defaultValue: "Something went wrong" }),
          description: t("file.processingError", {
            defaultValue: "Error processing file",
          }),
        });
      } finally {
        setProcessing(false);
      }
    },
    [
      attributes,
      combinationAttributes,
      mergeVisiblePricesWithHidden,
      memoizedCombinations,
      optionsLabelValuePairs,
      setValue,
      selectedAttributeIds,
      selectedVolumes,
      t,
      watchAttributeDependencies,
      watchVolumes,
    ],
  );

  async function setChanges() {
    setProcessing(true);
    if (isUndefined(watchVolumes)) {
      console.error("Missing volumes");
      setProcessing(false);
      toaster.error({
        title: t("common.error", { defaultValue: "Something went wrong" }),
        description: t("volumes.missing", { defaultValue: "Missing volumes" }),
      });
      return;
    }

    try {
      const result = await matrixPriceWorkerClient.parseGridRows({
        activeRows: activeSheetRows,
        attributeDependencies: watchAttributeDependencies,
        combinationAttributes,
        deliveryTimesRows: deliveryTimesSheetRows,
        pricesRows: pricesSheetRows,
        thresholdsRows: thresholdsSheetRows,
        optionsLabelValuePairs,
        watchAttributes: selectedAttributeIds,
        attributes,
        memoizedCombinations,
        volumes: selectedVolumes,
      });

      if (result.error) {
        console.error(result.error);
        toaster.error({
          title: t("common.error", { defaultValue: "Something went wrong" }),
          description: t("file.processingErrorDetail", {
            defaultValue: "Error processing file: {{error}}",
            error: result.error,
          }),
        });
        return;
      }

      startTransition(() => {
        setValue(fieldName, mergeVisiblePricesWithHidden(result.data));
      });
      toaster.success({
        title: t("toasts.prices.updated"),
        description: t("toasts.prices.updatedDescription"),
      });
    } catch (error) {
      console.error(error);
      toaster.error({
        title: t("common.error", { defaultValue: "Something went wrong" }),
        description: t("file.processingError", {
          defaultValue: "Error processing file",
        }),
      });
    } finally {
      setProcessing(false);
    }
  }

  useEffect(() => {
    if (!attributes) {
      if (!attributes)
        console.error(
          t("common.noAttributes", { defaultValue: "No attributes" }),
        );
      return;
    }

    // Filter attributes that are not calculated
    const _arr: string[][] = [];
    for (let i = 0; i < selectedAttributeIds.length; i++) {
      const attr = selectedAttributeIds[i];
      if (
        attributes.find((obj) => obj.id === attr)?.calculated &&
        !isUndefined(selectedAttributeOptions[attr])
      ) {
        _arr.push(selectedAttributeOptions[attr]);
      } else continue;
    }
    setArr((current) =>
      areStringMatricesEqual(current, _arr) ? current : _arr,
    );

    const _optionsValueLabelPairs: { [x: string]: string } = {};
    const _optionsLabelValuePairs: { [x: string]: string } = {};

    try {
      selectedAttributeIds.map((attribute: Attribute["id"]) => {
        if (!selectedAttributeOptions[attribute]) return;
        if (!isNull(attributes) && !isUndefined(attributes))
          selectedAttributeOptions[attribute].map((option: Option["value"]) => {
            const label = attributes
              ?.find((obj) => obj.id === attribute)
              ?.options.find((obj) => obj.value === option)?.label;
            if (!label) {
              return;
            } else {
              _optionsValueLabelPairs[option] = label;
              _optionsLabelValuePairs[label] = option;
            }
          });
      });
    } catch (error) {
      console.error("Błąd podczas tworzenia par wartości-etykieta:", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Something went wrong" }),
        description: t("options.pairsCreationError", {
          defaultValue: "Error creating value-label pairs: {{error}}",
          error: error,
        }),
      });
      return;
    }

    setOptionsValueLabelPairs((current) =>
      areOptionLabelPairsEqual(current, _optionsValueLabelPairs)
        ? current
        : _optionsValueLabelPairs,
    );
    setOptionsLabelValuePairs((current) =>
      areOptionLabelPairsEqual(current, _optionsLabelValuePairs)
        ? current
        : _optionsLabelValuePairs,
    );
  }, [attributes, selectedAttributeIds, selectedAttributeOptions, t]);

  useEffect(() => {
    if (!tableEditorOpen) {
      return;
    }

    if (isEmpty(optionsValueLabelPairs) || isMissingAttributes) {
      clearSheetRows();
      setSheetsLoading(false);
      return;
    }

    if (!gridRowsBuildInput || gridRowsBuildInput.combinations.length === 0) {
      clearSheetRows();
      setSheetsLoading(false);
      return;
    }

    let cancelled = false;
    setSheetsLoading(true);

    void matrixPriceWorkerClient
      .buildGridRows(gridRowsBuildInput)
      .then((worksheetData) => {
        if (cancelled) {
          return;
        }

        applySheetRows(worksheetData);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        console.error("Error building matrix worksheets:", error);
        clearSheetRows();
        toaster.error({
          title: t("common.error", { defaultValue: "Something went wrong" }),
          description: t("file.processingError", {
            defaultValue: "Error processing file",
          }),
        });
      })
      .finally(() => {
        if (!cancelled) {
          setSheetsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    applySheetRows,
    clearSheetRows,
    gridRowsBuildInput,
    isMissingAttributes,
    optionsValueLabelPairs,
    t,
    tableEditorOpen,
  ]);

  // Build a list of issues explaining why combinations cannot be created
  const combinationIssues = useMemo(() => {
    const issues: string[] = [];

    if (!attributes || attributes.length === 0) {
      issues.push(
        t("matrix.issues.attributesNotLoaded", {
          defaultValue: "Attributes data is not loaded yet.",
        }),
      );
      return issues;
    }

    if (selectedAttributeIds.length === 0) {
      issues.push(
        t("matrix.issues.noAttributesSelected", {
          defaultValue: "No attributes selected.",
        }),
      );
      return issues;
    }

    const missingSelected = selectedAttributeIds.filter(
      (id: string) => !attributes.find((a) => a.id === id),
    );
    if (missingSelected.length > 0) {
      issues.push(
        t("matrix.issues.selectedAttributesMissing", {
          defaultValue: "Some selected attributes no longer exist.",
        }),
      );
    }

    const selectedCalculated = selectedAttributeIds.filter(
      (id: string) => attributes.find((a) => a.id === id)?.calculated,
    );

    if (selectedCalculated.length === 0) {
      issues.push(
        t("matrix.issues.noCalculated", {
          defaultValue:
            "None of the selected attributes are marked as calculated.",
        }),
      );
      return issues;
    }

    const noOptionsCalculated = selectedCalculated.filter(
      (id: string) =>
        isUndefined(selectedAttributeOptions[id]) ||
        isEmpty(selectedAttributeOptions[id] as unknown as object),
    );
    if (noOptionsCalculated.length > 0) {
      const names = noOptionsCalculated
        .map((id: string) => attributes.find((a) => a.id === id)?.name)
        .filter(Boolean)
        .join(", ");
      issues.push(
        t("matrix.issues.noOptionsForCalculated", {
          defaultValue: names
            ? `No options selected for calculated attributes: ${names}.`
            : "No options selected for calculated attributes.",
        }),
      );
    }

    // If dependency rules filter out all combinations, run diagnostics
    try {
      const sourceArrays: string[][] = [];
      selectedCalculated.forEach((id: string) => {
        const opts = selectedAttributeOptions[id] as string[] | undefined;
        if (opts && opts.length > 0) sourceArrays.push(opts);
      });
      if (
        sourceArrays.length > 0 &&
        sourceArrays.every((options) => options.length > 0) &&
        memoizedCombinations.length === 0
      ) {
        const detailedDiagnostics = diagnoseCombinationFailures({
          attributeDependencies:
            watchAttributeDependencies as Product["attributeDependencies"],
          attributeOptions:
            selectedAttributeOptions as Product["attributeOptions"],
          attributes: attributes ?? [],
          calculatedAttributeIds: selectedCalculated,
        });

        if (detailedDiagnostics.length > 0) {
          for (const diagnostic of detailedDiagnostics) {
            issues.push(
              t(`matrix.diagnostics.${diagnostic.key}`, {
                defaultValue: diagnostic.key,
                ...diagnostic.params,
              }),
            );
          }
          issues.push(
            t("matrix.diagnostics.tip", {
              defaultValue:
                "Check attribute dependency rules and option mappings. Ensure parent attributes are included with matching option values.",
            }),
          );
        } else {
          issues.push(
            t("matrix.issues.dependenciesFilterAll", {
              defaultValue:
                "Current attribute dependency rules filter out all combinations.",
            }),
          );
        }
      }
    } catch {
      // ignore
    }

    // Generic fallback when nothing else matched but we still have zero combinations
    if (issues.length === 0 && memoizedCombinations.length === 0) {
      issues.push(
        t("matrix.issues.noCombinations", {
          defaultValue:
            "No combinations could be built with the current selection.",
        }),
      );
    }

    return issues;
  }, [
    attributes,
    memoizedCombinations.length,
    selectedAttributeIds,
    selectedAttributeOptions,
    t,
    watchAttributeDependencies,
  ]);

  const exportMatrix = useCallback(() => {
    if (!watchName || isUndefined(watchVolumes) || !matrixWorksheetBaseInput) {
      if (!watchName) {
        console.error(t("common.noName", { defaultValue: "No name" }));
      }
      if (isUndefined(watchVolumes)) {
        console.error(
          t("volumes.missing", { defaultValue: "Missing volumes" }),
        );
      }
      return;
    }

    const writeFilePromise = matrixPriceWorkerClient
      .buildWorksheetData({
        ...matrixWorksheetBaseInput,
        prices: visiblePrices,
      })
      .then((worksheetData) => {
        return matrixPriceWorkerClient.exportWorkbook({
          pricesRowData: JSON.stringify(worksheetData.pricesRowData),
          thresholdRowData: JSON.stringify(worksheetData.thresholdRowData),
          deliveryTimesRowData: JSON.stringify(
            worksheetData.deliveryTimesRowData,
          ),
          activeRowData: JSON.stringify(worksheetData.activRowData),
        });
      })
      .then((fileBytes) => {
        const blobBytes = new Uint8Array(fileBytes);
        const fileUrl = URL.createObjectURL(
          new Blob([blobBytes], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
        );
        const link = document.createElement("a");

        link.href = fileUrl;
        link.setAttribute("download", `${watchName}.xlsx`);
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(fileUrl), 0);
      });

    toaster.promise(writeFilePromise, {
      success: {
        title: t("common.success", { defaultValue: "Success!" }),
        description: t("file.exportedSuccessfully", {
          defaultValue: "File exported successfully",
        }),
      },
      error: (error) => ({
        title: t("common.error", { defaultValue: "Something went wrong" }),
        description:
          error instanceof Error
            ? t("file.processingErrorDetail", {
                defaultValue: "Error processing file: {{error}}",
                error: error.message,
              })
            : t("file.processingError", {
                defaultValue: "Error processing file",
              }),
      }),
      loading: {
        title: t("file.exporting", { defaultValue: "Exporting..." }),
        description: t("common.pleaseWait", { defaultValue: "Please wait" }),
      },
    });
  }, [matrixWorksheetBaseInput, t, visiblePrices, watchName, watchVolumes]);

  if (watchPriceType !== PriceTypeEnum.MATRIX) return null;

  const handleFill = useCallback(
    ({ columnKey, sourceRow, targetRow }: FillEvent<Row>): Row => {
      return { ...targetRow, [columnKey]: sourceRow[columnKey as keyof Row] };
    },
    [],
  );

  const handlePaste = useCallback(
    (
      { column, row }: CellPasteArgs<Row>,
      event: React.ClipboardEvent<HTMLDivElement>,
    ): Row => {
      const targetColumnKey = column.key;
      if (targetColumnKey === "combination") {
        return row;
      }
      const text = event.clipboardData.getData("text/plain");
      return {
        ...row,
        [targetColumnKey]: text,
      };
    },
    [],
  );

  const handleCopy = useCallback(
    (
      { column, row }: CellCopyArgs<Row>,
      event: React.ClipboardEvent<HTMLDivElement>,
    ): void => {
      const value = row[column.key as keyof Row];
      if (value !== undefined) {
        event.clipboardData.setData("text/plain", String(value));
        event.preventDefault();
      }
    },
    [],
  );

  const handleSheetValueChange = useCallback((details: { value: string }) => {
    startTransition(() => {
      setCurrentSheet(details.value);
    });
  }, []);

  async function generatePrices() {
    if (!instructions) {
      toaster.error({
        title: t("common.error", { defaultValue: "Something went wrong" }),
        description: t("common.noInstructions", {
          defaultValue: "No instructions",
        }),
      });
      return;
    }
    setProcessing(true);
    try {
      const result = await generateAdminText({
        systemPrompt: `
        You are a system that generates prices based on provided data. You should always provide a list of prices that are most likely to be used by the user. If the user provides a price that is not on the list, you should skip it. Always return a JSON object with prices but omit everything but combinationId and volume value that wasn't changed. Here is an example of the JSON object:
        {
          "prices": [
            {
              "combination": {
                "id": combinationId
              },
              "volume": {
                "value": volumeId
              },
              "value": priceValue,
            }
          ]
        }, where "combination id" is the id of the combination, "volume id" is the id of the volume, "price value" is the value of the price. Make sure that the price value is a number. There is a serialized prices list that include all available options that you can choose from: ${JSON.stringify(currentPrices)}.
        Do not wrap the json codes in JSON markers.
        Return only changed prices.
        Try to minify the JSON object as much as possible.
      `,
        context: `Instruction with changes to make: ${instructions}`,
        modelId: MODELS.GEMINI_3_FLASH,
      });
      try {
        const strippedResult = result.replace(/```json|```/g, "");
        const updatedPrices: Price[] = JSON.parse(strippedResult).prices;
        const newPrices = currentPrices.map((price) => ({
          ...price,
          combination: price.combination
            ? { ...price.combination }
            : price.combination,
          volume: price.volume ? { ...price.volume } : price.volume,
        }));
        for (let i = 0; i < updatedPrices.length; i++) {
          const j = newPrices.findIndex(
            (obj: Price) =>
              obj.combination?.id === updatedPrices[i].combination?.id &&
              obj.volume?.value === updatedPrices[i].volume?.value,
          );
          if (updatedPrices[i].value) {
            newPrices[j].value = updatedPrices[i].value;
          }
        }
        startTransition(() => {
          setValue(fieldName, newPrices);
        });
      } catch (error) {
        toaster.error({
          title: t("common.error", { defaultValue: "Something went wrong" }),
          description: t("file.processingError", {
            defaultValue: "Error processing file",
          }),
        });
        console.error(error);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <>
      {watchPriceType === PriceTypeEnum.MATRIX &&
        memoizedCombinations.length === 0 && (
          <Alert.Root my={4} variant="surface" status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>
                {t("matrix.issues.title", {
                  defaultValue: "Combinations cannot be generated",
                })}
              </Alert.Title>
              <Alert.Description>
                <VStack align="start" gap="1">
                  {combinationIssues.map((msg, idx) => (
                    <Text key={idx}>• {msg}</Text>
                  ))}
                </VStack>
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}
      <Flex my={"4"} gap={"2"}>
        <Button
          onClick={exportMatrix}
          disabled={memoizedCombinations.length <= 0}
        >
          {exportButtonLabel ??
            t("admin.exportTable", { defaultValue: "Export table" })}
        </Button>
        <Drawer.Root
          size={"full"}
          open={tableEditorOpen}
          onOpenChange={(details) => setTableEditorOpen(details.open)}
        >
          <Drawer.Trigger asChild>
            <Button>
              <MaterialSymbol>edit</MaterialSymbol>
              {editButtonLabel ??
                t("admin.editTable", { defaultValue: "Edit Table" })}
            </Button>
          </Drawer.Trigger>
          <Portal>
            <Drawer.Backdrop />
            <Drawer.Positioner>
              <Drawer.Content onKeyDown={handleKeyDown}>
                <Drawer.Header>
                  <Drawer.Title>
                    {drawerTitle ??
                      t("admin.editTable", { defaultValue: "Edit Table" })}
                  </Drawer.Title>
                </Drawer.Header>
                <Drawer.Body
                  overflow="hidden"
                  display="flex"
                  flexDirection="column"
                >
                  {sheetsLoading ? (
                    <Center minH="60vh">
                      <Text>
                        {t("common.loading", { defaultValue: "Loading..." })}
                      </Text>
                    </Center>
                  ) : (
                    <Tabs.Root
                      value={currentSheet}
                      onValueChange={handleSheetValueChange}
                      fitted
                      lazyMount
                      unmountOnExit
                    >
                      <Tabs.List>
                        <Tabs.Trigger value={PRICES_WORKSHEET_NAME}>
                          {t("matrix.sheets.prices", {
                            defaultValue: "Prices",
                          })}
                        </Tabs.Trigger>
                        <Tabs.Trigger value={THRESHOLDS_WORKSHEET_NAME}>
                          {t("matrix.sheets.thresholds", {
                            defaultValue: "Thresholds",
                          })}
                        </Tabs.Trigger>
                        <Tabs.Trigger value={DELIVERY_TIMES_WORKSHEET_NAME}>
                          {t("matrix.sheets.deliveryTimes", {
                            defaultValue: "Delivery times",
                          })}
                        </Tabs.Trigger>
                        <Tabs.Trigger value={ACTIVE_WORKSHEET_NAME}>
                          {t("matrix.sheets.active", {
                            defaultValue: "Active",
                          })}
                        </Tabs.Trigger>
                        <Tabs.Indicator />
                      </Tabs.List>
                      <Tabs.Content value={PRICES_WORKSHEET_NAME} pt="4">
                        <MatrixSheetGrid
                          rows={pricesSheetRows}
                          columns={pricesSheetColumns}
                          onRowsChange={trackedSetPricesRows}
                          onFill={handleFill}
                          onCellCopy={handleCopy}
                          onCellPaste={handlePaste}
                        />
                      </Tabs.Content>
                      <Tabs.Content value={THRESHOLDS_WORKSHEET_NAME} pt="4">
                        <MatrixSheetGrid
                          rows={thresholdsSheetRows}
                          columns={thresholdsSheetColumns}
                          onRowsChange={trackedSetThresholdsRows}
                          onFill={handleFill}
                          onCellCopy={handleCopy}
                          onCellPaste={handlePaste}
                        />
                      </Tabs.Content>
                      <Tabs.Content
                        value={DELIVERY_TIMES_WORKSHEET_NAME}
                        pt="4"
                      >
                        <MatrixSheetGrid
                          rows={deliveryTimesSheetRows}
                          columns={deliveryTimesSheetColumns}
                          onRowsChange={trackedSetDeliveryTimesRows}
                          onFill={handleFill}
                          onCellCopy={handleCopy}
                          onCellPaste={handlePaste}
                        />
                      </Tabs.Content>
                      <Tabs.Content value={ACTIVE_WORKSHEET_NAME} pt="4">
                        <MatrixSheetGrid
                          rows={activeSheetRows}
                          columns={activeSheetColumns}
                          onRowsChange={trackedSetActiveRows}
                          onFill={handleFill}
                          onCellCopy={handleCopy}
                          onCellPaste={handlePaste}
                        />
                      </Tabs.Content>
                    </Tabs.Root>
                  )}
                  <Textarea
                    mt={"4"}
                    w={"100%"}
                    value={instructions}
                    onChange={(e) => setInstructions(e.currentTarget.value)}
                    placeholder={t("matrix.labels.instructionsPlaceholder", {
                      defaultValue: "Information...",
                    })}
                    borderRadius="3xl"
                  />
                  <Button
                    loading={processing}
                    onClick={() => generatePrices()}
                    colorPalette={"primary"}
                  >
                    {t("admin.generate", { defaultValue: "Generate" })}
                  </Button>
                </Drawer.Body>
                <Drawer.Footer>
                  <HStack mt={4}>
                    <Button
                      loading={processing}
                      disabled={sheetsLoading}
                      onClick={() => void setChanges()}
                      w={"100%"}
                      colorPalette={"success"}
                    >
                      <MaterialSymbol>save</MaterialSymbol>
                      {t("actions.saveChanges", {
                        defaultValue: "Save changes",
                      })}
                    </Button>
                  </HStack>
                </Drawer.Footer>
                <Drawer.CloseTrigger asChild>
                  <CloseButton size="sm" />
                </Drawer.CloseTrigger>
              </Drawer.Content>
            </Drawer.Positioner>
          </Portal>
        </Drawer.Root>
      </Flex>
      <FileUpload.Root
        accept={{
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
            ".xlsx",
          ],
        }}
        alignItems="stretch"
        maxFiles={1}
        onFileAccept={({ files }) => void onDrop(files)}
        w="100%"
      >
        <FileUpload.HiddenInput />
        <FileUpload.Context>
          {({ dragging }) => (
            <FileUpload.Dropzone asChild w="100%">
              <Center
                minH="48px"
                p={3}
                cursor="pointer"
                bg={dragging ? bgColor : "transparent"}
                _hover={{
                  bg: bgColor,
                  borderColor: borderColor,
                  color: "fg.muted",
                }}
                borderRadius="3xl"
                border="3px dashed"
                borderColor={borderColor}
                color="fg.muted"
              >
                <MaterialSymbol aria-hidden="true">cloud_upload</MaterialSymbol>
                <Text ml={2}>
                  {t("actions.importTable", { defaultValue: "Import table" })}
                </Text>
              </Center>
            </FileUpload.Dropzone>
          )}
        </FileUpload.Context>
      </FileUpload.Root>
    </>
  );
}
