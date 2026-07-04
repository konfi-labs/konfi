"use client";

import { Card, Skeleton, VStack } from "@chakra-ui/react";
import type { Attribute } from "@konfi/types";
import { memo, useEffect, useMemo, useState } from "react";
import ExternalImportPagination from "./ExternalImportPagination";
import ExternalProductCard from "./ExternalProductCard";
import type { ExternalProductWithId, TranslateFn } from "./types";

const IMPORTED_PRODUCT_PAGE_SIZE_OPTIONS = [5, 10, 25, 50] as const;

type ImportedProductsListProps = {
  externalProducts: ExternalProductWithId[];
  loading: boolean;
  onDeleteProduct: (id: string) => void;
  onProductsRefresh: () => void;
  onAttributesRefresh: () => void;
  internalAttributes: Attribute[];
  t: TranslateFn;
};

const ImportedProductsList = memo(function ImportedProductsList({
  externalProducts,
  loading,
  onDeleteProduct,
  onProductsRefresh,
  onAttributesRefresh,
  internalAttributes,
  t,
}: ImportedProductsListProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState<number>(
    IMPORTED_PRODUCT_PAGE_SIZE_OPTIONS[0],
  );

  const pageCount = Math.max(1, Math.ceil(externalProducts.length / pageSize));
  const boundedPageIndex = Math.min(pageIndex, pageCount - 1);
  const paginatedExternalProducts = useMemo(() => {
    const start = boundedPageIndex * pageSize;
    return externalProducts.slice(start, start + pageSize);
  }, [boundedPageIndex, externalProducts, pageSize]);

  useEffect(() => {
    if (pageIndex !== boundedPageIndex) {
      setPageIndex(boundedPageIndex);
    }
  }, [boundedPageIndex, pageIndex]);

  if (loading && externalProducts.length === 0) {
    return (
      <Card.Root>
        <Card.Header>
          <Card.Title>
            {t("externalProducts.listTitle", {
              defaultValue: "Imported Products",
            })}
          </Card.Title>
        </Card.Header>
        <Card.Body>
          <VStack gap={3} alignItems="stretch">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} h="32" borderRadius="2xl" />
            ))}
          </VStack>
        </Card.Body>
      </Card.Root>
    );
  }

  if (externalProducts.length === 0) {
    return null;
  }

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>
          {t("externalProducts.listTitle", {
            defaultValue: "Imported Products",
          })}
        </Card.Title>
      </Card.Header>
      <Card.Body>
        <VStack gap={3} alignItems="stretch">
          {paginatedExternalProducts.map((product) => (
            <ExternalProductCard
              key={product.id}
              product={product}
              onDelete={onDeleteProduct}
              onMappingsUpdated={onProductsRefresh}
              onAttributesRefresh={onAttributesRefresh}
              internalAttributes={internalAttributes}
              t={t}
            />
          ))}
          <ExternalImportPagination
            itemsCount={externalProducts.length}
            pageCount={pageCount}
            pageIndex={boundedPageIndex}
            pageSize={pageSize}
            pageSizeOptions={IMPORTED_PRODUCT_PAGE_SIZE_OPTIONS}
            t={t}
            onPageChange={setPageIndex}
            onPageSizeChange={(nextPageSize) => {
              setPageIndex(0);
              setPageSize(nextPageSize);
            }}
          />
        </VStack>
      </Card.Body>
    </Card.Root>
  );
});

export default ImportedProductsList;
