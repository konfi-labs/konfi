"use client";

import { Collapsible, Table } from "@chakra-ui/react";
import {
  isOrder,
  ItemProblem,
  ListResults,
  Order,
  OrderItem,
} from "@konfi/types";
import type { TenantContext } from "@konfi/firebase";
import "@tanstack/react-table";
import {
  flexRender,
  isRowSelected,
  Table as ITable,
  Row,
  RowSelectionState,
} from "@tanstack/react-table";
import { FirebaseStorage } from "firebase/storage";
import { i18n, TFunction } from "i18next";
import { type ReactNode, memo, useMemo, useState } from "react";
import { OrderPreviewPanel } from "../order";
import { ColumnMeta, DataTableRowColors } from "./DataTable";

type CustomTrProps<Data extends object> = {
  table: ITable<Data>;
  row: Row<Data>;
  isRowCollapsable?: boolean;
  enableRowSelection?:
    | {
        rowSelection: RowSelectionState | undefined;
        setRowSelection:
          | React.Dispatch<React.SetStateAction<RowSelectionState>>
          | undefined;
      }
    | undefined;
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
    setDirtyFlag?: React.Dispatch<React.SetStateAction<boolean>>,
    dirtyFlag?: boolean,
  ) => Promise<void>;
  showFiles?: boolean;
  renderItemsSection?: (
    order: Order,
    helpers: {
      dirtyFlag: boolean;
      files: ListResults[] | undefined;
      onUploadComplete: () => void;
      setDirtyFlag: React.Dispatch<React.SetStateAction<boolean>>;
    },
  ) => ReactNode;
  renderUploadComponent?: (
    orderItem: OrderItem,
    helpers: { onUploadComplete: () => void },
  ) => ReactNode;
  renderAdditionalFileSections?: (orderItem: OrderItem) => ReactNode;
  tenantContext?: TenantContext;
  getRowColors?: (row: Row<Data>) => DataTableRowColors | undefined;
};

const CustomTrComponent = <Data extends object>({
  table,
  row,
  isRowCollapsable,
  enableRowSelection,
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
  getRowColors,
}: CustomTrProps<Data>) => {
  const [open, setOpen] = useState(false);
  const defaultBgColor = { base: "white", _dark: "gray.950" };
  const defaultHoverBgColor = { base: "primary.50", _dark: "black" };
  const rowColors = getRowColors?.(row);
  const rowBgColor = rowColors?.bgColor ?? defaultBgColor;
  const hoverBgColor = rowColors?.hoverBgColor ?? defaultHoverBgColor;
  const stableKey = useMemo(
    () => (isOrder(row.original) ? row.original.id : row.id),
    [row.original, row.id],
  );

  const handleOnClick = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-row-toggle-ignore]")) {
      return;
    }
    if (target.closest("tr") === event.currentTarget) {
      setOpen(!open);
    }
  };

  const isOpenable = useMemo(() => {
    return isRowCollapsable && row.original && isOrder(row.original);
  }, [isRowCollapsable, row.original]);

  return (
    <>
      <Table.Row
        key={stableKey}
        _hover={{
          bgColor: hoverBgColor,
          transitionProperty: "all",
          transitionDuration: "150ms",
          transitionTimingFunction: "ease-in-out",
        }}
        bgColor={
          enableRowSelection
            ? isRowSelected(row, table.getState().rowSelection)
              ? hoverBgColor
              : rowBgColor
            : rowBgColor
        }
        onClick={isOpenable ? handleOnClick : undefined}
        cursor={isRowCollapsable ? "pointer" : undefined}
      >
        {row.getVisibleCells().map((cell, index) => {
          const meta = cell.column.columnDef.meta as ColumnMeta<Data, object>;
          const textAlign =
            meta?.textAlign ?? (meta?.isNumeric ? "end" : undefined);
          return (
            <Table.Cell
              key={
                enableRowSelection
                  ? `${cell.id}-${isRowSelected(row, table.getState().rowSelection)}`
                  : `${cell.id}`
              }
              textAlign={textAlign}
              w={meta?.width}
              minW={meta?.minWidth}
              fontWeight={index === 0 ? "600" : undefined}
              py={"4"}
              px={"2"}
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </Table.Cell>
          );
        })}
      </Table.Row>
      {isOpenable && (
        <Table.Row key={`${stableKey}-details`}>
          <Table.Cell
            colSpan={table.getAllColumns().length}
            p={"0"}
            border={"none"}
            bg={{ base: "white", _dark: "gray.950" }}
          >
            {isOrder(row.original) && (
              <Collapsible.Root open={open} lazyMount={true}>
                <Collapsible.Content>
                  <OrderPreviewPanel
                    order={row.original}
                    storage={storage}
                    updateItemFulfillment={updateItemFulfillment}
                    updateItemInProgress={updateItemInProgress}
                    updateItemPriority={updateItemPriority}
                    onReportItemProblem={
                      onReportItemProblem
                        ? (_order, orderItem, existingProblem) =>
                            onReportItemProblem(
                              row.original,
                              orderItem,
                              existingProblem,
                            )
                        : undefined
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
                </Collapsible.Content>
              </Collapsible.Root>
            )}
          </Table.Cell>
        </Table.Row>
      )}
    </>
  );
};

function areCustomTrPropsEqual<Data extends object>(
  prevProps: CustomTrProps<Data>,
  nextProps: CustomTrProps<Data>,
) {
  const prevSelected = prevProps.enableRowSelection
    ? isRowSelected(
        prevProps.row,
        prevProps.enableRowSelection.rowSelection ?? {},
      )
    : false;
  const nextSelected = nextProps.enableRowSelection
    ? isRowSelected(
        nextProps.row,
        nextProps.enableRowSelection.rowSelection ?? {},
      )
    : false;

  return (
    prevProps.row.id === nextProps.row.id &&
    prevProps.row.original === nextProps.row.original &&
    prevSelected === nextSelected &&
    prevProps.isRowCollapsable === nextProps.isRowCollapsable &&
    prevProps.getRowColors === nextProps.getRowColors &&
    prevProps.showFiles === nextProps.showFiles &&
    prevProps.renderItemsSection === nextProps.renderItemsSection &&
    prevProps.tenantContext === nextProps.tenantContext &&
    prevProps.storage === nextProps.storage &&
    prevProps.i18n.resolvedLanguage === nextProps.i18n.resolvedLanguage
  );
}

export const CustomTr = memo(
  CustomTrComponent,
  areCustomTrPropsEqual,
) as typeof CustomTrComponent;
