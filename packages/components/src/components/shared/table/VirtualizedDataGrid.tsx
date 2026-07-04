"use client";

import "react-data-grid/lib/styles.css";

import { Box } from "@chakra-ui/react";
import { type ComponentProps, type CSSProperties, useMemo } from "react";
import {
  DataGrid,
  type Column,
  type DataGridProps,
  type SortColumn,
} from "react-data-grid";

export type DataGridDensity = "compact" | "comfortable";

export type VirtualizedDataGridProps<
  TRow extends object,
  TSummaryRow extends object = object,
> = {
  "aria-label": string;
  columns: readonly Column<TRow, TSummaryRow>[];
  rows: readonly TRow[];
  bottomSummaryRows?: readonly TSummaryRow[];
  className?: string;
  containerProps?: ComponentProps<typeof Box>;
  defaultColumnOptions?: DataGridProps<
    TRow,
    TSummaryRow
  >["defaultColumnOptions"];
  density?: DataGridDensity;
  headerRowHeight?: DataGridProps<TRow, TSummaryRow>["headerRowHeight"];
  maxHeight?: CSSProperties["maxHeight"];
  maxRowsBeforeScroll?: number;
  minHeight?: CSSProperties["minHeight"];
  isRowSelectionDisabled?: DataGridProps<
    TRow,
    TSummaryRow
  >["isRowSelectionDisabled"];
  onCellClick?: DataGridProps<TRow, TSummaryRow>["onCellClick"];
  onCellKeyDown?: DataGridProps<TRow, TSummaryRow>["onCellKeyDown"];
  onSelectedRowsChange?: DataGridProps<
    TRow,
    TSummaryRow
  >["onSelectedRowsChange"];
  onSortColumnsChange?: DataGridProps<TRow, TSummaryRow>["onSortColumnsChange"];
  renderers?: DataGridProps<TRow, TSummaryRow>["renderers"];
  rowClass?: DataGridProps<TRow, TSummaryRow>["rowClass"];
  rowHeight?: DataGridProps<TRow, TSummaryRow>["rowHeight"];
  rowKeyGetter?: DataGridProps<TRow, TSummaryRow>["rowKeyGetter"];
  selectedRows?: DataGridProps<TRow, TSummaryRow>["selectedRows"];
  sortColumns?: readonly SortColumn[];
  style?: CSSProperties;
  summaryRowHeight?: DataGridProps<TRow, TSummaryRow>["summaryRowHeight"];
};

const DEFAULT_ROW_HEIGHT = 35;
const DEFAULT_HEADER_ROW_HEIGHT = 35;
const DEFAULT_SUMMARY_ROW_HEIGHT = 35;
const DEFAULT_NO_ROWS_CONTENT_HEIGHT = 160;
const DEFAULT_MAX_ROWS_BEFORE_SCROLL = 50;

function getRowHeight<TRow extends object, TSummaryRow extends object>(
  row: TRow,
  rowHeight: DataGridProps<TRow, TSummaryRow>["rowHeight"] | undefined,
) {
  if (typeof rowHeight === "number") return rowHeight;
  if (typeof rowHeight === "function") return rowHeight(row);
  return DEFAULT_ROW_HEIGHT;
}

function getRowsHeight<TRow extends object, TSummaryRow extends object>(
  rows: readonly TRow[],
  rowHeight: DataGridProps<TRow, TSummaryRow>["rowHeight"] | undefined,
  maxRowsBeforeScroll: number,
) {
  const rowsToMeasure = Math.min(rows.length, maxRowsBeforeScroll);
  let height = 0;

  for (let index = 0; index < rowsToMeasure; index += 1) {
    const row = rows[index];
    if (row) height += getRowHeight<TRow, TSummaryRow>(row, rowHeight);
  }

  return height;
}

const GRID_STYLES = `
  .konfi-data-grid {
    --rdg-background-color: var(--chakra-colors-bg);
    --rdg-border-color: var(--chakra-colors-border);
    --rdg-cell-frozen-box-shadow: none;
    --rdg-checkbox-focus-color: var(--chakra-colors-primary-focus-ring);
    --rdg-color: var(--chakra-colors-fg);
    --rdg-font-size: 13px;
    --rdg-header-background-color: var(--chakra-colors-bg-subtle);
    --rdg-header-draggable-background-color: var(--chakra-colors-bg-emphasized);
    --rdg-row-hover-background-color: var(--chakra-colors-bg-subtle);
    --rdg-row-selected-background-color: var(--chakra-colors-primary-subtle);
    --rdg-row-selected-hover-background-color: var(--chakra-colors-primary-muted);
    --rdg-selection-color: transparent;
    --rdg-summary-border-color: var(--chakra-colors-border-emphasized);
    border-radius: 12px;
    background-color: inherit;
  }

  .konfi-data-grid-scroll-contained {
    overscroll-behavior: contain;
  }

  .konfi-data-grid-page-scroll {
    overflow: visible;
  }

  .konfi-data-grid [role="gridcell"],
  .konfi-data-grid [role="row"]:not(.rdg-summary-row):not(.rdg-header-row) {
    background-color: inherit;
  }

  .konfi-data-grid .rdg-header-row {
    background-color: var(--rdg-header-background-color);
  }

  .konfi-data-grid-page-scroll .rdg-header-row [role="columnheader"] {
    inset-block-start: var(--chakra-spacing-4) !important;
  }

  /* Header corners */
  .konfi-data-grid [role="columnheader"] {
    background-color: inherit;
  }

  .konfi-data-grid [role="columnheader"]:first-of-type {
    border-top-left-radius: 12px;
    border-bottom-left-radius: 12px;
  }

  .konfi-data-grid [role="columnheader"]:last-of-type {
    border-top-right-radius: 12px;
    border-bottom-right-radius: 12px;
  }

  /* Footer/Summary corners */
  .konfi-data-grid [role="row"].rdg-summary-row [role="gridcell"]:first-of-type {
    border-top-left-radius: 12px;
    border-bottom-left-radius: 12px;
  }

  .konfi-data-grid [role="row"].rdg-summary-row [role="gridcell"]:last-of-type {
    border-top-right-radius: 12px;
    border-bottom-right-radius: 12px;
  }

  /* Round bottom corners of the last row */
  .konfi-data-grid [role="row"]:last-child [role="gridcell"]:first-of-type {
    border-bottom-left-radius: 12px;
  }

  .konfi-data-grid [role="row"]:last-child [role="gridcell"]:last-of-type {
    border-bottom-right-radius: 12px;
  }

  .konfi-data-grid-animated {
    transition: grid-template-rows 0.35s ease;
  }

  .konfi-data-grid-animated > :is(.rdg-header-row, .rdg-row) {
    transition:
      line-height 0.35s ease,
      background-color 0.2s ease;
  }

  .konfi-data-grid-row [role="gridcell"] {
    box-shadow: inset 0 -1px 0 var(--chakra-colors-border);
  }

  .konfi-data-grid-cell-overflow-visible {
    overflow: visible;
    z-index: 1;
  }

  .konfi-data-grid-clickable-row [role="gridcell"] {
    cursor: pointer;
  }

  .konfi-data-grid-selected-row [role="gridcell"] {
    background: var(--chakra-colors-primary-subtle);
  }

  .konfi-data-grid-warning-row [role="gridcell"] {
    background: rgba(229, 62, 62, 0.14);
  }

  .konfi-data-grid-warning-row:hover [role="gridcell"] {
    background: rgba(229, 62, 62, 0.2);
  }

  .konfi-data-grid-detail-row [role="gridcell"] {
    background: var(--chakra-colors-bg);
  }

  .konfi-data-grid-comfortable [role="gridcell"]:not([aria-colindex="1"]),
  .konfi-data-grid-comfortable [role="columnheader"] {
    padding-inline: 10px;
  }

  .konfi-data-grid-comfortable [role="gridcell"]:not([aria-colindex="1"]) {
    padding-block: 10px;
  }

  .konfi-data-grid-compact [role="gridcell"]:not([aria-colindex="1"]),
  .konfi-data-grid-compact [role="columnheader"] {
    padding-inline: 8px;
  }

  .konfi-data-grid-compact [role="gridcell"]:not([aria-colindex="1"]) {
    padding-block: 6px;
  }

  .konfi-data-grid-detail-cell {
    align-items: stretch;
    line-height: normal;
    overflow: hidden;
    padding-block: 0;
    padding-inline: 0;
    white-space: normal;
  }

  .konfi-data-grid-detail-cell > div {
    min-height: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .konfi-data-grid-animated,
    .konfi-data-grid-animated > :is(.rdg-header-row, .rdg-row) {
      transition: none;
    }
  }
`;

export function VirtualizedDataGrid<
  TRow extends object,
  TSummaryRow extends object = object,
>({
  "aria-label": ariaLabel,
  bottomSummaryRows,
  className,
  columns,
  containerProps,
  defaultColumnOptions,
  density = "comfortable",
  headerRowHeight,
  maxHeight,
  maxRowsBeforeScroll = DEFAULT_MAX_ROWS_BEFORE_SCROLL,
  minHeight,
  isRowSelectionDisabled,
  onCellClick,
  onCellKeyDown,
  onSelectedRowsChange,
  onSortColumnsChange,
  renderers,
  rowClass,
  rowHeight,
  rowKeyGetter,
  selectedRows,
  rows,
  sortColumns,
  style,
  summaryRowHeight,
}: VirtualizedDataGridProps<TRow, TSummaryRow>) {
  const resolvedMaxRowsBeforeScroll = Math.max(1, maxRowsBeforeScroll);
  const shouldContainScroll = rows.length > resolvedMaxRowsBeforeScroll;
  const gridHeight = useMemo(() => {
    if (style?.height !== undefined) return style.height;

    const visibleRowsHeight =
      rows.length === 0
        ? DEFAULT_NO_ROWS_CONTENT_HEIGHT
        : getRowsHeight(rows, rowHeight, resolvedMaxRowsBeforeScroll);
    const summaryRowsHeight =
      (bottomSummaryRows?.length ?? 0) *
      (summaryRowHeight ?? DEFAULT_SUMMARY_ROW_HEIGHT);

    return (
      (headerRowHeight ?? DEFAULT_HEADER_ROW_HEIGHT) +
      visibleRowsHeight +
      summaryRowsHeight
    );
  }, [
    bottomSummaryRows?.length,
    headerRowHeight,
    resolvedMaxRowsBeforeScroll,
    rowHeight,
    rows,
    style?.height,
    summaryRowHeight,
  ]);
  const gridStyle = useMemo(
    () =>
      ({
        height: gridHeight,
        maxHeight,
        maxWidth: "100%",
        minHeight,
        minWidth: 0,
        width: "100%",
        ...style,
      }) as CSSProperties,
    [gridHeight, maxHeight, minHeight, style],
  );
  const classes = [
    "konfi-data-grid",
    "konfi-data-grid-animated",
    shouldContainScroll ? "konfi-data-grid-scroll-contained" : undefined,
    shouldContainScroll ? undefined : "konfi-data-grid-page-scroll",
    density === "compact"
      ? "konfi-data-grid-compact"
      : "konfi-data-grid-comfortable",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Box
      borderRadius="12px"
      minW={0}
      overflow={shouldContainScroll ? "hidden" : "visible"}
      w="full"
      {...containerProps}
    >
      <style>{GRID_STYLES}</style>
      <Box
        minW={0}
        overflow={shouldContainScroll ? undefined : "visible"}
        overflowX={shouldContainScroll ? "auto" : undefined}
        w="full"
      >
        <DataGrid
          aria-label={ariaLabel}
          bottomSummaryRows={bottomSummaryRows}
          className={classes}
          columns={columns}
          defaultColumnOptions={defaultColumnOptions}
          headerRowHeight={headerRowHeight}
          isRowSelectionDisabled={isRowSelectionDisabled}
          onCellClick={onCellClick}
          onCellKeyDown={onCellKeyDown}
          onSelectedRowsChange={onSelectedRowsChange}
          onSortColumnsChange={onSortColumnsChange}
          renderers={renderers}
          rowClass={rowClass}
          rowHeight={rowHeight}
          rowKeyGetter={rowKeyGetter}
          rows={rows}
          selectedRows={selectedRows}
          sortColumns={sortColumns}
          style={gridStyle}
          summaryRowHeight={summaryRowHeight}
        />
      </Box>
    </Box>
  );
}

export type { Column as DataGridColumn, SortColumn };
