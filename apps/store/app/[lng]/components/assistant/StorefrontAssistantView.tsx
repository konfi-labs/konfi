"use client";

import { storefrontRadiusCssVar } from "@/lib/storefront-editor/theme-vars";
import {
  Box,
  Button,
  HStack,
  IconButton,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import type { StorefrontButtonStyle } from "@konfi/types";
import type {
  StorefrontAssistantContact,
  StorefrontAssistantProduct,
} from "@/lib/storefront-assistant/types";
import dynamic from "next/dynamic";
import type { FormEvent, RefObject } from "react";

const StorefrontAssistantMessage = dynamic(
  () =>
    import("./StorefrontAssistantMessage").then(
      (mod) => mod.StorefrontAssistantMessage,
    ),
  { ssr: false },
);

export interface AssistantChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  contact?: StorefrontAssistantContact;
  products?: StorefrontAssistantProduct[];
  isError?: boolean;
}

export interface StorefrontAssistantLabels {
  ariaLabel: string;
  close: string;
  contact: string;
  contactPage: string;
  headerTitle: string;
  heroPlaceholder: string;
  inputPlaceholder: string;
  open: string;
  productLink: string;
  quickContact: string;
  quickFiles: string;
  send: string;
  thinking: string;
}

interface StorefrontAssistantViewProps {
  chatInputValue: string;
  chatScrollRef: RefObject<HTMLDivElement | null>;
  heroInputValue: string;
  isOpen: boolean;
  isSubmitting: boolean;
  labels: StorefrontAssistantLabels;
  lng: string;
  messages: AssistantChatMessage[];
  showHeroInput?: boolean;
  onChatInputChange: (value: string) => void;
  onClose: () => void;
  onHeroInputChange: (value: string) => void;
  onOpen: () => void;
  onQuickPrompt: (message: string) => void;
  onSubmitChat: (event?: FormEvent<HTMLDivElement>) => void;
  onSubmitHero: (event?: FormEvent<HTMLDivElement>) => void;
}

const TYPING_DOTS = [0, 1, 2] as const;

interface StorefrontAssistantHeroInputProps {
  buttonStyle?: StorefrontButtonStyle;
  heroInputValue: string;
  isSubmitting: boolean;
  labels: StorefrontAssistantLabels;
  onHeroInputChange: (value: string) => void;
  onQuickPrompt: (message: string) => void;
  onSubmitHero: (event?: FormEvent<HTMLDivElement>) => void;
}

export function StorefrontAssistantHeroInput({
  buttonStyle = "solid",
  heroInputValue,
  isSubmitting,
  labels,
  onHeroInputChange,
  onQuickPrompt,
  onSubmitHero,
}: StorefrontAssistantHeroInputProps) {
  const quickPrompts = [
    { label: labels.quickFiles, value: labels.quickFiles },
    { label: labels.quickContact, value: labels.quickContact },
  ];

  return (
    <Box as="form" onSubmit={onSubmitHero} mx="auto" w="full">
      <HStack
        w="full"
        gap={2}
        position="relative"
        pt={{ base: "12px", md: "16px" }}
        pb={{ base: "92px", sm: "60px", md: "64px" }}
        bgColor={{ base: "gray.50", _dark: "black" }}
        borderRadius={storefrontRadiusCssVar.card}
      >
        <Textarea
          focusRingColor="transparent"
          aria-label={labels.ariaLabel}
          name="storefront-assistant-prompt"
          value={heroInputValue}
          onChange={(event) => onHeroInputChange(event.target.value)}
          placeholder={labels.heroPlaceholder}
          autoresize
          rows={1}
          maxHeight="200px"
          flex={1}
          variant="subtle"
          size="lg"
          borderRadius={storefrontRadiusCssVar.card}
          bgColor={{ base: "gray.50", _dark: "black" }}
          pt={0}
          resize="none"
          disabled={isSubmitting}
        />
        <HStack
          justify="space-between"
          gap={3}
          align="end"
          position="absolute"
          bottom={{ base: 3, md: 4 }}
          left={0}
          px={{ base: 3, md: 4 }}
          w="100%"
        >
          <HStack gap={2} flexWrap="wrap" maxW="calc(100% - 56px)">
            {quickPrompts.map((prompt) => (
              <Button
                key={prompt.label}
                type="button"
                size="sm"
                variant={buttonStyle}
                borderRadius={storefrontRadiusCssVar.button}
                onClick={() => onQuickPrompt(prompt.value)}
              >
                {prompt.label}
              </Button>
            ))}
          </HStack>
          <IconButton
            type="submit"
            aria-label={labels.send}
            colorPalette="primary"
            borderRadius={storefrontRadiusCssVar.button}
            variant={buttonStyle}
            flexShrink={0}
            disabled={!heroInputValue.trim() || isSubmitting}
          >
            <MaterialSymbol>arrow_upward</MaterialSymbol>
          </IconButton>
        </HStack>
      </HStack>
    </Box>
  );
}

function TypingDots() {
  return (
    <HStack aria-hidden="true" gap="6px">
      {TYPING_DOTS.map((dot) => {
        const offset = `-${dot * 0.18}s`;

        return (
          <Box
            as="span"
            key={dot}
            display="inline-flex"
            w="12px"
            h="12px"
            data-state="open"
            _open={{
              animation: `pulseSize 1.1s ease-in-out ${offset} infinite`,
            }}
          >
            <Box
              as="span"
              w="full"
              h="full"
              borderRadius="full"
              bg="gray.300"
              animation={`shimmerText 2.5s linear ${offset} infinite`}
            />
          </Box>
        );
      })}
    </HStack>
  );
}

export function StorefrontAssistantView({
  chatInputValue,
  chatScrollRef,
  heroInputValue,
  isOpen,
  isSubmitting,
  labels,
  lng,
  messages,
  showHeroInput = true,
  onChatInputChange,
  onClose,
  onHeroInputChange,
  onOpen,
  onQuickPrompt,
  onSubmitChat,
  onSubmitHero,
}: StorefrontAssistantViewProps) {
  return (
    <>
      {showHeroInput && (
        <StorefrontAssistantHeroInput
          heroInputValue={heroInputValue}
          isSubmitting={isSubmitting}
          labels={labels}
          onHeroInputChange={onHeroInputChange}
          onQuickPrompt={onQuickPrompt}
          onSubmitHero={onSubmitHero}
        />
      )}

      {!isOpen && (
        <IconButton
          position="fixed"
          right={{ base: 4, md: 6 }}
          bottom={{
            base: "calc(6.75rem + env(safe-area-inset-bottom))",
            md: 6,
          }}
          zIndex={1600}
          aria-label={labels.open}
          colorPalette="primary"
          borderRadius={storefrontRadiusCssVar.button}
          size="lg"
          boxShadow="xl"
          onClick={onOpen}
        >
          <MaterialSymbol>chat</MaterialSymbol>
        </IconButton>
      )}

      {isOpen && (
        <Box
          position="fixed"
          right={{ base: 3, md: 6 }}
          bottom={{
            base: "calc(6.75rem + env(safe-area-inset-bottom))",
            md: 6,
          }}
          zIndex={1600}
          w={{ base: "calc(100vw - 24px)", sm: "23rem", md: "25rem" }}
          maxH={{
            base: "calc(100dvh - 7.75rem - env(safe-area-inset-bottom))",
            md: "min(40rem, 82vh)",
          }}
          borderWidth="1px"
          borderColor="border"
          borderRadius={storefrontRadiusCssVar.card}
          bg={{ base: "white", _dark: "gray.950" }}
          boxShadow="0 24px 70px rgba(15, 23, 42, 0.22)"
          overflow="hidden"
        >
          <VStack align="stretch" gap={0} h="full">
            <HStack
              justify="space-between"
              px={4}
              py={3}
              borderBottomWidth="1px"
            >
              <HStack gap={2} minW={0}>
                <Text fontWeight="semibold" truncate>
                  {labels.headerTitle}
                </Text>
              </HStack>
              <IconButton
                aria-label={labels.close}
                size="sm"
                variant="ghost"
                borderRadius={storefrontRadiusCssVar.button}
                onClick={onClose}
              >
                <MaterialSymbol>close</MaterialSymbol>
              </IconButton>
            </HStack>

            <VStack
              ref={chatScrollRef}
              align="stretch"
              gap={4}
              px={4}
              py={4}
              overflowY="auto"
              maxH={{
                base: "calc(100dvh - 15rem - env(safe-area-inset-bottom))",
                md: "28rem",
              }}
            >
              {messages.map((message) => (
                <StorefrontAssistantMessage
                  key={message.id}
                  labels={labels}
                  lng={lng}
                  message={message}
                />
              ))}
              {isSubmitting && (
                <HStack
                  role="status"
                  aria-live="polite"
                  aria-label={labels.thinking}
                  alignSelf="flex-start"
                  align="center"
                  justify="flex-start"
                  maxW="85%"
                  w="fit-content"
                  px={1}
                  py={2}
                >
                  <TypingDots />
                </HStack>
              )}
            </VStack>

            <Box as="form" onSubmit={onSubmitChat} p={3}>
              <HStack gap={2}>
                <Textarea
                  aria-label={labels.ariaLabel}
                  name="storefront-assistant-chat-message"
                  value={chatInputValue}
                  onChange={(event) => onChatInputChange(event.target.value)}
                  placeholder={labels.inputPlaceholder}
                  autoresize
                  rows={1}
                  maxH="120px"
                  variant="subtle"
                  borderRadius={storefrontRadiusCssVar.card}
                  resize="none"
                  border="none"
                  focusRing="none"
                  disabled={isSubmitting}
                />
                <IconButton
                  type="submit"
                  aria-label={labels.send}
                  colorPalette="primary"
                  borderRadius={storefrontRadiusCssVar.button}
                  flexShrink={0}
                  disabled={!chatInputValue.trim() || isSubmitting}
                >
                  <MaterialSymbol>arrow_upward</MaterialSymbol>
                </IconButton>
              </HStack>
            </Box>
          </VStack>
        </Box>
      )}
    </>
  );
}
