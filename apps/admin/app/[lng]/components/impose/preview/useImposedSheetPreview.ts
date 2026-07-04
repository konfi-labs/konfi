"use client";

import type { ImposePreviewRequest } from "@konfi/wasm";
import {
  IMPOSITION_MAX_FILE_SIZE_BYTES,
  IMPOSITION_MAX_FILE_SIZE_MB,
} from "@konfi/types";
import { useEffect, useMemo, useState } from "react";
import type { RenderImposedSheetPreviewProgress } from "./render-imposed-sheet-preview";

export type UseImposedSheetPreviewParams = {
  file: File | null;
  previewHeight: number;
  previewRequest: ImposePreviewRequest | null;
  previewRequestKey: string | null;
  previewWidth: number;
  requestedPageNumbers: number[];
};

export type UseImposedSheetPreviewResult = {
  errorMessage: string | null;
  isLoading: boolean;
  pageCount: number;
  pageImages: Partial<Record<number, string>>;
  progressPercent: number | null;
};

const PDF_PREVIEW_SCALE_MULTIPLIER = 3;
const RENDERED_PREVIEW_MAX_DIRECT_UPLOAD_BYTES = IMPOSITION_MAX_FILE_SIZE_BYTES;
const RENDERED_PREVIEW_MAX_DIRECT_UPLOAD_MB = IMPOSITION_MAX_FILE_SIZE_MB;

function normalizeRequestedPageNumbers(
  pageNumbers: readonly number[],
): number[] {
  return Array.from(
    new Set(
      pageNumbers.filter(
        (pageNumber) => Number.isInteger(pageNumber) && pageNumber > 0,
      ),
    ),
  ).toSorted((left, right) => left - right);
}

function normalizeRenderedPageImages(
  pageImages: Record<string, string>,
): Partial<Record<number, string>> {
  const normalizedPageImages: Partial<Record<number, string>> = {};

  for (const [pageNumber, image] of Object.entries(pageImages)) {
    const numericPageNumber = Number.parseInt(pageNumber, 10);

    if (!Number.isInteger(numericPageNumber) || numericPageNumber <= 0) {
      continue;
    }

    normalizedPageImages[numericPageNumber] = image;
  }

  return normalizedPageImages;
}

export function useImposedSheetPreview({
  file,
  previewHeight,
  previewRequest,
  previewRequestKey,
  previewWidth,
  requestedPageNumbers,
}: UseImposedSheetPreviewParams): UseImposedSheetPreviewResult {
  const normalizedRequestedPageNumbers = useMemo(
    () => normalizeRequestedPageNumbers(requestedPageNumbers),
    [requestedPageNumbers],
  );
  const renderSignature = useMemo(() => {
    if (!file || !previewRequestKey) {
      return null;
    }

    return [
      previewRequestKey,
      file.name,
      file.size,
      file.lastModified,
      Math.round(previewHeight * PDF_PREVIEW_SCALE_MULTIPLIER),
      Math.round(previewWidth * PDF_PREVIEW_SCALE_MULTIPLIER),
    ].join(":");
  }, [file, previewHeight, previewRequestKey, previewWidth]);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [pageImages, setPageImages] = useState<Partial<Record<number, string>>>(
    {},
  );
  const [progressPercent, setProgressPercent] = useState<number | null>(null);

  useEffect(() => {
    if (!file || !previewRequest || !renderSignature) {
      setPageCount(0);
      setPageImages({});
      setErrorMessage(null);
      setIsLoading(false);
      setProgressPercent(null);
      return;
    }

    setPageCount(0);
    setPageImages({});
    setErrorMessage(null);
    setIsLoading(false);
    setProgressPercent(null);
  }, [file, previewRequest, renderSignature]);

  useEffect(() => {
    if (!file || !previewRequest || !renderSignature) {
      setIsLoading(false);
      setProgressPercent(null);
      return;
    }

    if (file.size > RENDERED_PREVIEW_MAX_DIRECT_UPLOAD_BYTES) {
      setErrorMessage(
        `Actual file preview is skipped for files larger than ${RENDERED_PREVIEW_MAX_DIRECT_UPLOAD_MB} MB.`,
      );
      setIsLoading(false);
      setProgressPercent(null);
      return;
    }

    if (normalizedRequestedPageNumbers.length === 0) {
      setIsLoading(false);
      setProgressPercent(null);
      return;
    }

    const missingPageNumbers = normalizedRequestedPageNumbers.filter(
      (pageNumber) =>
        (pageCount === 0 || pageNumber <= pageCount) &&
        pageImages[pageNumber] == null,
    );

    if (missingPageNumbers.length === 0) {
      setIsLoading(false);
      setProgressPercent(null);
      return;
    }

    let cancelled = false;
    const sourceFile = file;
    const currentPreviewRequest = previewRequest;
    const currentRenderSignature = renderSignature;

    async function fetchRenderedPages() {
      setIsLoading(true);
      setErrorMessage(null);
      setProgressPercent(0);

      try {
        const { renderImposedSheetPreview } =
          await import("./render-imposed-sheet-preview");
        const renderedPreview = await renderImposedSheetPreview({
          cacheKey: currentRenderSignature,
          file: sourceFile,
          onProgress: (progress: RenderImposedSheetPreviewProgress) => {
            if (!cancelled) {
              setProgressPercent(progress.progressPercent);
            }
          },
          pageNumbers: missingPageNumbers,
          previewHeight: Math.round(
            previewHeight * PDF_PREVIEW_SCALE_MULTIPLIER,
          ),
          previewRequest: currentPreviewRequest,
          previewWidth: Math.round(previewWidth * PDF_PREVIEW_SCALE_MULTIPLIER),
        });

        const normalizedPageImages = normalizeRenderedPageImages(
          renderedPreview.pageImages,
        );

        if (cancelled) {
          return;
        }

        setPageCount(renderedPreview.pageCount);
        setPageImages((current) => ({
          ...current,
          ...normalizedPageImages,
        }));
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to load the imposed sheet preview.",
        );
        setProgressPercent(null);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchRenderedPages();

    return () => {
      cancelled = true;
    };
  }, [
    file,
    normalizedRequestedPageNumbers,
    pageImages,
    pageCount,
    previewHeight,
    previewRequest,
    previewWidth,
    renderSignature,
  ]);

  return {
    errorMessage,
    isLoading,
    pageCount,
    pageImages,
    progressPercent,
  };
}
