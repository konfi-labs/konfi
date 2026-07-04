"use client";

import { Badge, HStack, IconButton, Text } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { MaterialSymbol } from "../MaterialSymbol";

export type CursorPaginationProps = {
  t: TFunction;
  page: number;
  hasMore: boolean;
  itemsCount: number;
  pageSize: number;
  loading?: boolean;
  onFirst: () => void;
  onPrevious: () => void;
  onNext: () => void;
};

export const CursorPagination = ({
  t,
  page,
  hasMore,
  itemsCount,
  pageSize,
  loading,
  onFirst,
  onPrevious,
  onNext,
}: CursorPaginationProps) => {
  const canPreviousPage = page > 0;
  const canNextPage = hasMore;

  return (
    <HStack w="100%" justifyContent="space-between">
      <Badge variant="surface" px={2}>
        {t("pagination.itemsCount", {
          defaultValue: "Count: {{itemCount}}",
          itemCount: itemsCount,
        })}
      </Badge>
      <HStack>
        <IconButton
          aria-label={t("pagination.first", { defaultValue: "First page" })}
          onClick={onFirst}
          disabled={!canPreviousPage || loading}
          loading={loading}
          size="sm"
          variant="outline"
        >
          <MaterialSymbol>
            keyboard_double_arrow_left
          </MaterialSymbol>
        </IconButton>
        <IconButton
          aria-label={t("pagination.previous", { defaultValue: "Previous" })}
          onClick={onPrevious}
          disabled={!canPreviousPage || loading}
          loading={loading}
          size="sm"
          variant="outline"
        >
          <MaterialSymbol>chevron_left</MaterialSymbol>
        </IconButton>
        <Text>
          {t("pagination.page", { defaultValue: "Page" })}
          <strong>{` ${page + 1}`}</strong>
        </Text>
        <IconButton
          aria-label={t("pagination.next", { defaultValue: "Next" })}
          onClick={onNext}
          disabled={!canNextPage || loading}
          loading={loading}
          size="sm"
          variant="outline"
        >
          <MaterialSymbol>chevron_right</MaterialSymbol>
        </IconButton>
      </HStack>
      <Badge variant="surface" px={2}>
        {t("pagination.perPage", {
          defaultValue: "{{rowCount}}/Page",
          rowCount: pageSize,
        })}
      </Badge>
    </HStack>
  );
};
