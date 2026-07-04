"use client";

import { Box, Button, HStack, Text, VStack } from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import {
  Preview3D,
  type Preview3DTemplate,
  resolvePreview3DTemplate,
} from "@konfi/preview3d";
import { useEffect, useState } from "react";

export interface Cart3DPreviewProps {
  fallbackMessage: string;
  height: number;
  nextPageLabel: string;
  pageCount?: number | null;
  pageLabel: string;
  previousPageLabel: string;
  previewURLs: string[];
  template?: Preview3DTemplate | string | null;
  width: number;
}

export function isCartWebGLAvailable(): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  const canvas = document.createElement("canvas");
  const context =
    canvas.getContext("webgl2") ??
    canvas.getContext("webgl") ??
    canvas.getContext("experimental-webgl");

  return Boolean(context);
}

export function Cart3DPreview({
  fallbackMessage,
  height,
  nextPageLabel,
  pageCount,
  pageLabel,
  previousPageLabel,
  previewURLs,
  template,
  width,
}: Cart3DPreviewProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [canRenderPreview3D] = useState(() => isCartWebGLAvailable());
  const normalizedPageCount = Math.max(1, Math.floor(pageCount ?? 1));
  const resolvedTemplate = resolvePreview3DTemplate(template, pageCount);
  const showPageControls =
    resolvedTemplate === "BOOKLET" && normalizedPageCount > 1;

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, normalizedPageCount));
  }, [normalizedPageCount]);

  return (
    <VStack align="stretch" h="100%" gap={3}>
      <Box flex="1" minH={0}>
        {canRenderPreview3D ? (
          <Preview3D
            currentPage={currentPage}
            fallbackMessage={fallbackMessage}
            height={height}
            pageCount={pageCount}
            previewURLs={previewURLs}
            template={template}
            width={width}
          />
        ) : (
          <Box
            alignContent="center"
            bg="bg.muted"
            borderRadius="md"
            color="fg.muted"
            h="100%"
            minH="180px"
            px={4}
            textAlign="center"
          >
            <Text fontSize="sm">{fallbackMessage}</Text>
          </Box>
        )}
      </Box>
      {showPageControls && (
        <HStack justify="space-between" gap={3}>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={currentPage <= 1}
          >
            <MaterialSymbol>chevron_left</MaterialSymbol>
            {previousPageLabel}
          </Button>
          <Text color="fg.muted" fontSize="sm" whiteSpace="nowrap">
            {pageLabel} {currentPage}/{normalizedPageCount}
          </Text>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setCurrentPage((page) => Math.min(normalizedPageCount, page + 1))
            }
            disabled={currentPage >= normalizedPageCount}
          >
            {nextPageLabel}
            <MaterialSymbol>chevron_right</MaterialSymbol>
          </Button>
        </HStack>
      )}
    </VStack>
  );
}
