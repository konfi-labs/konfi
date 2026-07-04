"use client";

import {
  Badge,
  Box,
  HStack,
  IconButton,
  Separator,
  Text,
} from "@chakra-ui/react";
import { type PaginationState } from "@tanstack/react-table";
import { isUndefined } from "es-toolkit";
import { type TFunction } from "i18next";
import { type ReactNode, useTransition } from "react";
import { MaterialSymbol } from "../MaterialSymbol";
import { PageSizeSelect } from "./PageSizeSelect";

export type ControlledPaginationProps = {
  show?: (
    type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST",
    limit: number,
  ) => Promise<void>;
  itemsCount?: number;
  leftContent?: ReactNode;
  loading?: boolean;
  onPageChange?: (
    type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST",
    pageIndex: number,
  ) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageCount: number;
  pagination: PaginationState;
  pageSizeOptions?: readonly number[];
  rightContent?: ReactNode;
  transparentBackground?: boolean;
  t: TFunction;
};

export const ControlledPagination = ({
  show,
  itemsCount,
  leftContent,
  loading,
  onPageChange,
  onPageSizeChange,
  pageCount,
  pagination,
  pageSizeOptions,
  rightContent,
  transparentBackground = false,
  t,
}: ControlledPaginationProps) => {
  const [isPending, startTransition] = useTransition();
  if (isUndefined(show)) return null;
  const canPreviousPage = pagination.pageIndex > 0;
  const canNextPage = pagination.pageIndex < pageCount - 1;

  function handleOnClick(
    type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST",
    index: number,
  ) {
    if (loading) return;
    onPageChange?.(type, index);
  }

  function handlePageSizeChange(pageSize: number) {
    if (loading || pageSize === pagination.pageSize) {
      return;
    }

    startTransition(() => {
      onPageSizeChange?.(pageSize);
    });
  }

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
              itemCount: itemsCount ?? 0,
            })}
          </Badge>
          {pageSizeOptions ? (
            <PageSizeSelect
              disabled={loading || isPending}
              onChange={handlePageSizeChange}
              options={pageSizeOptions}
              t={t}
              value={pagination.pageSize}
            />
          ) : (
            <Badge variant={"surface"} px={2}>
              {t("pagination.perPage", {
                defaultValue: "{{rowCount}}/Page",
                rowCount: pagination.pageSize,
              })}
            </Badge>
          )}
          {leftContent}
        </HStack>
        <HStack flexWrap="wrap" gap="2" justifyContent="end" minW={0}>
          <IconButton
            aria-label={t("pagination.first", { defaultValue: "First page" })}
            onClick={() => startTransition(() => handleOnClick("FIRST", 0))}
            disabled={!canPreviousPage}
            loading={loading || isPending}
            size={"sm"}
            variant={"outline"}
          >
            <MaterialSymbol>keyboard_double_arrow_left</MaterialSymbol>
          </IconButton>
          <IconButton
            aria-label={t("pagination.previous", { defaultValue: "Previous" })}
            onClick={() =>
              startTransition(() =>
                handleOnClick("PREVIOUS", pagination.pageIndex - 1),
              )
            }
            disabled={!canPreviousPage}
            loading={loading || isPending}
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
            onClick={() =>
              startTransition(() =>
                handleOnClick("NEXT", pagination.pageIndex + 1),
              )
            }
            disabled={!canNextPage}
            loading={loading || isPending}
            size={"sm"}
            variant={"outline"}
          >
            <MaterialSymbol>chevron_right</MaterialSymbol>
          </IconButton>
          <IconButton
            aria-label={t("pagination.last", { defaultValue: "Last page" })}
            onClick={() =>
              startTransition(() => handleOnClick("LAST", pageCount - 1))
            }
            disabled={!canNextPage}
            loading={loading || isPending}
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
