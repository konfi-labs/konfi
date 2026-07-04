"use client";

import {
  Badge,
  Box,
  HStack,
  IconButton,
  Separator,
  Text,
} from "@chakra-ui/react";
import { type PaginationState, type Table } from "@tanstack/react-table";
import { type Dispatch, type ReactNode, type SetStateAction } from "react";
import { type TFunction } from "i18next";
import { MaterialSymbol } from "../MaterialSymbol";
import { PageSizeSelect } from "./PageSizeSelect";

export type UncontrolledPagination<Data extends object> = {
  leftContent?: ReactNode;
  table: Table<Data>;
  t: TFunction;
  pagination: PaginationState;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
  pageCount: number;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
  rightContent?: ReactNode;
  transparentBackground?: boolean;
};

export const UncontrolledPagination = <Data extends object>({
  leftContent,
  table,
  t,
  pagination,
  setPagination,
  pageCount,
  onPageSizeChange,
  pageSizeOptions,
  rightContent,
  transparentBackground = false,
}: UncontrolledPagination<Data>) => {
  const canPreviousPage = pagination.pageIndex > 0;
  const canNextPage = pagination.pageIndex < pageCount - 1;

  const handleSetPageIndex = (index: number) => {
    setPagination((prev) => ({ ...prev, pageIndex: index }));
  };

  const handleNext = () => {
    setPagination((prev) => ({
      ...prev,
      pageIndex: Math.min(prev.pageIndex + 1, pageCount - 1),
    }));
  };

  const handlePrevious = () => {
    setPagination((prev) => ({
      ...prev,
      pageIndex: Math.max(prev.pageIndex - 1, 0),
    }));
  };

  const handlePageSizeChange = (pageSize: number) => {
    setPagination({ pageIndex: 0, pageSize });
    onPageSizeChange?.(pageSize);
  };

  return (
    <Box
      w={"100%"}
      bg={transparentBackground ? "transparent" : "bg.subtle"}
      borderColor={transparentBackground ? "transparent" : "border.subtle"}
      borderRadius="3xl"
      borderWidth="1px"
      p={transparentBackground ? 0 : { base: 3, xl: 4 }}
    >
      <HStack w={"100%"} justifyContent="space-between" gap="3" flexWrap="wrap">
        <HStack flex="1 1 240px" flexWrap="wrap" gap="2" minW={0}>
          <Badge variant={"surface"} px={2}>
            {t("pagination.itemsCount", {
              defaultValue: "Count: {{itemCount}}",
              itemCount: table.getRowCount() ?? 0,
            })}
          </Badge>
          {pageSizeOptions ? (
            <PageSizeSelect
              onChange={handlePageSizeChange}
              options={pageSizeOptions}
              t={t}
              value={table.getState().pagination.pageSize}
            />
          ) : (
            <Badge variant={"surface"} px={2}>
              {t("pagination.perPage", {
                defaultValue: "{{rowCount}}/Page",
                rowCount: table.getState().pagination.pageSize,
              })}
            </Badge>
          )}
          {leftContent}
        </HStack>
        <HStack flexWrap="wrap" gap="2" justifyContent="end" minW={0}>
          <IconButton
            aria-label={t("pagination.first", { defaultValue: "First page" })}
            onClick={() => handleSetPageIndex(0)}
            disabled={!canPreviousPage}
            size={"sm"}
            variant={"outline"}
          >
            <MaterialSymbol>keyboard_double_arrow_left</MaterialSymbol>
          </IconButton>
          <IconButton
            aria-label={t("pagination.previous", { defaultValue: "Previous" })}
            onClick={handlePrevious}
            disabled={!canPreviousPage}
            size={"sm"}
            variant={"outline"}
          >
            <MaterialSymbol>chevron_left</MaterialSymbol>
          </IconButton>
          <Text>
            {t("pagination.page", { defaultValue: "Page" })}
            <strong>
              {` ${pagination.pageIndex + 1} ${t("pagination.of", { defaultValue: "of" })} ${pageCount}`}
            </strong>
          </Text>
          <IconButton
            aria-label={t("pagination.next", { defaultValue: "Next" })}
            onClick={handleNext}
            disabled={!canNextPage}
            size={"sm"}
            variant={"outline"}
          >
            <MaterialSymbol>chevron_right</MaterialSymbol>
          </IconButton>
          <IconButton
            aria-label={t("pagination.last", { defaultValue: "Last page" })}
            onClick={() => handleSetPageIndex(Math.max(pageCount - 1, 0))}
            disabled={!canNextPage}
            size={"sm"}
            variant={"outline"}
          >
            <MaterialSymbol>keyboard_double_arrow_right</MaterialSymbol>
          </IconButton>
          <Separator orientation="vertical" height="4" mx={2} />
          {rightContent}
        </HStack>
      </HStack>
    </Box>
  );
};
