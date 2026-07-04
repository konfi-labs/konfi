"use client";

import { useWhatsNew } from "@/context/whatsNew";
import { useT } from "@/i18n/client";
import {
  Box,
  Button,
  CloseButton,
  Dialog,
  HStack,
  Progress,
  ScrollArea,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol, ScrollToBottom } from "@konfi/components";
import { DEFAULT_LOCALE } from "@konfi/types";
import { SCROLL_MASK_CSS } from "@konfi/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStickToBottom } from "use-stick-to-bottom";
import WhatsNewChangeCard from "./WhatsNewChangeCard";

export default function WhatsNewDialog() {
  const { t, i18n } = useT();
  const { isDialogOpen, closeDialog, changes } = useWhatsNew();
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [currentIndex, setCurrentIndex] = useState(0);
  const sticky = useStickToBottom({ initial: false });
  const stopScroll = sticky.stopScroll;
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const [isScrollable, setIsScrollable] = useState(false);

  const resolvedLocale = useMemo(
    () => i18n.resolvedLanguage?.split("-")[0] ?? DEFAULT_LOCALE,
    [i18n.resolvedLanguage],
  );

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LOCALE, {
        dateStyle: "medium",
      }),
    [i18n.resolvedLanguage],
  );

  const checkScrollable = useCallback(() => {
    const viewport = scrollViewportRef.current;
    if (!viewport) return;

    setIsScrollable(viewport.scrollHeight > viewport.clientHeight);
  }, []);

  useEffect(() => {
    checkScrollable();
  }, [changes, checkScrollable, currentIndex]);

  useEffect(() => {
    if (isDialogOpen) {
      stopScroll();
      setCurrentIndex(0);
    }
  }, [isDialogOpen, stopScroll]);

  useEffect(() => {
    stopScroll();
  }, [currentIndex, stopScroll]);

  useEffect(() => {
    const handleResize = () => checkScrollable();

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [checkScrollable]);

  useEffect(() => {
    const viewport = scrollViewportRef.current;
    const content = scrollContentRef.current;
    if (!viewport || !content) return;

    const observer = new ResizeObserver(checkScrollable);
    observer.observe(viewport);
    observer.observe(content);

    return () => observer.disconnect();
  }, [checkScrollable, currentIndex]);

  const handleImageError = (changeId: string) => {
    setImageErrors((prev) => new Set(prev).add(changeId));
  };

  const currentChange = changes[currentIndex];
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < changes.length - 1;

  const handlePrevious = () => {
    if (hasPrevious) setCurrentIndex((prev) => prev - 1);
  };

  const handleNext = () => {
    if (hasNext) setCurrentIndex((prev) => prev + 1);
  };

  const progressValue = changes.length
    ? ((currentIndex + 1) / changes.length) * 100
    : 0;

  return (
    <Dialog.Root
      open={isDialogOpen}
      onOpenChange={(e) => {
        if (!e.open) {
          closeDialog();
        }
      }}
      size="lg"
      placement="center"
    >
      <Dialog.Backdrop backdropFilter="blur(5px)" />
      <Dialog.Positioner px={{ base: 3, md: 6 }} py={{ base: 3, md: 8 }}>
        <Dialog.Content
          maxW="45rem"
          maxH="calc(100vh - 4rem)"
          display="flex"
          flexDirection="column"
          overflow="hidden"
          borderRadius="3xl"
          shadow="2xl"
        >
          <Dialog.Header
            px={{ base: 5, md: 7 }}
            pt={{ base: 5, md: 6 }}
            pb={4}
            borderBottomWidth="1px"
            bg="bg.subtle"
          >
            <VStack alignItems="stretch" gap={4} w="full" minW={0}>
              <HStack justifyContent="space-between" gap={4} minW={0}>
                <Box minW={0}>
                  <Dialog.Title
                    fontSize={{ base: "lg", md: "xl" }}
                    lineHeight="short"
                  >
                    {t("whatsNew.title", { defaultValue: "What's New" })}
                  </Dialog.Title>
                  {changes.length > 0 && (
                    <Text fontSize="sm" color="fg.muted" mt={1}>
                      {t("whatsNew.progress", {
                        defaultValue: "{{current}} of {{total}} updates",
                        current: currentIndex + 1,
                        total: changes.length,
                      })}
                    </Text>
                  )}
                </Box>
              </HStack>
              {changes.length > 1 && (
                <Progress.Root
                  value={progressValue}
                  size="xs"
                  colorPalette="primary"
                  aria-label={t("whatsNew.progressLabel", {
                    defaultValue: "Update progress",
                  })}
                >
                  <Progress.Track>
                    <Progress.Range />
                  </Progress.Track>
                </Progress.Root>
              )}
            </VStack>
          </Dialog.Header>
          <Dialog.CloseTrigger asChild>
            <CloseButton
              size="sm"
              aria-label={t("common.close", { defaultValue: "Close" })}
            />
          </Dialog.CloseTrigger>
          <Dialog.Body
            flex={1}
            minH={0}
            p={0}
            display="flex"
            flexDirection="column"
            overscrollBehavior="contain"
          >
            <ScrollArea.Root flex={1} minH={0} position="relative">
              <ScrollArea.Viewport
                css={isScrollable ? SCROLL_MASK_CSS : undefined}
                ref={(node: HTMLDivElement | null) => {
                  sticky.scrollRef(node);
                  scrollViewportRef.current = node;
                }}
                h="full"
                overflowX="hidden"
                overscrollBehavior="contain"
                p={4}
              >
                <ScrollArea.Content
                  ref={(node: HTMLDivElement | null) => {
                    sticky.contentRef(node);
                    scrollContentRef.current = node;
                  }}
                >
                  {changes.length === 0 ? (
                    <Text color="fg.muted" p={2}>
                      {t("whatsNew.noChanges", {
                        defaultValue: "No recent updates available.",
                      })}
                    </Text>
                  ) : currentChange ? (
                    <WhatsNewChangeCard
                      change={currentChange}
                      dateFormatter={dateFormatter}
                      imageErrors={imageErrors}
                      onImageError={handleImageError}
                      resolvedLocale={resolvedLocale}
                      t={t}
                    />
                  ) : null}
                </ScrollArea.Content>
              </ScrollArea.Viewport>
              <ScrollToBottom sticky={sticky} t={t} />
            </ScrollArea.Root>
          </Dialog.Body>
          <Dialog.Footer
            px={{ base: 5, md: 7 }}
            py={4}
            borderTopWidth="1px"
            bg="bg.panel"
          >
            <HStack justify="space-between" w="full">
              <Button
                onClick={handlePrevious}
                disabled={!hasPrevious}
                variant="ghost"
                size="sm"
                gap={2}
              >
                <MaterialSymbol>chevron_left</MaterialSymbol>
                <Text as="span">
                  {t("common.previous", { defaultValue: "Previous" })}
                </Text>
              </Button>
              <Button
                onClick={handleNext}
                disabled={!hasNext}
                variant={hasNext ? "solid" : "ghost"}
                colorPalette={hasNext ? "primary" : undefined}
                size="sm"
                gap={2}
              >
                <Text as="span">
                  {t("common.next", { defaultValue: "Next" })}
                </Text>
                <MaterialSymbol>chevron_right</MaterialSymbol>
              </Button>
            </HStack>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
