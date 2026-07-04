"use client";

import { useAuth } from "@/context/auth";
import { useT } from "@/i18n/client";
import { CloseButton, MaterialSymbol } from "@konfi/components";
import {
  Badge,
  Box,
  Button,
  Dialog,
  HStack,
  Portal,
  Text,
  VStack,
} from "@chakra-ui/react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ProductImageGenerationPanelContent from "./ProductImageGenerationPanelContent";
import type { ProductImageGenerationPanelProps } from "./ProductImageGenerationPanel.types";
import { useProductImageGenerationPanel } from "./useProductImageGenerationPanel";

export default function ProductImageGenerationPanel(
  props: ProductImageGenerationPanelProps,
) {
  const { t, i18n } = useT();
  const { loading, user, redirect } = useAuth();
  const { presentation = "inline" } = props;
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { enabled, triggerStatusKey, contentProps } =
    useProductImageGenerationPanel(props);
  const activeGenerationProgress = contentProps.generationProgress;
  const hasGeneratedResult = contentProps.result != null;

  if (!enabled) {
    return null;
  }

  const content = <ProductImageGenerationPanelContent {...contentProps} />;

  if (presentation === "inline") {
    return content;
  }

  const redirectToLogin = () => {
    const nextRoute = `${window.location.pathname}${window.location.search}`;
    redirect(nextRoute);
    router.push(`/${i18n.resolvedLanguage ?? "en"}/auth/login` as Route);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={({ open: nextOpen }) => {
        if (!nextOpen) {
          setOpen(false);
          return;
        }

        if (loading) {
          return;
        }

        if (!user || user.isAnonymous) {
          redirectToLogin();
          return;
        }

        setOpen(true);
      }}
      lazyMount
      placement="center"
    >
      <Dialog.Trigger asChild>
        <Button
          variant="ai"
          h="auto"
          borderRadius="3xl"
          py={4}
          textAlign="left"
        >
          <HStack w="full" align="start" gap={4}>
            <Box
              flexShrink={0}
              borderRadius="2xl"
              bg="whiteAlpha.200"
              p={3}
              boxShadow="inset 0 1px 0 rgba(255,255,255,0.2)"
            >
              <MaterialSymbol fontSize="1.4rem">auto_awesome</MaterialSymbol>
            </Box>
            <VStack align="stretch" gap={2} minW={0} flex="1">
              <HStack gap={2} flexWrap="wrap">
                <Badge borderRadius="full">
                  {t("products.imageGeneration.openButton", {
                    defaultValue: "Open AI graphic studio",
                  })}
                </Badge>
                <Badge borderRadius="full">
                  {activeGenerationProgress
                    ? t("products.imageGeneration.triggerStatus.generating", {
                        defaultValue: "Generation in progress",
                      })
                    : hasGeneratedResult
                      ? t("products.imageGeneration.triggerStatus.review", {
                          defaultValue: "Review ready",
                        })
                      : t(
                          `products.imageGeneration.triggerStatus.${triggerStatusKey}`,
                          {
                            defaultValue:
                              triggerStatusKey === "ready"
                                ? "Ready"
                                : triggerStatusKey === "email"
                                  ? "Verify email"
                                  : triggerStatusKey === "anonymous"
                                    ? "Guest locked"
                                    : "Account required",
                          },
                        )}
                </Badge>
              </HStack>
              <Text fontWeight="semibold" textWrap="balance">
                {t("products.imageGeneration.title", {
                  defaultValue: "Generate a final production graphic with AI",
                })}
              </Text>
              <Text textWrap="pretty">
                {activeGenerationProgress
                  ? t(
                      "products.imageGeneration.openButtonDescriptionGenerating",
                      {
                        defaultValue:
                          "Generation continues in the background. Reopen the studio to watch progress and download the result when it is ready.",
                      },
                    )
                  : hasGeneratedResult
                    ? t("products.imageGeneration.openButtonDescriptionReady", {
                        defaultValue:
                          "Your latest generated graphic is ready to review, download, or attach.",
                      })
                    : t("products.imageGeneration.openButtonDescription", {
                        defaultValue:
                          "Write a detailed brief, add optional references, and generate a production-ready graphic in one focused workspace.",
                      })}
              </Text>
            </VStack>
            <MaterialSymbol flexShrink={0} fontSize="1.4rem">
              arrow_forward
            </MaterialSymbol>
          </HStack>
        </Button>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner padding={{ base: 0, md: 4 }}>
          <Dialog.Content
            w="100%"
            maxW={{ base: "100vw", md: "calc(100vw - 2rem)", xl: "1200px" }}
            maxH={{ base: "100dvh", md: "calc(100dvh - 2rem)" }}
            borderRadius={{ base: undefined, md: "3xl" }}
            overflow="hidden"
            p={0}
            display="flex"
            flexDirection="column"
          >
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
            <Dialog.Header pe={12}>
              <VStack align="stretch" gap={1}>
                <Dialog.Title textWrap="balance">
                  {t("products.imageGeneration.dialogTitle", {
                    defaultValue: "AI graphic studio",
                  })}
                </Dialog.Title>
              </VStack>
            </Dialog.Header>
            <Dialog.Body
              flex="1"
              minH={0}
              pt={0}
              pb={{ base: 5, md: 6 }}
              overflowY="auto"
              overscrollBehavior="contain"
            >
              {content}
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
