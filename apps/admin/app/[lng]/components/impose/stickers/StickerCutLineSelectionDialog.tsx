"use client";

import { useT } from "@/i18n/client";
import type { StickerImpositionItem } from "@/lib/sticker-imposition/types";
import {
  inspectPdfCutLineCandidatesFromBytes,
  type PdfCutLineCandidate,
} from "@konfi/wasm/browser";
import {
  Badge,
  Box,
  Button,
  CloseButton,
  Dialog,
  HStack,
  Portal,
  Switch,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { useCallback, useMemo, useState } from "react";

type StickerCutLineSelectionDialogProps = {
  file: File;
  item: StickerImpositionItem;
  onItemChange: (itemId: string, patch: Partial<StickerImpositionItem>) => void;
};

function formatBounds(candidate: PdfCutLineCandidate): string {
  const { bounds } = candidate;

  return `${bounds.widthMm.toFixed(2)} × ${bounds.heightMm.toFixed(2)} mm`;
}

function CutLineCandidatePreview({
  candidate,
}: {
  candidate: PdfCutLineCandidate;
}) {
  const viewBoxWidth = Math.max(
    candidate.pageWidthMm,
    candidate.bounds.widthMm,
    1,
  );
  const viewBoxHeight = Math.max(
    candidate.pageHeightMm,
    candidate.bounds.heightMm,
    1,
  );

  return (
    <Box
      borderWidth="1px"
      borderColor="gray.muted"
      borderRadius="md"
      bg={{ base: "white", _dark: "gray.950" }}
      w="5.5rem"
      h="4rem"
      p={1.5}
      flexShrink={0}
    >
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
      >
        <rect
          x="0"
          y="0"
          width={viewBoxWidth}
          height={viewBoxHeight}
          fill="none"
          stroke="currentColor"
          strokeDasharray="2 2"
          strokeOpacity="0.22"
          strokeWidth="0.6"
        />
        {candidate.previewPath ? (
          <path
            d={candidate.previewPath}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
          />
        ) : (
          <rect
            x={candidate.bounds.xMm}
            y={candidate.bounds.yMm}
            width={candidate.bounds.widthMm}
            height={candidate.bounds.heightMm}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </Box>
  );
}

export function StickerCutLineSelectionDialog({
  file,
  item,
  onItemChange,
}: StickerCutLineSelectionDialogProps) {
  const { t } = useT(["impose", "translation"]);
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<PdfCutLineCandidate[] | null>(
    null,
  );
  const [draftSelectedIds, setDraftSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedCount = item.selectedPdfCutLineIds?.length ?? 0;
  const selectedIds = useMemo(
    () => new Set(draftSelectedIds),
    [draftSelectedIds],
  );

  const loadCandidates = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const nextCandidates = (
        await inspectPdfCutLineCandidatesFromBytes(bytes)
      ).filter((candidate) => candidate.pageNumber === item.pageNumber);
      setCandidates(nextCandidates);
      setDraftSelectedIds((currentIds) => {
        if (
          currentIds.length > 0 ||
          (item.selectedPdfCutLineIds?.length ?? 0) > 0
        ) {
          return currentIds;
        }

        return nextCandidates
          .filter((candidate) => candidate.suggested)
          .map((candidate) => candidate.id);
      });
    } catch (candidateError) {
      setError(
        candidateError instanceof Error
          ? candidateError.message
          : String(candidateError),
      );
    } finally {
      setIsLoading(false);
    }
  }, [file, item.pageNumber, item.selectedPdfCutLineIds?.length]);

  const handleOpenChange = useCallback(
    ({ open: nextOpen }: { open: boolean }) => {
      setOpen(nextOpen);
      if (!nextOpen) {
        return;
      }

      setDraftSelectedIds(item.selectedPdfCutLineIds ?? []);
      if (candidates === null) {
        void loadCandidates();
      }
    },
    [candidates, item.selectedPdfCutLineIds, loadCandidates],
  );

  const toggleCandidate = useCallback((candidateId: string) => {
    setDraftSelectedIds((currentIds) =>
      currentIds.includes(candidateId)
        ? currentIds.filter((id) => id !== candidateId)
        : [...currentIds, candidateId],
    );
  }, []);

  const applySelection = useCallback(
    (nextIds: string[]) => {
      onItemChange(item.id, {
        selectedPdfCutLineIds: nextIds,
      });
      setOpen(false);
    },
    [item.id, onItemChange],
  );

  return (
    <Dialog.Root
      lazyMount
      open={open}
      onOpenChange={handleOpenChange}
      scrollBehavior="inside"
      size={{ base: "sm", md: "lg" }}
    >
      <Dialog.Trigger asChild>
        <Button size="sm" variant="outline" justifyContent="space-between">
          <HStack gap={2} minW={0}>
            <MaterialSymbol>polyline</MaterialSymbol>
            <Text truncate>
              {t("impose.stickers.cutLines.open", {
                defaultValue: "Select Cut Lines",
              })}
            </Text>
          </HStack>
          {selectedCount > 0 ? (
            <Badge colorPalette="primary" borderRadius="full">
              {selectedCount}
            </Badge>
          ) : null}
        </Button>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxH={{ base: "calc(100dvh - 2rem)", md: "42rem" }}>
            <Dialog.Header>
              <Dialog.Title>
                {t("impose.stickers.cutLines.title", {
                  defaultValue: "PDF Cut Lines",
                })}
              </Dialog.Title>
              <Dialog.Description>
                {t("impose.stickers.cutLines.description", {
                  defaultValue:
                    "Choose the PDF paths that should be exported as plotter cut lines.",
                })}
              </Dialog.Description>
            </Dialog.Header>
            <Dialog.Body>
              <VStack align="stretch" gap={3}>
                {error ? (
                  <Box
                    borderWidth="1px"
                    borderColor="orange.muted"
                    bg="orange.subtle"
                    borderRadius="xl"
                    px={3}
                    py={2}
                    aria-live="polite"
                  >
                    <Text fontSize="sm">{error}</Text>
                  </Box>
                ) : null}
                {isLoading ? (
                  <HStack color="fg.muted" gap={2}>
                    <MaterialSymbol>progress_activity</MaterialSymbol>
                    <Text fontSize="sm">
                      {t("impose.stickers.cutLines.loading", {
                        defaultValue: "Reading PDF paths…",
                      })}
                    </Text>
                  </HStack>
                ) : null}
                {!isLoading && candidates?.length === 0 ? (
                  <Box
                    borderWidth="1px"
                    borderStyle="dashed"
                    borderColor="gray.muted"
                    borderRadius="xl"
                    p={4}
                    color="fg.muted"
                  >
                    <Text fontSize="sm">
                      {t("impose.stickers.cutLines.empty", {
                        defaultValue:
                          "No stroked vector paths were found on this PDF page.",
                      })}
                    </Text>
                  </Box>
                ) : null}
                {candidates?.map((candidate) => (
                  <HStack
                    key={candidate.id}
                    borderWidth="1px"
                    borderColor="gray.muted"
                    borderRadius="xl"
                    p={3}
                    gap={3}
                    align="center"
                  >
                    <CutLineCandidatePreview candidate={candidate} />
                    <VStack align="stretch" gap={1} minW={0} flex="1">
                      <HStack gap={2} wrap="wrap">
                        <Text fontWeight="medium" fontSize="sm">
                          {t("impose.stickers.cutLines.candidate", {
                            defaultValue: "Object {{index}}",
                            index: candidate.operationIndex,
                          })}
                        </Text>
                        {candidate.suggested ? (
                          <Badge colorPalette="green" borderRadius="full">
                            {t("impose.stickers.cutLines.suggested", {
                              defaultValue: "Suggested",
                            })}
                          </Badge>
                        ) : null}
                      </HStack>
                      <Text fontSize="xs" color="fg.muted">
                        {t("impose.stickers.cutLines.bounds", {
                          bounds: formatBounds(candidate),
                          defaultValue: "{{bounds}}, page {{page}}",
                          page: candidate.pageNumber,
                        })}
                      </Text>
                    </VStack>
                    <Switch.Root
                      checked={selectedIds.has(candidate.id)}
                      colorPalette="primary"
                      size="sm"
                      flexShrink={0}
                      aria-label={t("impose.stickers.cutLines.toggle", {
                        defaultValue: "Use object {{index}} as a cut line",
                        index: candidate.operationIndex,
                      })}
                      onCheckedChange={() => toggleCandidate(candidate.id)}
                    >
                      <Switch.HiddenInput />
                      <Switch.Control />
                    </Switch.Root>
                  </HStack>
                ))}
              </VStack>
            </Dialog.Body>
            <Dialog.Footer>
              <Button
                variant="ghost"
                onClick={() => applySelection([])}
                disabled={selectedCount === 0 && draftSelectedIds.length === 0}
              >
                {t("impose.stickers.cutLines.clear", {
                  defaultValue: "Clear",
                })}
              </Button>
              <Dialog.ActionTrigger asChild>
                <Button variant="outline">
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </Button>
              </Dialog.ActionTrigger>
              <Button
                colorPalette="primary"
                onClick={() => applySelection(draftSelectedIds)}
              >
                {t("impose.stickers.cutLines.apply", {
                  defaultValue: "Use Selected",
                })}
              </Button>
            </Dialog.Footer>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
