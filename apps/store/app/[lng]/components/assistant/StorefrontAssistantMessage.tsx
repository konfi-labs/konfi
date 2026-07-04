"use client";

import { storefrontRadiusCssVar } from "@/lib/storefront-editor/theme-vars";
import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import { Link, MaterialSymbol, mdxComponents } from "@konfi/components";
import { Streamdown } from "streamdown";
import type {
  AssistantChatMessage,
  StorefrontAssistantLabels,
} from "./StorefrontAssistantView";

const BARE_URL_PATTERN = /(^|\s)((?:https?:\/\/|\/(?:pl|en)\/)[^\s<>()\]]+)/g;

interface StorefrontAssistantMessageProps {
  labels: StorefrontAssistantLabels;
  lng: string;
  message: AssistantChatMessage;
}

function normalizeBareUrls(content: string): string {
  return content.replace(BARE_URL_PATTERN, (match, prefix, rawUrl) => {
    if (typeof prefix !== "string" || typeof rawUrl !== "string") {
      return match;
    }

    const trailingPunctuation = rawUrl.match(/[.,!?;:]+$/)?.[0] ?? "";
    const href = rawUrl.slice(0, rawUrl.length - trailingPunctuation.length);

    if (!href) {
      return match;
    }

    return `${prefix}[${href}](${href})${trailingPunctuation}`;
  });
}

export function StorefrontAssistantMessage({
  labels,
  lng,
  message,
}: StorefrontAssistantMessageProps) {
  const isUser = message.role === "user";

  return (
    <VStack align={isUser ? "end" : "start"} gap={2} w="full">
      <Box
        maxW="85%"
        borderRadius={storefrontRadiusCssVar.card}
        px={4}
        py={3}
        bg={
          isUser ? "primary.solid" : message.isError ? "red.subtle" : "gray.50"
        }
        color={isUser ? "primary.contrast" : "fg"}
        _dark={{
          bg: isUser
            ? "primary.solid"
            : message.isError
              ? "red.950"
              : "gray.900",
        }}
      >
        {isUser ? (
          <Text fontSize="sm" whiteSpace="pre-wrap" overflowWrap="anywhere">
            {message.content}
          </Text>
        ) : (
          <Box
            fontSize="sm"
            overflowWrap="anywhere"
            css={{
              "& p": { marginBlock: 0, textAlign: "start" },
              "& ul, & ol": { marginBlock: 0 },
              "& li": { marginBlock: "0.25rem" },
            }}
          >
            <Streamdown components={mdxComponents}>
              {normalizeBareUrls(message.content)}
            </Streamdown>
          </Box>
        )}
      </Box>

      {!isUser && message.products && message.products.length > 0 && (
        <VStack align="stretch" gap={2} w="85%">
          {message.products.map((product) => (
            <Link
              key={`${product.name}-${product.url}`}
              href={product.url}
              lng={lng}
              textDecoration="none"
            >
              <HStack
                borderWidth="1px"
                borderRadius={storefrontRadiusCssVar.card}
                px={3}
                py={2}
                justify="space-between"
                gap={3}
                _hover={{
                  borderColor: "primary.solid",
                  color: "primary.solid",
                }}
              >
                <Box minW={0}>
                  <Text fontWeight="semibold" fontSize="sm" truncate>
                    {product.name}
                  </Text>
                  {product.category && (
                    <Text fontSize="xs" color="fg.muted" truncate>
                      {product.category}
                    </Text>
                  )}
                </Box>
                <HStack gap={1} flexShrink={0}>
                  <Text fontSize="xs">{labels.productLink}</Text>
                  <MaterialSymbol aria-hidden="true">
                    arrow_outward
                  </MaterialSymbol>
                </HStack>
              </HStack>
            </Link>
          ))}
        </VStack>
      )}
    </VStack>
  );
}
