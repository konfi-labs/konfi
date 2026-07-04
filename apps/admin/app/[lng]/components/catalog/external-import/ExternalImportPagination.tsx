"use client";

import {
  Badge,
  Box,
  HStack,
  IconButton,
  Separator,
  Text,
} from "@chakra-ui/react";
import { MaterialSymbol, PageSizeSelect } from "@konfi/components";
import type { TranslateFn } from "./types";

type ExternalImportPaginationProps = {
  disabled?: boolean;
  itemsCount: number;
  pageCount: number;
  pageIndex: number;
  pageSize: number;
  pageSizeOptions: readonly number[];
  t: TranslateFn;
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export default function ExternalImportPagination({
  disabled = false,
  itemsCount,
  pageCount,
  pageIndex,
  pageSize,
  pageSizeOptions,
  t,
  onPageChange,
  onPageSizeChange,
}: ExternalImportPaginationProps) {
  const canPreviousPage = !disabled && pageIndex > 0;
  const canNextPage = !disabled && pageIndex < pageCount - 1;

  return (
    <Box
      w="100%"
      bg="bg.subtle"
      borderColor="border.subtle"
      borderRadius="3xl"
      borderWidth="1px"
      p={{ base: 3, xl: 4 }}
    >
      <HStack w="100%" justifyContent="space-between" gap="3" flexWrap="wrap">
        <HStack flex="1 1 240px" flexWrap="wrap" gap="2" minW={0}>
          <Badge variant="surface" px={2}>
            {t("pagination.itemsCount", {
              defaultValue: "Count: {{itemCount}}",
              itemCount: itemsCount,
            })}
          </Badge>
          <PageSizeSelect
            disabled={disabled}
            onChange={onPageSizeChange}
            options={pageSizeOptions}
            t={t}
            value={pageSize}
          />
        </HStack>

        <HStack flexWrap="wrap" gap="2" justifyContent="end" minW={0}>
          <IconButton
            aria-label={t("pagination.first", { defaultValue: "First page" })}
            onClick={() => onPageChange(0)}
            disabled={!canPreviousPage}
            size="sm"
            variant="outline"
          >
            <MaterialSymbol>keyboard_double_arrow_left</MaterialSymbol>
          </IconButton>
          <IconButton
            aria-label={t("pagination.previous", { defaultValue: "Previous" })}
            onClick={() => onPageChange(Math.max(pageIndex - 1, 0))}
            disabled={!canPreviousPage}
            size="sm"
            variant="outline"
          >
            <MaterialSymbol>chevron_left</MaterialSymbol>
          </IconButton>
          <Text>
            {t("pagination.page", { defaultValue: "Page" })}
            <strong>
              {` ${pageIndex + 1} ${t("pagination.of", { defaultValue: "of" })} ${pageCount}`}
            </strong>
          </Text>
          <IconButton
            aria-label={t("pagination.next", { defaultValue: "Next" })}
            onClick={() => onPageChange(Math.min(pageIndex + 1, pageCount - 1))}
            disabled={!canNextPage}
            size="sm"
            variant="outline"
          >
            <MaterialSymbol>chevron_right</MaterialSymbol>
          </IconButton>
          <IconButton
            aria-label={t("pagination.last", { defaultValue: "Last page" })}
            onClick={() => onPageChange(pageCount - 1)}
            disabled={!canNextPage}
            size="sm"
            variant="outline"
          >
            <MaterialSymbol>keyboard_double_arrow_right</MaterialSymbol>
          </IconButton>
          <Separator orientation="vertical" height="4" mx={2} />
        </HStack>
      </HStack>
    </Box>
  );
}
