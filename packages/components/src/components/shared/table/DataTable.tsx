"use client";

import {
  ActionBar,
  Box,
  Float,
  HStack,
  Input,
  Portal,
  Skeleton,
  Text,
  VisuallyHidden,
  useBreakpointValue,
} from "@chakra-ui/react";
import {
  isOrder,
  type ItemProblem,
  type ListResults,
  type Order,
  type OrderItem,
} from "@konfi/types";
import type { TenantContext } from "@konfi/firebase";
import "@tanstack/react-table";
import {
  type Cell,
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  isRowSelected,
  type PaginationState,
  type Row,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { isUndefined } from "es-toolkit";
import { type FirebaseStorage } from "firebase/storage";
import { type i18n, type TFunction } from "i18next";
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  memo,
  startTransition,
  useDeferredValue,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type Column,
  type DataGridProps,
  type SortColumn,
} from "react-data-grid";
import { MaterialSymbol } from "../MaterialSymbol";
import { OrderPreviewPanel } from "../order";
import { ControlledPagination } from "./ControlledPagination";
import { TableDensityControl } from "./TableDensityControl";
import { UncontrolledPagination } from "./UncontrolledPagination";
import {
  type DataGridDensity,
  VirtualizedDataGrid,
} from "./VirtualizedDataGrid";

export interface ColumnMeta<_TData extends object, _TValue> {
  isNumeric?: boolean;
  width?: string | number;
  minWidth?: string | number;
  textAlign?: "start" | "center" | "end" | "left" | "right";
  hideSortIndicator?: boolean;
  cellOverflow?: "hidden" | "visible";
  disableRowToggle?: boolean;
}

export type DataTableRowColors = {
  bgColor?: unknown;
  hoverBgColor?: unknown;
};

export type DataTableProps<Data extends object> = {
  data: Data[];
  columns: readonly unknown[];
  enableQuickFilter?: boolean;
  paginationType?: "controlled" | "uncontrolled";
  setPageIndex?: Dispatch<SetStateAction<number>>;
  showManagesPageIndex?: boolean;
  defaultPageIndex?: number;
  itemsCount?: number;
  show?: (
    type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST",
    limit: number,
  ) => Promise<void>;
  loading?: boolean;
  refreshFlag?: boolean;
  defaultPageSize?: number;
  enablePageSizeSelection?: boolean;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
  densityStorageKey?: string;
  enableRowSelection?: {
    rowSelection: RowSelectionState | undefined;
    setRowSelection: Dispatch<SetStateAction<RowSelectionState>> | undefined;
  };
  getRowId?: (originalRow: Data, index: number, parent?: Row<Data>) => string;
  isRowCollapsable?: boolean;
  enableSorting?: boolean;
  t: TFunction;
  i18n: i18n;
  storage?: FirebaseStorage;
  updateItemFulfillment?: (
    orderId: string,
    channelId: string,
    itemId: string,
    fulfilled: boolean,
  ) => Promise<void>;
  updateItemInProgress?: (
    orderId: string,
    channelId: string,
    itemId: string,
    inProgress: boolean,
  ) => Promise<void>;
  updateItemPriority?: (
    orderId: string,
    channelId: string,
    itemId: string,
    priority: boolean,
  ) => Promise<void>;
  onReportItemProblem?: (
    row: Data,
    orderItem: OrderItem,
    existingProblem?: ItemProblem,
  ) => void;
  onFileDownload?: (url?: string) => Promise<void>;
  onFileDelete?: (
    url?: string,
    setDirtyFlag?: Dispatch<SetStateAction<boolean>>,
    dirtyFlag?: boolean,
  ) => Promise<void>;
  showFiles?: boolean;
  renderItemsSection?: (
    order: Order,
    helpers: {
      dirtyFlag: boolean;
      files: ListResults[] | undefined;
      onUploadComplete: () => void;
      setDirtyFlag: Dispatch<SetStateAction<boolean>>;
    },
  ) => ReactNode;
  renderUploadComponent?: (
    orderItem: OrderItem,
    helpers: { onUploadComplete: () => void },
  ) => ReactNode;
  renderAdditionalFileSections?: (orderItem: OrderItem) => ReactNode;
  tenantContext?: TenantContext;
  getQuickFilterText?: (row: Row<Data>) => string;
  getRowColors?: (row: Row<Data>) => DataTableRowColors | undefined;
  actionBar?: {
    open: boolean;
    content: ReactNode;
  };
};

type DataTableGridRow<Data extends object> =
  | {
      kind: "row";
      id: string;
      row: Row<Data>;
      cellsByColumnId: ReadonlyMap<string, Cell<Data, unknown>>;
    }
  | {
      kind: "detail";
      id: string;
      parentRow: Row<Data>;
      parentRowId: string;
    }
  | {
      kind: "loading";
      id: string;
      index: number;
    };

const ROW_TOGGLE_IGNORE_SELECTOR = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "[role='button']",
  "[role='link']",
  "[data-row-toggle-ignore='true']",
].join(",");

const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_TABLE_DENSITY: DataGridDensity = "comfortable";
const TABLE_DENSITY_STORAGE_PREFIX = "konfi:data-table-density:v1";
const LOADING_SKELETON_COLUMN_WIDTHS = [
  "64%",
  "78%",
  "72%",
  "60%",
  "68%",
  "58%",
  "74%",
  "52%",
] as const;
const LOADING_SKELETON_RADIUS = "full";
const MAX_LOADING_SKELETON_ROWS = 10;
const QUICK_FILTER_COMMIT_DELAY_MS = 120;

type DataTableQuickFilterInputProps = {
  label: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  value: string;
};

const DataTableQuickFilterInput = memo(function DataTableQuickFilterInput({
  label,
  onValueChange,
  placeholder,
  value,
}: DataTableQuickFilterInputProps) {
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      startTransition(() => {
        onValueChange(inputValue);
      });
    }, QUICK_FILTER_COMMIT_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [inputValue, onValueChange]);

  return (
    <Input
      aria-label={label}
      name="dataTableQuickFilter"
      onChange={(event) => setInputValue(event.target.value)}
      placeholder={placeholder}
      size="sm"
      type="search"
      value={inputValue}
    />
  );
});

function isDataGridDensity(value: string | null): value is DataGridDensity {
  return value === "compact" || value === "comfortable";
}

function normalizeStorageKeySegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9:._/-]+/g, "-").slice(0, 160);
}

function resolvePageSizeOptions(
  currentPageSize: number,
  pageSizeOptions: readonly number[] | undefined,
): readonly number[] {
  const normalizedOptions = new Set<number>();

  for (const option of pageSizeOptions ?? DEFAULT_PAGE_SIZE_OPTIONS) {
    if (Number.isInteger(option) && option > 0) {
      normalizedOptions.add(option);
    }
  }

  normalizedOptions.add(currentPageSize);

  const sortedOptions = [...normalizedOptions];

  for (let index = 1; index < sortedOptions.length; index += 1) {
    const current = sortedOptions[index];
    if (current === undefined) continue;

    let insertionIndex = index - 1;
    while (
      insertionIndex >= 0 &&
      (sortedOptions[insertionIndex] ?? Number.NEGATIVE_INFINITY) > current
    ) {
      sortedOptions[insertionIndex + 1] =
        sortedOptions[insertionIndex] ?? current;
      insertionIndex -= 1;
    }

    sortedOptions[insertionIndex + 1] = current;
  }

  return sortedOptions;
}

function shouldIgnoreRowToggle(target: EventTarget | null) {
  return target instanceof HTMLElement
    ? Boolean(target.closest(ROW_TOGGLE_IGNORE_SELECTOR))
    : false;
}

function isDetailGridRow<Data extends object>(
  row: DataTableGridRow<Data>,
): row is Extract<DataTableGridRow<Data>, { kind: "detail" }> {
  return row.kind === "detail";
}

function isDataGridRow<Data extends object>(
  row: DataTableGridRow<Data>,
): row is Extract<DataTableGridRow<Data>, { kind: "row" }> {
  return row.kind === "row";
}

function isLoadingGridRow<Data extends object>(
  row: DataTableGridRow<Data>,
): row is Extract<DataTableGridRow<Data>, { kind: "loading" }> {
  return row.kind === "loading";
}

function toMinWidth(value: string | number | undefined): number | undefined {
  if (typeof value === "number") {
    return value;
  }

  const pxValue = value?.match(/^(\d+)px$/)?.[1];
  return pxValue ? Number(pxValue) : undefined;
}

function hasStringId(value: object): value is { id: string } {
  return "id" in value && typeof value.id === "string";
}

function getLoadingSkeletonWidth(columnIndex: number, rowIndex: number) {
  const widthIndex =
    (columnIndex + rowIndex) % LOADING_SKELETON_COLUMN_WIDTHS.length;
  return LOADING_SKELETON_COLUMN_WIDTHS[widthIndex];
}

function getOriginalRowId<Data extends object>(row: Row<Data>): string {
  return hasStringId(row.original) ? row.original.id : row.id;
}

function appendQuickFilterTokens(
  tokens: string[],
  value: unknown,
  seen: WeakSet<object>,
  depth = 0,
) {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === "string") {
    const normalizedValue = value.trim();
    if (normalizedValue.length > 0) {
      tokens.push(normalizedValue);
    }
    return;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    tokens.push(String(value));
    return;
  }

  if (value instanceof Date) {
    if (!Number.isNaN(value.getTime())) {
      tokens.push(value.toISOString(), value.toLocaleString());
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      appendQuickFilterTokens(tokens, item, seen, depth + 1);
    }
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  if (seen.has(value)) {
    return;
  }
  seen.add(value);

  if ("toDate" in value && typeof value.toDate === "function") {
    appendQuickFilterTokens(tokens, value.toDate(), seen, depth + 1);
    return;
  }

  if (depth >= 3) {
    const stringValue = String(value);
    if (stringValue !== "[object Object]") {
      tokens.push(stringValue);
    }
    return;
  }

  for (const nestedValue of Object.values(value)) {
    if (typeof nestedValue === "function") {
      continue;
    }

    appendQuickFilterTokens(tokens, nestedValue, seen, depth + 1);
  }
}

function buildDefaultQuickFilterText<Data extends object>(row: Row<Data>) {
  const tokens: string[] = [];
  const seen = new WeakSet<object>();

  appendQuickFilterTokens(tokens, row.original, seen);

  for (const cell of row.getVisibleCells()) {
    appendQuickFilterTokens(tokens, cell.getValue(), seen);
  }

  return tokens.join(" ").toLowerCase();
}

function getGridRowKey<Data extends object>(
  row: DataTableGridRow<Data>,
): string {
  return row.id;
}

function getGridSelectionRowId(gridRowKey: string) {
  return gridRowKey.startsWith("row:") ? gridRowKey.slice(4) : null;
}

function estimateDetailHeight(orderItemsCount: number) {
  return Math.max(360, Math.min(720, 220 + orderItemsCount * 96));
}

type DataTableDetailCellProps<Data extends object> = {
  parentRow: Row<Data>;
  parentRowId: string;
  onHeightChange: (rowId: string, height: number) => void;
  t: TFunction;
  i18n: i18n;
  storage?: FirebaseStorage;
  updateItemFulfillment?: (
    orderId: string,
    channelId: string,
    itemId: string,
    fulfilled: boolean,
  ) => Promise<void>;
  updateItemInProgress?: (
    orderId: string,
    channelId: string,
    itemId: string,
    inProgress: boolean,
  ) => Promise<void>;
  updateItemPriority?: (
    orderId: string,
    channelId: string,
    itemId: string,
    priority: boolean,
  ) => Promise<void>;
  onReportItemProblem?: (
    row: Data,
    orderItem: OrderItem,
    existingProblem?: ItemProblem,
  ) => void;
  onFileDownload?: (url?: string) => Promise<void>;
  onFileDelete?: (
    url?: string,
    setDirtyFlag?: Dispatch<SetStateAction<boolean>>,
    dirtyFlag?: boolean,
  ) => Promise<void>;
  showFiles?: boolean;
  renderItemsSection?: DataTableProps<Data>["renderItemsSection"];
  renderUploadComponent?: (
    orderItem: OrderItem,
    helpers: { onUploadComplete: () => void },
  ) => ReactNode;
  renderAdditionalFileSections?: (orderItem: OrderItem) => ReactNode;
  tenantContext?: TenantContext;
};

function DataTableDetailCellComponent<Data extends object>({
  parentRow,
  parentRowId,
  onHeightChange,
  t,
  i18n,
  storage,
  updateItemFulfillment,
  updateItemInProgress,
  updateItemPriority,
  onReportItemProblem,
  onFileDownload,
  onFileDelete,
  showFiles,
  renderItemsSection,
  renderUploadComponent,
  renderAdditionalFileSections,
  tenantContext,
}: DataTableDetailCellProps<Data>) {
  const ref = useRef<HTMLDivElement>(null);
  const order = isOrder(parentRow.original) ? parentRow.original : undefined;
  const handleReportItemProblem = useCallback(
    (_order: Order, orderItem: OrderItem, existingProblem?: ItemProblem) => {
      if (!order) return;
      onReportItemProblem?.(order, orderItem, existingProblem);
    },
    [onReportItemProblem, order],
  );

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const reportHeight = (nextHeight?: number) => {
      const resolvedHeight =
        nextHeight ?? Math.ceil(element.getBoundingClientRect().height);
      if (resolvedHeight > 0) {
        onHeightChange(parentRowId, resolvedHeight);
      }
    };

    reportHeight();
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      reportHeight(
        entry?.borderBoxSize && Array.isArray(entry.borderBoxSize)
          ? Math.ceil(entry.borderBoxSize[0]?.blockSize ?? 0)
          : Math.ceil(entry?.contentRect.height ?? 0),
      );
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [onHeightChange, parentRowId]);

  if (!order) {
    return null;
  }

  return (
    <Box ref={ref} bg="bg" w="full">
      <Box w="full">
        {/*
          Order details are intentionally kept in the shared renderer so the
          legacy table and virtualized grid expose the same expandable surface.
        */}
        <OrderPreviewPanel
          order={order}
          storage={storage}
          updateItemFulfillment={updateItemFulfillment}
          updateItemInProgress={updateItemInProgress}
          updateItemPriority={updateItemPriority}
          onReportItemProblem={
            onReportItemProblem ? handleReportItemProblem : undefined
          }
          onFileDownload={onFileDownload}
          onFileDelete={onFileDelete}
          showFiles={showFiles}
          renderItemsSection={renderItemsSection}
          renderUploadComponent={renderUploadComponent}
          renderAdditionalFileSections={renderAdditionalFileSections}
          tenantContext={tenantContext}
          t={t}
          i18n={i18n}
        />
      </Box>
    </Box>
  );
}

function areDataTableDetailCellPropsEqual<Data extends object>(
  prevProps: DataTableDetailCellProps<Data>,
  nextProps: DataTableDetailCellProps<Data>,
) {
  return (
    prevProps.parentRowId === nextProps.parentRowId &&
    prevProps.parentRow.original === nextProps.parentRow.original &&
    prevProps.onHeightChange === nextProps.onHeightChange &&
    prevProps.storage === nextProps.storage &&
    prevProps.updateItemFulfillment === nextProps.updateItemFulfillment &&
    prevProps.updateItemInProgress === nextProps.updateItemInProgress &&
    prevProps.updateItemPriority === nextProps.updateItemPriority &&
    prevProps.onReportItemProblem === nextProps.onReportItemProblem &&
    prevProps.onFileDownload === nextProps.onFileDownload &&
    prevProps.onFileDelete === nextProps.onFileDelete &&
    prevProps.showFiles === nextProps.showFiles &&
    prevProps.renderItemsSection === nextProps.renderItemsSection &&
    prevProps.renderUploadComponent === nextProps.renderUploadComponent &&
    prevProps.renderAdditionalFileSections ===
      nextProps.renderAdditionalFileSections &&
    prevProps.tenantContext === nextProps.tenantContext &&
    prevProps.i18n.resolvedLanguage === nextProps.i18n.resolvedLanguage
  );
}

const DataTableDetailCell = memo(
  DataTableDetailCellComponent,
  areDataTableDetailCellPropsEqual,
) as typeof DataTableDetailCellComponent;

function DataTableComponent<Data extends object>({
  data,
  columns,
  enableQuickFilter = true,
  paginationType,
  setPageIndex,
  showManagesPageIndex = false,
  defaultPageIndex,
  itemsCount,
  show,
  loading,
  refreshFlag,
  defaultPageSize = DEFAULT_PAGE_SIZE,
  enablePageSizeSelection,
  onPageSizeChange,
  pageSizeOptions,
  densityStorageKey,
  enableRowSelection,
  getRowId,
  isRowCollapsable = false,
  enableSorting,
  t,
  i18n,
  storage,
  updateItemFulfillment,
  updateItemInProgress,
  updateItemPriority,
  onReportItemProblem,
  onFileDownload,
  onFileDelete,
  showFiles,
  renderItemsSection,
  renderUploadComponent,
  renderAdditionalFileSections,
  tenantContext,
  getQuickFilterText,
  getRowColors,
  actionBar,
}: DataTableProps<Data>) {
  const [quickFilter, setQuickFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [density, setDensity] = useState<DataGridDensity>(
    DEFAULT_TABLE_DENSITY,
  );
  const [{ pageIndex, pageSize }, setPagination] = useState<PaginationState>({
    pageIndex: !isUndefined(defaultPageIndex) ? defaultPageIndex : 0,
    pageSize: defaultPageSize,
  });
  const [expandedRowIds, setExpandedRowIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [detailRowHeights, setDetailRowHeights] = useState<
    Readonly<Record<string, number>>
  >({});
  const paginationRef = useRef<HTMLDivElement>(null);
  const breakpoint = useBreakpointValue([
    "base",
    "sm",
    "md",
    "lg",
    "xl",
    "2xl",
  ]);
  const [isHStackVisible, setIsHStackVisible] = useState(true);
  const deferredQuickFilter = useDeferredValue(quickFilter);

  useEffect(() => {
    if (!paginationRef.current || !paginationType) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        startTransition(() => {
          setIsHStackVisible(entry.isIntersecting);
        });
      },
      {
        root: null,
        threshold: 0.5,
      },
    );

    observer.observe(paginationRef.current);

    return () => {
      observer.disconnect();
    };
  }, [paginationType]);

  useEffect(() => {
    if (
      paginationType !== "controlled" ||
      showManagesPageIndex ||
      isUndefined(setPageIndex)
    ) {
      return;
    }
    startTransition(() => {
      setPageIndex(pageIndex);
    });
  }, [setPageIndex, pageIndex, paginationType, showManagesPageIndex]);

  useEffect(() => {
    if (paginationType !== "controlled" || isUndefined(defaultPageIndex)) {
      return;
    }

    setPagination((current) =>
      current.pageIndex === defaultPageIndex
        ? current
        : { ...current, pageIndex: defaultPageIndex },
    );
  }, [defaultPageIndex, paginationType]);

  useEffect(() => {
    if (isUndefined(refreshFlag)) return;
    setPagination({
      pageIndex: !isUndefined(defaultPageIndex) ? defaultPageIndex : 0,
      pageSize: defaultPageSize,
    });
  }, [refreshFlag, defaultPageSize, defaultPageIndex]);

  useEffect(() => {
    if (paginationType !== "uncontrolled") return;

    const nextPageCount = Math.max(1, Math.ceil(data.length / pageSize));
    if (pageIndex < nextPageCount) return;

    setPagination((current) => ({
      ...current,
      pageIndex: 0,
    }));
  }, [data.length, pageIndex, pageSize, paginationType]);

  const pagination = useMemo(
    () => ({
      pageIndex,
      pageSize,
    }),
    [pageIndex, pageSize],
  );
  const currentRowSelection = enableRowSelection?.rowSelection;

  const table = useReactTable({
    data,
    columns: columns as ColumnDef<Data, unknown>[],
    pageCount:
      paginationType === "controlled" && !isUndefined(itemsCount)
        ? Math.max(1, Math.ceil(itemsCount / pageSize))
        : undefined,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onPaginationChange: setPagination,
    getPaginationRowModel:
      paginationType === "uncontrolled" ? getPaginationRowModel() : undefined,
    getRowId,
    state: {
      sorting:
        paginationType === "uncontrolled" || enableSorting !== false
          ? sorting
          : undefined,
      pagination,
      rowSelection: currentRowSelection,
    },
    debugTable: false,
    autoResetPageIndex: false,
    manualPagination: paginationType === "controlled",
    enableRowSelection: !isUndefined(enableRowSelection),
    onRowSelectionChange: enableRowSelection?.setRowSelection,
  });

  const currentPageSize = pageSize;
  const uncontrolledPageCount = Math.ceil(data.length / pageSize);
  const canSort = paginationType === "uncontrolled" || enableSorting !== false;
  const tableRows = table.getRowModel().rows;
  const controlledPageCount =
    paginationType === "controlled" && !isUndefined(itemsCount)
      ? Math.max(1, Math.ceil(itemsCount / pageSize))
      : 1;
  const resolvedPageSizeOptions = useMemo(
    () => resolvePageSizeOptions(currentPageSize, pageSizeOptions),
    [currentPageSize, pageSizeOptions],
  );
  const shouldShowPageSizeSelection =
    paginationType === "uncontrolled" || enablePageSizeSelection === true;
  const normalizedQuickFilter = deferredQuickFilter.trim().toLowerCase();

  const filteredTableRows = useMemo(() => {
    if (!enableQuickFilter || normalizedQuickFilter.length === 0) {
      return tableRows;
    }

    return tableRows.filter((row) => {
      const rowSearchText = (
        getQuickFilterText?.(row) ?? buildDefaultQuickFilterText(row)
      ).toLowerCase();

      return rowSearchText.includes(normalizedQuickFilter);
    });
  }, [enableQuickFilter, getQuickFilterText, normalizedQuickFilter, tableRows]);

  const visibleLeafColumns = useMemo(
    () => table.getVisibleLeafColumns(),
    [columns, table],
  );
  const visibleLeafColumnIds = useMemo(
    () => visibleLeafColumns.map((column) => column.id).join("|"),
    [visibleLeafColumns],
  );
  const rowToggleDisabledColumnIds = useMemo(
    () =>
      new Set(
        visibleLeafColumns
          .filter((column) => {
            const meta = column.columnDef.meta as
              | ColumnMeta<Data, unknown>
              | undefined;
            return meta?.disableRowToggle === true;
          })
          .map((column) => column.id),
      ),
    [visibleLeafColumns],
  );
  const selectedGridRows = useMemo<ReadonlySet<string> | undefined>(() => {
    if (!enableRowSelection || !currentRowSelection) {
      return undefined;
    }

    return new Set(
      Object.entries(currentRowSelection)
        .filter(([, selected]) => selected === true)
        .map(([rowId]) => `row:${rowId}`),
    );
  }, [currentRowSelection, enableRowSelection]);

  const handleToggleRow = useCallback((rowId: string) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  }, []);

  const handleDetailHeightChange = useCallback(
    (rowId: string, height: number) => {
      const nextHeight = Math.max(1, Math.ceil(height));
      setDetailRowHeights((prev) =>
        prev[rowId] === nextHeight ? prev : { ...prev, [rowId]: nextHeight },
      );
    },
    [],
  );

  const gridRows = useMemo<readonly DataTableGridRow<Data>[]>(() => {
    if (loading && filteredTableRows.length === 0) {
      const skeletonRowCount = Math.min(
        Math.max(3, pageSize),
        MAX_LOADING_SKELETON_ROWS,
      );

      return Array.from({ length: skeletonRowCount }, (_, index) => ({
        kind: "loading",
        id: `loading:${index}`,
        index,
      }));
    }

    const rows: DataTableGridRow<Data>[] = [];

    for (const row of filteredTableRows) {
      const rowId = getOriginalRowId(row);

      rows.push({
        kind: "row",
        id: `row:${rowId}`,
        row,
        cellsByColumnId: new Map(
          row.getVisibleCells().map((cell) => [cell.column.id, cell]),
        ),
      });

      if (
        isRowCollapsable &&
        expandedRowIds.has(rowId) &&
        isOrder(row.original)
      ) {
        rows.push({
          kind: "detail",
          id: `detail:${rowId}`,
          parentRow: row,
          parentRowId: rowId,
        });
      }
    }

    return rows;
  }, [
    currentRowSelection,
    expandedRowIds,
    filteredTableRows,
    isRowCollapsable,
    loading,
    pageSize,
    visibleLeafColumnIds,
  ]);

  const sortColumns = useMemo<readonly SortColumn[]>(
    () =>
      sorting.map((sort) => ({
        columnKey: sort.id,
        direction: sort.desc ? "DESC" : "ASC",
      })),
    [sorting],
  );

  const handleSortColumnsChange = useCallback(
    (nextSortColumns: readonly SortColumn[]) => {
      if (!canSort) return;

      setSorting(
        nextSortColumns.map((sortColumn) => ({
          id: sortColumn.columnKey,
          desc: sortColumn.direction === "DESC",
        })),
      );
    },
    [canSort],
  );

  const resolvedDensityStorageKey = useMemo(() => {
    const path =
      typeof window === "undefined" ? "unknown" : window.location.pathname;
    const rawKey =
      densityStorageKey ?? `${path}:${visibleLeafColumnIds || "table"}`;

    return `${TABLE_DENSITY_STORAGE_PREFIX}:${normalizeStorageKeySegment(rawKey)}`;
  }, [densityStorageKey, visibleLeafColumnIds]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedDensity = localStorage.getItem(resolvedDensityStorageKey);
    setDensity(
      isDataGridDensity(storedDensity) ? storedDensity : DEFAULT_TABLE_DENSITY,
    );
  }, [resolvedDensityStorageKey]);

  const handleDensityChange = useCallback(
    (nextDensity: DataGridDensity) => {
      setDensity(nextDensity);

      if (typeof window === "undefined") return;
      localStorage.setItem(resolvedDensityStorageKey, nextDensity);
    },
    [resolvedDensityStorageKey],
  );

  const gridColumns = useMemo<
    readonly Column<DataTableGridRow<Data>, object>[]
  >(() => {
    const leafHeaders = table.getHeaderGroups();
    const lastHeaderGroup = leafHeaders[leafHeaders.length - 1];
    const headerByColumnId = new Map(
      (lastHeaderGroup?.headers ?? []).map((header) => [
        header.column.id,
        header,
      ]),
    );

    return visibleLeafColumns.map((column, columnIndex) => {
      const meta = column.columnDef.meta as
        | ColumnMeta<Data, object>
        | undefined;
      const textAlign =
        meta?.textAlign ?? (meta?.isNumeric ? "end" : undefined);
      const header = headerByColumnId.get(column.id);
      const sortable = Boolean(canSort && column.getCanSort());

      return {
        key: column.id,
        name:
          typeof column.columnDef.header === "string"
            ? column.columnDef.header
            : column.id,
        width: meta?.width,
        minWidth: toMinWidth(meta?.minWidth),
        resizable: true,
        sortable,
        cellClass: (row) => {
          const classes: string[] = [];

          if (isDetailGridRow(row) && columnIndex === 0) {
            classes.push("konfi-data-grid-detail-cell");
          }

          if (!isDetailGridRow(row) && meta?.cellOverflow === "visible") {
            classes.push("konfi-data-grid-cell-overflow-visible");
          }

          return classes.length > 0 ? classes.join(" ") : undefined;
        },
        colSpan: (args) => {
          if (
            args.type === "ROW" &&
            isDetailGridRow(args.row) &&
            columnIndex === 0
          ) {
            return visibleLeafColumns.length;
          }

          return undefined;
        },
        renderHeaderCell: ({ sortDirection }) => (
          <Box
            alignItems="center"
            cursor={sortable ? "pointer" : "default"}
            data-sortable-header={sortable ? "true" : undefined}
            display="flex"
            gap="1"
            justifyContent={textAlign === "end" ? "flex-end" : "flex-start"}
            minW={0}
            textAlign={textAlign}
            w="full"
          >
            <Box minW={0} overflow="hidden" textOverflow="ellipsis">
              {header
                ? flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )
                : column.id}
            </Box>
            {!meta?.hideSortIndicator && sortDirection ? (
              <Float>
                <MaterialSymbol>
                  {sortDirection === "DESC" ? "expand_more" : "expand_less"}
                </MaterialSymbol>
              </Float>
            ) : null}
          </Box>
        ),
        renderCell: ({ row }) => {
          if (isLoadingGridRow(row)) {
            return (
              <HStack
                align="center"
                justify={textAlign === "end" ? "flex-end" : "flex-start"}
                minW={0}
                w="full"
              >
                <Skeleton
                  h={columnIndex === visibleLeafColumns.length - 1 ? "7" : "4"}
                  w={getLoadingSkeletonWidth(columnIndex, row.index)}
                  maxW="full"
                  borderRadius={LOADING_SKELETON_RADIUS}
                />
              </HStack>
            );
          }

          if (isDetailGridRow(row)) {
            if (columnIndex !== 0) return null;

            return (
              <DataTableDetailCell
                parentRow={row.parentRow}
                parentRowId={row.parentRowId}
                onHeightChange={handleDetailHeightChange}
                t={t}
                i18n={i18n}
                storage={storage}
                updateItemFulfillment={updateItemFulfillment}
                updateItemInProgress={updateItemInProgress}
                updateItemPriority={updateItemPriority}
                onReportItemProblem={onReportItemProblem}
                onFileDownload={onFileDownload}
                onFileDelete={onFileDelete}
                showFiles={showFiles}
                renderItemsSection={renderItemsSection}
                renderUploadComponent={renderUploadComponent}
                renderAdditionalFileSections={renderAdditionalFileSections}
                tenantContext={tenantContext}
              />
            );
          }

          const cell = row.cellsByColumnId.get(column.id);

          if (!cell) return null;

          return (
            <Box minW={0} textAlign={textAlign} w="full">
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </Box>
          );
        },
      };
    });
  }, [
    canSort,
    handleDetailHeightChange,
    i18n,
    onFileDelete,
    onFileDownload,
    onReportItemProblem,
    renderAdditionalFileSections,
    renderItemsSection,
    renderUploadComponent,
    showFiles,
    storage,
    tenantContext,
    t,
    table,
    updateItemFulfillment,
    updateItemInProgress,
    updateItemPriority,
    currentRowSelection,
    visibleLeafColumns,
  ]);

  const rowHeight = useCallback(
    (row: DataTableGridRow<Data>): number => {
      if (isDetailGridRow(row)) {
        if (isOrder(row.parentRow.original)) {
          return (
            detailRowHeights[row.parentRowId] ??
            estimateDetailHeight(row.parentRow.original.items?.length ?? 0)
          );
        }

        return 360;
      }

      if (isLoadingGridRow(row)) {
        return density === "compact" ? 44 : 64;
      }

      return density === "compact" ? 44 : 64;
    },
    [density, detailRowHeights],
  );

  const rowClass = useCallback(
    (row: DataTableGridRow<Data>) => {
      if (isDetailGridRow(row)) {
        return "konfi-data-grid-row konfi-data-grid-detail-row";
      }

      if (isLoadingGridRow(row)) {
        return "konfi-data-grid-row konfi-data-grid-loading-row";
      }

      if (!isDataGridRow(row)) {
        return "konfi-data-grid-row";
      }

      const classes = ["konfi-data-grid-row"];

      if (isRowCollapsable && isOrder(row.row.original)) {
        classes.push("konfi-data-grid-clickable-row");
      }

      if (
        enableRowSelection &&
        isRowSelected(row.row, currentRowSelection ?? {})
      ) {
        classes.push("konfi-data-grid-selected-row");
      }

      if (getRowColors?.(row.row)) {
        classes.push("konfi-data-grid-warning-row");
      }

      return classes.join(" ");
    },
    [currentRowSelection, enableRowSelection, getRowColors, isRowCollapsable],
  );

  const handleCellClick = useCallback<
    NonNullable<DataGridProps<DataTableGridRow<Data>, object>["onCellClick"]>
  >(
    ({ column, row }, event) => {
      if (rowToggleDisabledColumnIds.has(column.key)) {
        event.preventGridDefault();
        return;
      }

      if (
        !isDataGridRow(row) ||
        !isRowCollapsable ||
        !isOrder(row.row.original) ||
        shouldIgnoreRowToggle(event.target)
      ) {
        return;
      }

      event.preventGridDefault();
      handleToggleRow(getOriginalRowId(row.row));
    },
    [handleToggleRow, isRowCollapsable, rowToggleDisabledColumnIds],
  );

  const handleCellKeyDown = useCallback<
    NonNullable<DataGridProps<DataTableGridRow<Data>, object>["onCellKeyDown"]>
  >(
    ({ column, mode, row }, event) => {
      if (rowToggleDisabledColumnIds.has(column.key)) {
        if (event.key === "Enter") {
          event.preventGridDefault();
        }
        return;
      }

      if (
        mode !== "SELECT" ||
        event.key !== "Enter" ||
        !isDataGridRow(row) ||
        !isRowCollapsable ||
        !isOrder(row.row.original) ||
        shouldIgnoreRowToggle(event.target)
      ) {
        return;
      }

      event.preventGridDefault();
      handleToggleRow(getOriginalRowId(row.row));
    },
    [handleToggleRow, isRowCollapsable, rowToggleDisabledColumnIds],
  );
  const handleGridSelectedRowsChange = useCallback<
    NonNullable<
      DataGridProps<DataTableGridRow<Data>, object>["onSelectedRowsChange"]
    >
  >(
    (selectedRows) => {
      enableRowSelection?.setRowSelection?.((current) => {
        const next = { ...current };

        for (const row of filteredTableRows) {
          delete next[getOriginalRowId(row)];
        }

        for (const selectedRow of selectedRows) {
          if (typeof selectedRow !== "string") {
            continue;
          }

          const rowId = getGridSelectionRowId(selectedRow);
          if (rowId) {
            next[rowId] = true;
          }
        }

        return next;
      });
    },
    [enableRowSelection, filteredTableRows],
  );
  const isGridRowSelectionDisabled = useCallback(
    (row: DataTableGridRow<Data>) => !isDataGridRow(row),
    [],
  );

  const shouldShowActionBar = useMemo(() => {
    if (breakpoint === "base" || breakpoint === "sm") return false;
    return Boolean(paginationType) && !isHStackVisible;
  }, [paginationType, isHStackVisible, breakpoint]);
  const customActionBarContent = actionBar?.open ? actionBar.content : null;
  const hasCustomActionBarContent = Boolean(customActionBarContent);
  const actionBarIsOpen = shouldShowActionBar || hasCustomActionBarContent;
  const densityControl = (
    <TableDensityControl
      density={density}
      onDensityChange={handleDensityChange}
      t={t}
    />
  );
  const handleQuickFilterChange = useCallback((nextQuickFilter: string) => {
    setQuickFilter(nextQuickFilter);
  }, []);
  const quickFilterControl = enableQuickFilter ? (
    <Box flex="1 1 20px" maxW={{ base: "full", xl: "280px" }} minW={0}>
      <DataTableQuickFilterInput
        label={t("table.quickFilterLabel", {
          defaultValue: "Quick filter current page",
        })}
        onValueChange={handleQuickFilterChange}
        placeholder={t("table.quickFilterPlaceholder", {
          defaultValue: "Quick filter current page…",
        })}
        value={quickFilter}
      />
    </Box>
  ) : null;
  const loadingLabel = t("common.loading", { defaultValue: "Loading..." });

  const handleControlledPageChange = useCallback(
    (type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST", nextPageIndex: number) => {
      if (!show || loading) return;

      const boundedPageIndex = Math.max(
        0,
        Math.min(nextPageIndex, controlledPageCount - 1),
      );

      setPagination((current) => ({
        ...current,
        pageIndex: boundedPageIndex,
      }));
      if (!showManagesPageIndex) {
        setPageIndex?.(boundedPageIndex);
      }
      void show(type, pageSize);
    },
    [
      controlledPageCount,
      loading,
      pageSize,
      setPageIndex,
      show,
      showManagesPageIndex,
    ],
  );

  const handleControlledPageSizeChange = useCallback(
    (nextPageSize: number) => {
      if (!show || loading) return;

      setPagination({ pageIndex: 0, pageSize: nextPageSize });
      if (!showManagesPageIndex) {
        setPageIndex?.(0);
      }
      onPageSizeChange?.(nextPageSize);
      void show("FIRST", nextPageSize);
    },
    [loading, onPageSizeChange, setPageIndex, show, showManagesPageIndex],
  );

  return (
    <Box aria-busy={loading ? "true" : undefined} minW={0} w="full">
      {loading ? (
        <VisuallyHidden role="status" aria-live="polite">
          {loadingLabel}
        </VisuallyHidden>
      ) : null}
      <VirtualizedDataGrid<DataTableGridRow<Data>>
        aria-label={t("table.ariaLabel", { defaultValue: "Data table" })}
        columns={gridColumns}
        defaultColumnOptions={{
          resizable: true,
          sortable: canSort,
        }}
        isRowSelectionDisabled={isGridRowSelectionDisabled}
        onCellClick={handleCellClick}
        onCellKeyDown={handleCellKeyDown}
        onSelectedRowsChange={
          enableRowSelection ? handleGridSelectedRowsChange : undefined
        }
        onSortColumnsChange={handleSortColumnsChange}
        renderers={{
          noRowsFallback: (
            <Box
              alignItems="center"
              display="flex"
              justifyContent="center"
              py={12}
            >
              <Text color="fg.muted" textAlign="center">
                {normalizedQuickFilter.length > 0 && tableRows.length > 0
                  ? t("table.quickFilterNoResults", {
                      defaultValue:
                        "No rows match the quick filter on this page.",
                    })
                  : t("common.noResults", { defaultValue: "No results" })}
              </Text>
            </Box>
          ),
        }}
        rowClass={rowClass}
        rowHeight={rowHeight}
        rowKeyGetter={getGridRowKey}
        rows={gridRows}
        selectedRows={selectedGridRows}
        sortColumns={sortColumns}
        density={density}
      />
      <HStack
        mt="6"
        justifyContent="space-between"
        ref={paginationRef}
        gap="3"
        flexWrap="wrap"
      >
        {paginationType === "controlled" ? (
          <ControlledPagination
            show={show}
            itemsCount={itemsCount}
            leftContent={quickFilterControl}
            loading={loading}
            onPageChange={handleControlledPageChange}
            onPageSizeChange={handleControlledPageSizeChange}
            pageCount={controlledPageCount}
            pagination={pagination}
            pageSizeOptions={
              shouldShowPageSizeSelection ? resolvedPageSizeOptions : undefined
            }
            rightContent={densityControl}
            t={t}
          />
        ) : paginationType === "uncontrolled" ? (
          <UncontrolledPagination
            leftContent={quickFilterControl}
            table={table}
            t={t}
            pagination={pagination}
            setPagination={setPagination}
            pageCount={uncontrolledPageCount}
            onPageSizeChange={onPageSizeChange}
            pageSizeOptions={
              shouldShowPageSizeSelection ? resolvedPageSizeOptions : undefined
            }
            rightContent={densityControl}
          />
        ) : (
          densityControl
        )}
      </HStack>
      <ActionBar.Root open={actionBarIsOpen} lazyMount unmountOnExit>
        <Portal>
          <ActionBar.Positioner>
            <ActionBar.Content>
              <Box display="flex" flexDir="column" gap="4" w="full">
                {customActionBarContent}
                {shouldShowActionBar ? (
                  paginationType === "controlled" ? (
                    <ControlledPagination
                      show={show}
                      itemsCount={itemsCount}
                      leftContent={quickFilterControl}
                      loading={loading}
                      onPageChange={handleControlledPageChange}
                      onPageSizeChange={handleControlledPageSizeChange}
                      pageCount={controlledPageCount}
                      pagination={pagination}
                      pageSizeOptions={
                        shouldShowPageSizeSelection
                          ? resolvedPageSizeOptions
                          : undefined
                      }
                      rightContent={densityControl}
                      transparentBackground={shouldShowActionBar}
                      t={t}
                    />
                  ) : paginationType === "uncontrolled" ? (
                    <UncontrolledPagination
                      leftContent={quickFilterControl}
                      table={table}
                      t={t}
                      pagination={pagination}
                      setPagination={setPagination}
                      pageCount={uncontrolledPageCount}
                      onPageSizeChange={onPageSizeChange}
                      pageSizeOptions={
                        shouldShowPageSizeSelection
                          ? resolvedPageSizeOptions
                          : undefined
                      }
                      rightContent={densityControl}
                      transparentBackground={shouldShowActionBar}
                    />
                  ) : null
                ) : null}
              </Box>
            </ActionBar.Content>
          </ActionBar.Positioner>
        </Portal>
      </ActionBar.Root>
    </Box>
  );
}

export const DataTable = memo(DataTableComponent) as typeof DataTableComponent;
