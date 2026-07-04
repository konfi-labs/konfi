import { AgentMessage, AgentMessagePart } from "@/context/agents";
import { useT } from "@/i18n/client";
import {
  Badge,
  Box,
  Card,
  Clipboard,
  Flex,
  HStack,
  Presence,
  ScrollArea,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { useMemo, useState } from "react";
import { TaskToolCallDisplay } from "./TaskToolCallDisplay";

interface TaskMessagesProps {
  messages?: AgentMessage[];
  locale: string;
  showToolCalls?: boolean;
}

interface TaskMessagePartViewProps {
  part: AgentMessagePart;
  showToolCalls?: boolean;
  toolResultMap?: Record<string, unknown>;
}

function TaskMessagePartView({
  part,
  showToolCalls,
  toolResultMap,
}: TaskMessagePartViewProps) {
  if (part.type === "text") {
    return (
      <Text fontSize="sm" whiteSpace="pre-wrap" lineHeight="tall">
        {part.text}
      </Text>
    );
  }

  if (part.type === "tool-call" && showToolCalls) {
    const result =
      part.result !== undefined && part.result !== null
        ? part.result
        : part.toolCallId
          ? toolResultMap?.[part.toolCallId]
          : undefined;
    return (
      <TaskToolCallDisplay
        toolName={part.toolName ?? "unknown"}
        args={part.args ?? {}}
        result={result}
      />
    );
  }

  return null;
}

function TaskMessageBubble({
  message,
  showToolCalls,
  toolResultMap,
}: {
  message: AgentMessage;
  index: number;
  locale: string;
  showToolCalls?: boolean;
  toolResultMap?: Record<string, unknown>;
}) {
  const [showActions, setShowActions] = useState(false);

  const contentParts: AgentMessagePart[] = useMemo(() => {
    if (typeof message.content === "string") {
      return [{ type: "text", text: message.content }];
    }
    return message.content ?? [];
  }, [message.content]);

  const textContent = useMemo(() => {
    return contentParts
      .filter((part) => part.type === "text" && part.text)
      .map((part) => part.text)
      .join("\n");
  }, [contentParts]);

  const textParts = useMemo(() => {
    return contentParts.filter((part) => part.type === "text");
  }, [contentParts]);

  const toolCallParts = useMemo(() => {
    return contentParts.filter((part) => part.type === "tool-call");
  }, [contentParts]);

  const isUser = message.role === "user";
  const shouldRender = () => {
    if (message.role === "system") {
      return false;
    }
    if (textParts.length > 0) return true;
    if (showToolCalls && toolCallParts.length > 0) return true;
    return false;
  };

  if (!shouldRender()) {
    return null;
  }

  return (
    <Presence
      present={true}
      animationName={{ _open: "slide-fade-in" }}
      animationDuration="moderate"
    >
      <Flex
        justify={isUser ? "flex-end" : "flex-start"}
        w="full"
        position="relative"
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        <HStack align="start" gap={3} maxW="95%">
          <VStack align="stretch" gap={2} flex={1} minW={0}>
            {/* Copy button on hover */}
            {textContent && (
              <Presence
                present={showActions}
                position="absolute"
                top={-6}
                right={isUser ? 0 : undefined}
                left={isUser ? undefined : 0}
                zIndex={10}
                animationName={{ _open: "fade-in", _closed: "fade-out" }}
                animationDuration="fast"
              >
                <HStack>
                  <Clipboard.Root value={textContent}>
                    <Clipboard.Trigger asChild>
                      <Clipboard.Indicator
                        copied={<MaterialSymbol>check</MaterialSymbol>}
                      >
                        <MaterialSymbol>content_copy</MaterialSymbol>
                      </Clipboard.Indicator>
                    </Clipboard.Trigger>
                  </Clipboard.Root>
                </HStack>
              </Presence>
            )}

            {/* Message content */}
            <Box
              py={isUser ? 3 : 2}
              px={isUser ? 4 : 0}
              borderRadius="3xl"
              bg={isUser ? "gray.subtle" : "transparent"}
              wordBreak="break-word"
            >
              {/* Content parts */}
              {contentParts.map((part, idx) => (
                <TaskMessagePartView
                  key={`part-${idx}`}
                  part={part}
                  showToolCalls={showToolCalls}
                  toolResultMap={toolResultMap}
                />
              ))}
            </Box>
          </VStack>
        </HStack>
      </Flex>
    </Presence>
  );
}

export function TaskMessages({
  messages,
  locale,
  showToolCalls,
}: TaskMessagesProps) {
  const { t } = useT();

  const toolResultMap = useMemo(() => {
    const map: Record<string, unknown> = {};
    if (!messages) return map;
    for (const msg of messages) {
      const parts = Array.isArray(msg.content) ? msg.content : [];
      for (const part of parts) {
        if (
          part.type === "tool-result" &&
          part.toolCallId &&
          part.result !== undefined
        ) {
          map[part.toolCallId] = part.result;
        }
      }
    }
    return map;
  }, [messages]);

  if (!messages || messages.length === 0) {
    return (
      <Card.Root variant="outline" borderRadius="2xl">
        <Card.Body py={8}>
          <VStack gap={3}>
            <Box
              w={12}
              h={12}
              borderRadius="full"
              borderWidth="1px"
              borderColor="border.subtle"
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <MaterialSymbol color="fg.muted">
                chat_bubble_outline
              </MaterialSymbol>
            </Box>
            <Text fontSize="sm" color="fg.muted" textAlign="center">
              {t("agents.noMessages", { defaultValue: "No conversation yet." })}
            </Text>
          </VStack>
        </Card.Body>
      </Card.Root>
    );
  }

  return (
    <Box>
      <HStack justify="space-between" mb={3}>
        <HStack gap={2}>
          <MaterialSymbol>forum</MaterialSymbol>
          <Text fontSize="sm" fontWeight="medium">
            {t("agents.conversationLog", { defaultValue: "Conversation" })}
          </Text>
        </HStack>
        <Badge
          size="sm"
          variant="solid"
          colorPalette="primary"
          borderRadius="full"
        >
          {messages.length}
        </Badge>
      </HStack>
      <Box
        borderRadius="2xl"
        borderWidth="1px"
        borderColor="gray.muted"
        overflow="hidden"
      >
        <ScrollArea.Root maxH="400px">
          <ScrollArea.Viewport p={4}>
            <VStack align="stretch" gap={4}>
              {messages.map((message, index) => (
                <TaskMessageBubble
                  key={`${message.role}-${index}-${locale}`}
                  message={message}
                  index={index}
                  locale={locale}
                  showToolCalls={showToolCalls}
                  toolResultMap={toolResultMap}
                />
              ))}
            </VStack>
          </ScrollArea.Viewport>
        </ScrollArea.Root>
      </Box>
    </Box>
  );
}

export default TaskMessages;
