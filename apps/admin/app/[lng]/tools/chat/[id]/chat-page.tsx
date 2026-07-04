"use client";

import { AssistantHistorySidebar } from "@/components/assistant/AssistantHistorySidebar";
import { SampleMessages } from "@/components/assistant/SampleMessages";
import { useAgents } from "@/context/agents";
import { useAssistantHistory } from "@/context/assistant-history";
import { useAuth } from "@/context/auth";
import { useConfiguration } from "@/context/configuration";
import { useT } from "@/i18n/client";
import { firestore, functions } from "@/lib/firebase/clientApp";
import { konfiTools } from "@/lib/firebase/tools";
import { useChat } from "@ai-sdk/react";
import { math } from "@streamdown/math";
import {
  Avatar,
  Box,
  Button,
  Card,
  Clipboard,
  CloseButton,
  Collapsible,
  Dialog,
  Drawer,
  Flex,
  Grid,
  GridItem,
  Heading,
  HStack,
  IconButton,
  Menu,
  Portal,
  Presence,
  ScrollArea,
  Show,
  Skeleton,
  Stack,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import {
  ButtonLink,
  Image,
  Item,
  MaterialSymbol,
  mdxComponents,
  ScrollToBottom,
} from "@konfi/components";
import { themeGradients } from "@konfi/components/theme";
import {
  assistantModelConfigs,
  getAssistantModelConfig,
  resolveAssistantModelId,
} from "@konfi/firebase";
import {
  Attribute,
  Channel,
  FormattedOrderItem,
  OrderItem,
} from "@konfi/types";
import { ADMIN_TOOLS_TASKS, SCROLL_MASK_CSS } from "@konfi/utils";
import {
  DefaultChatTransport,
  FileUIPart,
  SourceUrlUIPart,
  TextPart,
  UIMessage,
} from "ai";
import { useChannels } from "context/channels";
import { isEmpty } from "es-toolkit/compat";
import { i18n, TFunction } from "i18next";
import dynamic from "next/dynamic";
import type { AgentTaskType } from "@/lib/ai/durable-agents/types";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Streamdown } from "streamdown";
import { useStickToBottom } from "use-stick-to-bottom";

const streamdownPlugins = { math };

const CreateOrderPage = dynamic(
  () => import("../../../orders/create/create-order-page"),
  { ssr: false },
);

const CreateQuotePage = dynamic(
  () => import("../../../quotes/create/create-quote-page"),
  { ssr: false },
);

export interface AssistantMessageMetadata {
  references?: Array<{
    url: string;
    title: string;
    content: string;
    thumbnail: string;
  }>;
  orderItems?: FormattedOrderItem[];
  processingLog?: string;
  thoughtSignature?: string;
}

function getChatErrorMessage(
  error: Error | undefined,
  t: TFunction,
): string | null {
  if (!error?.message) {
    return null;
  }

  if (
    error.message.includes("AI_InvalidPromptError") ||
    error.message.includes(
      "This chat history contains unsupported message data.",
    )
  ) {
    return t("assistant.invalidPromptError", {
      defaultValue:
        "This chat history contains unsupported data. Please try again or start a new chat.",
    });
  }

  return error.message;
}

type ToolPartState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error"
  | "output-denied";

type RenderableToolPart = {
  type: `tool-${string}`;
  state?: ToolPartState;
  output?: unknown;
  result?: unknown;
  errorText?: string;
};

type AgentToolResult = {
  success: boolean;
  runId: string;
  taskType?: AgentTaskType;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getToolOutput(part: RenderableToolPart): unknown {
  return part.output ?? part.result;
}

function isAgentTaskType(value: unknown): value is AgentTaskType {
  return (
    value === "quote" ||
    value === "order" ||
    value === "invoice" ||
    value === "product" ||
    value === "autonomous"
  );
}

function isAgentToolResult(value: unknown): value is AgentToolResult {
  return (
    isRecord(value) &&
    value.success === true &&
    typeof value.runId === "string" &&
    (!("taskType" in value) ||
      value.taskType === undefined ||
      isAgentTaskType(value.taskType))
  );
}

function ChatErrorNotice({ message, px }: { message: string; px: number }) {
  return (
    <Box px={px} pb={2}>
      <Card.Root
        size="sm"
        borderColor="red.300"
        bg="red.50"
        _dark={{ bg: "red.950", borderColor: "red.800" }}
      >
        <Card.Body py={2}>
          <HStack gap={2} align="start">
            <MaterialSymbol color="red.500">error</MaterialSymbol>
            <Box flex="1" minW={0} maxH="140px" overflowY="auto">
              <Text
                fontSize="sm"
                color="red.600"
                _dark={{ color: "red.400" }}
                whiteSpace="pre-wrap"
                overflowWrap="anywhere"
              >
                {message}
              </Text>
            </Box>
          </HStack>
        </Card.Body>
      </Card.Root>
    </Box>
  );
}

export default function ChatPage({
  id,
  isPanel = false,
}: {
  id?: string;
  isPanel?: boolean;
}) {
  const { t, i18n } = useT(["order", "translation"]);
  const { channel } = useChannels();
  const { attributes } = useConfiguration();
  const { currentSession, sessionKey } = useAssistantHistory();

  const mappedInitialMessages: UIMessage<AssistantMessageMetadata>[] = !isEmpty(
    currentSession.messages,
  )
    ? currentSession.messages.map((msg) => {
        const anyMsg = msg;
        const refs = anyMsg.references;
        const oItems = anyMsg.orderItems;
        const tSig = anyMsg.thoughtSignature;
        return {
          id: msg.id,
          role: msg.role,
          parts: msg.parts,
          metadata: {
            references: refs,
            orderItems: oItems,
            thoughtSignature: tSig,
          },
        };
      })
    : [];

  return (
    <Chat
      key={`${currentSession.conversationId || "new"}::${sessionKey}::${channel && attributes ? "firebase" : "api"}`}
      channel={channel}
      attributes={attributes}
      id={id}
      initialMessages={mappedInitialMessages}
      initialModel={currentSession.modelId}
      initialOrderItems={mappedInitialMessages.flatMap(
        (msg) => msg.metadata?.orderItems ?? [],
      )}
      t={t}
      i18n={i18n}
      isLoading={!channel || !attributes || !firestore || !functions}
      isPanel={isPanel}
    />
  );
}

function Chat({
  id,
  initialMessages,
  initialModel,
  initialOrderItems,
  channel,
  attributes,
  t,
  i18n,
  isLoading,
  isPanel = false,
}: {
  id?: string;
  initialMessages: UIMessage<AssistantMessageMetadata>[];
  initialOrderItems: FormattedOrderItem[];
  initialModel: string;
  channel: Channel | null;
  attributes: Attribute[] | null;
  t: TFunction;
  i18n: i18n;
  isLoading: boolean;
  isPanel?: boolean;
}) {
  const { user } = useAuth();
  const { addAgent } = useAgents();
  const [inputValue, setInputValue] = useState("");
  const [currentModel, setCurrentModel] = useState(() =>
    resolveAssistantModelId(initialModel),
  );
  const currentModelConfig = useMemo(
    () => getAssistantModelConfig(currentModel),
    [currentModel],
  );
  const getModelLabel = useCallback(
    (modelId: string) => {
      const modelConfig = getAssistantModelConfig(modelId);
      return t(modelConfig.labelKey ?? "assistant.selectModel", {
        defaultValue: modelConfig.name,
      });
    },
    [t],
  );
  const [files, setFiles] = useState<FileList | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [orderItems, setOrderItems] =
    useState<FormattedOrderItem[]>(initialOrderItems);
  const [isScrollable, setIsScrollable] = useState(false);
  const scrollViewportRef = useRef<HTMLDivElement>(null);

  // Add state for dialog control
  const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false);
  const [isQuoteDialogOpen, setIsQuoteDialogOpen] = useState(false);

  // Memoize orderItems to prevent unnecessary re-renders
  const memoizedOrderItems = useMemo(() => orderItems, [orderItems]);

  // Check if content is scrollable
  const checkScrollable = useCallback(() => {
    if (scrollViewportRef.current) {
      const { scrollHeight, clientHeight } = scrollViewportRef.current;
      setIsScrollable(scrollHeight > clientHeight);
    }
  }, []);

  const {
    addSessionMessage,
    clearSession,
    updateSessionModel,
    saveCurrentSession,
    currentSession,
  } = useAssistantHistory();

  const systemPrompt = `
  You are an AI assistant, you help the user with various tasks and answer their questions.
  Here are a few tips that might help you:
  - When unsure, use function calls to get accurate information.
  - Available functions: ${JSON.stringify(
    konfiTools.functionDeclarations.flatMap((fn) => {
      return {
        name: fn.name,
        description: fn.description,
      };
    }),
  )}
  - Currently selected language: ${i18n.resolvedLanguage}.
  Format your answers in Markdown to make them more readable.
  - When writing calculations or formulas, format multi-step math as Markdown lists or separate paragraphs with blank lines between steps.
  - Streamdown in this chat uses double dollar signs ($$) for math. Do not use single dollar signs ($) to delimit math expressions.
  - For equations or calculation steps, use $$ on their own lines around each expression.
  - Do not rely on single newline characters to separate calculation steps.
  - Keep explanatory prose outside the math delimiters when possible.
  - Example format:
    - Na szerokości 580 mm:
      $$
      \frac{580}{40} = 14
      $$
      Zostaje 20 mm odpadu.
  `;

  // Use ref for user to avoid stale closure in transport headers
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Use ref for currentModel to avoid stale closure in transport body
  const currentModelRef = useRef(currentModel);
  useEffect(() => {
    currentModelRef.current = currentModel;
  }, [currentModel]);

  // Create transport for server API (using ref to create once)
  const serverTransportRef = useRef<DefaultChatTransport<
    UIMessage<AssistantMessageMetadata>
  > | null>(null);

  if (!serverTransportRef.current && channel && user) {
    serverTransportRef.current = new DefaultChatTransport<
      UIMessage<AssistantMessageMetadata>
    >({
      api: "/api/chat",
      prepareSendMessagesRequest: async ({ messages: msgs }) => {
        const currentUser = userRef.current;
        const modelId = currentModelRef.current;
        let authHeaders: Record<string, string> = {};

        if (currentUser) {
          try {
            const token = await currentUser.getIdToken();
            if (token) {
              authHeaders = { Authorization: `Bearer ${token}` };
            }
          } catch (err) {
            console.error("[Chat] Error getting auth token:", err);
          }
        }

        return {
          headers: authHeaders,
          body: {
            messages: msgs,
            modelId: modelId,
            channelId: channel?.id,
            attributes,
            systemPrompt,
            locale: i18n.resolvedLanguage || "en",
            createdBy: currentUser
              ? {
                  id: currentUser.uid,
                  name:
                    currentUser.displayName || currentUser.email || "Unknown",
                }
              : undefined,
          },
        };
      },
    });
  }

  // Determine if API is ready
  const apiReady = Boolean(channel && user && serverTransportRef.current);

  const chatInstanceId = useMemo(
    () => `${id ?? "new"}::server::${apiReady}`,
    [id, apiReady],
  );

  const sticky = useStickToBottom();

  const {
    messages,
    sendMessage,
    setMessages,
    status,
    error,
    stop,
    regenerate,
  } = useChat({
    id: chatInstanceId,
    messages: initialMessages,
    transport: serverTransportRef.current ?? undefined,
    onFinish: async ({ message }) => {
      const meta = message.metadata as AssistantMessageMetadata | undefined;
      // Always include references/orderItems/processingLog if present
      if (meta?.references || meta?.orderItems || meta?.thoughtSignature) {
        await addSessionMessage(
          message.parts,
          message.role,
          meta?.references,
          meta?.orderItems,
          meta?.thoughtSignature,
        );
      } else {
        await addSessionMessage(message.parts, message.role);
      }
      if (meta?.orderItems && !isEmpty(meta.orderItems)) {
        setOrderItems(meta.orderItems as FormattedOrderItem[]);
      }

      // Check for startDurableAgent tool results and add to agents context
      for (const part of message.parts) {
        // Tool parts have type like "tool-startDurableAgent"
        if (part.type === "tool-startDurableAgent") {
          const toolPart = part as RenderableToolPart;
          const result = getToolOutput(toolPart);
          if (isAgentToolResult(result)) {
            console.log("[Chat] Detected startDurableAgent result:", result);
            // Add new agent to context
            addAgent({
              runId: result.runId,
              taskType: result.taskType ?? "quote",
              status: "processing",
              prompt: inputValue || t("agents.startedAgentPrompt"),
            });
          }
        }
      }

      // Persist conversation if not private and has an id
      if (!currentSession.private) {
        await saveCurrentSession();
      }
    },
    onError: (e) => {
      console.error("Chat error", e);
    },
  });
  const chatErrorMessage = useMemo(
    () => getChatErrorMessage(error, t),
    [error, t],
  );

  async function handleSubmit(sampleMessage?: string) {
    if (!inputValue.trim() && !sampleMessage && !files) return;

    // Convert files to data URLs
    const fileParts: FileUIPart[] = [];
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.addEventListener(
            "load",
            () => resolve(reader.result as string),
            { once: true },
          );
          reader.addEventListener("error", reject, { once: true });
          reader.readAsDataURL(file);
        });

        fileParts.push({
          type: "file",
          mediaType: file.type,
          url: dataUrl,
          filename: file.name,
        });
      }
    }

    if (sampleMessage) {
      setInputValue("");
      setFiles(undefined);
      if (fileInputRef.current) fileInputRef.current.value = "";

      sendMessage({
        role: "user",
        parts: [{ type: "text", text: sampleMessage }, ...fileParts],
      });
      await addSessionMessage(
        [{ type: "text", text: sampleMessage }, ...fileParts],
        "user",
      );
      return;
    }

    const textPart = { type: "text" as const, text: inputValue };
    const allParts = [textPart, ...fileParts];

    setInputValue("");
    setFiles(undefined);
    if (fileInputRef.current) fileInputRef.current.value = "";

    sendMessage({
      role: "user",
      parts: allParts,
    });
    await addSessionMessage(allParts, "user");
  }

  const [showReferences, setShowReferences] = useState(false);
  const [currentReferences, setCurrentReferences] = useState<
    { url: string; title: string; content: string; thumbnail: string }[]
  >([]);

  const updateModel = useCallback(
    (modelId: string) => {
      if (!channel || !attributes) return;

      setCurrentModel(modelId);
      updateSessionModel(modelId);
      // Body is regenerated on each request automatically
    },
    [updateSessionModel, channel, attributes],
  );

  // Check if content is scrollable whenever messages change or container resizes
  useEffect(() => {
    checkScrollable();
  }, [messages, checkScrollable]);

  // Add resize observer to check scrollability on window resize
  useEffect(() => {
    const handleResize = () => checkScrollable();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [checkScrollable]);

  // Watch for changes in the scroll viewport content
  useEffect(() => {
    if (!scrollViewportRef.current) return;

    const observer = new ResizeObserver(checkScrollable);
    observer.observe(scrollViewportRef.current);

    return () => observer.disconnect();
  }, [checkScrollable]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  function handleOpenReferences(
    references?: {
      url: string;
      title: string;
      content: string;
      thumbnail: string;
    }[],
  ) {
    if (!references) return;
    setShowReferences(true);
    setCurrentReferences(references);
  }

  const handleClearChat = useCallback(() => {
    // Close dialogs before clearing
    setIsOrderDialogOpen(false);
    setIsQuoteDialogOpen(false);
    clearSession();
    setMessages([]);
    setOrderItems([]);
  }, [clearSession, setMessages]);

  // Find the last assistant message index for regeneration
  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") {
        return i;
      }
    }
    return -1;
  }, [messages]);

  const canRegenerate = status === "ready" || status === "error";

  // Handle loading state after all hooks
  if (isLoading) {
    return <Skeleton w={"100%"} h={isPanel ? "400px" : "100vh"} />;
  }

  if (isPanel) {
    // Simplified panel layout without sidebar
    return (
      <VStack gap={4} align={"stretch"} h={"full"} justify="flex-end">
        {/* Messages container */}
        <Box
          ref={messagesContainerRef}
          w={"full"}
          borderRadius={"3xl"}
          flex={1}
          minH={0}
          overflowY="auto"
        >
          <ScrollArea.Root>
            <ScrollArea.Viewport
              css={isScrollable ? SCROLL_MASK_CSS : undefined}
              ref={sticky.scrollRef}
            >
              <ScrollArea.Content ref={sticky.contentRef}>
                <VStack gap={4} align={"stretch"} w={"100%"}>
                  {messages.map((message, index) => {
                    const meta = message.metadata as
                      | AssistantMessageMetadata
                      | undefined;
                    const showAvatar =
                      message.role !== "user" &&
                      message.parts.length === 1 &&
                      message.parts[0].type === "text" &&
                      message.parts[0].text === "";
                    return (
                      <Presence
                        key={message.id}
                        present={true}
                        animationName={{ _open: "slide-fade-in" }}
                        animationDuration="moderate"
                      >
                        <Flex
                          justify={
                            message.role === "user" ? "flex-end" : "flex-start"
                          }
                          w="full"
                        >
                          <HStack align="start" gap={2} w="auto" maxW="100%">
                            <Box
                              w={message.role === "user" ? "auto" : "100%"}
                              py={3}
                              px={message.role === "user" ? 4 : 2}
                              borderRadius="3xl"
                              bg={
                                message.role === "user"
                                  ? { base: "gray.50", _dark: "black" }
                                  : "transparent"
                              }
                              wordBreak="break-word"
                              asChild
                            >
                              <Presence
                                present={true}
                                animationName={{ _open: "fade-in" }}
                                animationDuration="moderate"
                              >
                                {showAvatar && (
                                  <Avatar.Root
                                    size="sm"
                                    data-state="open"
                                    _open={{
                                      animation: "pulseSize",
                                    }}
                                  >
                                    <Avatar.Image src="/assets/avatar_agent.avif" />
                                    <Avatar.Fallback name="Konfi" />
                                  </Avatar.Root>
                                )}
                                <Message
                                  message={message}
                                  t={t}
                                  isLastAssistant={index === lastAssistantIndex}
                                  isProcessing={
                                    index === lastAssistantIndex &&
                                    (status === "streaming" ||
                                      status === "submitted")
                                  }
                                  onRegenerate={regenerate}
                                  canRegenerate={canRegenerate}
                                />
                              </Presence>
                            </Box>
                          </HStack>
                        </Flex>
                        {/* references button */}
                        {meta?.references && meta.references.length > 0 && (
                          <Button
                            mt={2}
                            ml={2}
                            bottom="7px"
                            size="xs"
                            variant="surface"
                            onClick={() =>
                              startTransition(() =>
                                handleOpenReferences(meta.references!),
                              )
                            }
                          >
                            <MaterialSymbol>article_shortcut</MaterialSymbol>
                            {meta.references.length}{" "}
                            {t("assistant.references", {
                              defaultValue: "References",
                            })}
                          </Button>
                        )}
                      </Presence>
                    );
                  })}
                  {/* Thinking indicator when AI is processing */}
                  {(status === "streaming" || status === "submitted") && (
                    <ThinkingIndicator />
                  )}
                  {/* anchor element – stays at the very end */}
                  <div ref={bottomRef} />
                </VStack>
              </ScrollArea.Content>
            </ScrollArea.Viewport>
            <ScrollToBottom sticky={sticky} t={t} />
          </ScrollArea.Root>
        </Box>
        {isEmpty(messages) && (
          <Box px={2}>
            <Heading size={"lg"}>
              {t("assistant.greeting", {
                defaultValue: "Hello! How can I help You today?",
              })}
            </Heading>
          </Box>
        )}
        {/* Input area */}
        <VStack w="full" gap={2} align="stretch" flexShrink={0}>
          <HStack
            w={"full"}
            gap={2}
            position={"relative"}
            pt={"8px"}
            pb={"48px"}
            bgColor={{ base: "gray.50", _dark: "black" }}
            borderRadius={"3xl"}
            flexShrink={0}
          >
            <Textarea
              focusRingColor={"transparent"}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyUp={handleKeyPress}
              placeholder={t("assistant.messagePlaceholder", {
                defaultValue: "Type a message...",
              })}
              borderRadius="3xl"
              autoresize
              rows={1}
              maxHeight={"200px"}
              flex={1}
              variant={"subtle"}
              size={"md"}
              disabled={status !== "ready"}
              bgColor={{ base: "gray.50", _dark: "black" }}
              pt={0}
            />
            {/* Display selected files */}
            {files && files.length > 0 && (
              <Box position={"absolute"} top={"-40px"} left={2}>
                <HStack gap={2} flexWrap="wrap">
                  {Array.from(files).map((file, idx) => (
                    <Card.Root key={idx} size="sm">
                      <Card.Body p={1}>
                        <HStack gap={1}>
                          <MaterialSymbol>
                            {file.type.startsWith("image/")
                              ? "image"
                              : "attachment"}
                          </MaterialSymbol>
                          <Text fontSize="xs" maxLines={1} maxW="80px">
                            {file.name}
                          </Text>
                          <IconButton
                            size="xs"
                            variant="ghost"
                            aria-label="Remove file"
                            onClick={() => {
                              const dt = new DataTransfer();
                              Array.from(files).forEach((f, i) => {
                                if (i !== idx) dt.items.add(f);
                              });
                              setFiles(
                                dt.files.length > 0 ? dt.files : undefined,
                              );
                              if (fileInputRef.current) {
                                fileInputRef.current.files = dt.files;
                              }
                            }}
                          >
                            <MaterialSymbol>close</MaterialSymbol>
                          </IconButton>
                        </HStack>
                      </Card.Body>
                    </Card.Root>
                  ))}
                </HStack>
              </Box>
            )}
            <HStack
              justify={"space-between"}
              position={"absolute"}
              bottom={"2"}
              px={2}
              w={"100%"}
            >
              <HStack gap={1}>
                {/* File upload button */}
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  multiple
                  accept="image/*,application/pdf,text/*"
                  size={5 * 1024 * 1024} // 5MB limit per file
                  onChange={(e) => {
                    if (e.target.files) {
                      setFiles(e.target.files);
                    }
                  }}
                />
                <IconButton
                  aria-label="Attach files"
                  size="xs"
                  rounded={"full"}
                  variant={"outline"}
                  disabled={status !== "ready"}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <MaterialSymbol>attach_file</MaterialSymbol>
                </IconButton>
                {/* Model selector popup */}
                <Menu.Root>
                  <Menu.Trigger asChild>
                    <IconButton
                      aria-label="Model Settings"
                      size="xs"
                      rounded={"full"}
                      variant={"outline"}
                      disabled={status !== "ready"}
                      colorPalette={
                        currentModelConfig.isExperimental ? "amber" : "neutral"
                      }
                    >
                      <MaterialSymbol>
                        {currentModelConfig.isExperimental
                          ? "science"
                          : "model_training"}
                      </MaterialSymbol>
                    </IconButton>
                  </Menu.Trigger>
                  <Menu.Positioner>
                    <Menu.Content>
                      <Menu.ItemGroup>
                        <Menu.ItemGroupLabel>
                          {t("assistant.selectModel", {
                            defaultValue: "Select model",
                          })}
                        </Menu.ItemGroupLabel>
                        {assistantModelConfigs.map((modelConfig) => (
                          <Menu.Item
                            value={modelConfig.id}
                            key={modelConfig.id}
                            onClick={() => {
                              updateModel(modelConfig.id);
                            }}
                            color={
                              modelConfig.isExperimental
                                ? "amber.500"
                                : undefined
                            }
                          >
                            {modelConfig.isExperimental && (
                              <Box
                                fontSize="xs"
                                px={1}
                                py={0.5}
                                borderRadius="sm"
                                bg="amber.100"
                                color="amber.800"
                              >
                                {t("assistant.experimental", {
                                  defaultValue: "Experimental",
                                })}
                              </Box>
                            )}
                            {getModelLabel(modelConfig.id)}
                          </Menu.Item>
                        ))}
                      </Menu.ItemGroup>
                    </Menu.Content>
                  </Menu.Positioner>
                </Menu.Root>
              </HStack>
              {/* Stop button when streaming */}
              {status === "streaming" || status === "submitted" ? (
                <IconButton
                  colorPalette="red"
                  size="xs"
                  aria-label={t("assistant.stop", { defaultValue: "Stop" })}
                  onClick={() => stop()}
                  rounded={"full"}
                >
                  <MaterialSymbol>stop</MaterialSymbol>
                </IconButton>
              ) : (
                <IconButton
                  colorPalette="primary"
                  size="xs"
                  aria-label="Send message"
                  onClick={() => handleSubmit()}
                  disabled={
                    (!inputValue.trim() && !files) || status !== "ready"
                  }
                  rounded={"full"}
                >
                  <MaterialSymbol>arrow_upward</MaterialSymbol>
                </IconButton>
              )}
            </HStack>
          </HStack>
          {chatErrorMessage && (
            <ChatErrorNotice message={chatErrorMessage} px={2} />
          )}
        </VStack>
      </VStack>
    );
  }

  return (
    <Grid h={"94vh"} templateColumns={"repeat(12, 1fr)"} gap={8}>
      <GridItem colSpan={{ base: 12, xl: 2 }} overflow={"visible"}>
        <AssistantHistorySidebar handleClearChatAction={handleClearChat} />
      </GridItem>
      <GridItem colSpan={{ base: 12, xl: 1 }} overflow={"visible"} />
      <GridItem
        colSpan={{ base: 12, xl: 6 }}
        display={"flex"}
        flexDir={"column"}
        minH={0}
      >
        <VStack
          gap={6}
          align={"stretch"}
          h={"full"}
          flex={1}
          overflow={"hidden"}
        >
          {/* Messages container */}
          <Box
            ref={messagesContainerRef}
            w={"full"}
            borderRadius={"3xl"}
            pb={4}
            flex={1}
            minH={0}
            overflowY="auto"
            overflowX="auto"
          >
            <ScrollArea.Root>
              <ScrollArea.Viewport
                css={isScrollable ? SCROLL_MASK_CSS : undefined}
                ref={sticky.scrollRef}
              >
                <ScrollArea.Content ref={sticky.contentRef}>
                  <VStack gap={4} align={"stretch"} w={"100%"}>
                    {messages.map((message, index) => {
                      const meta = message.metadata as
                        | AssistantMessageMetadata
                        | undefined;
                      const showAvatar =
                        message.role !== "user" &&
                        message.parts.length === 1 &&
                        message.parts[0].type === "text" &&
                        message.parts[0].text === "";
                      return (
                        <Presence
                          key={message.id}
                          present={true}
                          animationName={{ _open: "slide-fade-in" }}
                          animationDuration="moderate"
                        >
                          <Flex
                            justify={
                              message.role === "user"
                                ? "flex-end"
                                : "flex-start"
                            }
                            w="full"
                          >
                            <HStack align="start" gap={2} w="auto" maxW="100%">
                              <Box
                                w={message.role === "user" ? "auto" : "100%"}
                                py={3}
                                px={message.role === "user" ? 4 : 2}
                                borderRadius="3xl"
                                bg={
                                  message.role === "user"
                                    ? { base: "gray.50", _dark: "black" }
                                    : "transparent"
                                }
                                wordBreak="break-word"
                                asChild
                              >
                                <Presence
                                  present={true}
                                  animationName={{ _open: "fade-in" }}
                                  animationDuration="moderate"
                                >
                                  {showAvatar && (
                                    <Avatar.Root
                                      size="sm"
                                      data-state="open"
                                      _open={{
                                        animation: "pulseSize",
                                      }}
                                    >
                                      <Avatar.Image src="/assets/avatar_agent.avif" />
                                      <Avatar.Fallback name="Konfi" />
                                    </Avatar.Root>
                                  )}
                                  <Message
                                    message={message}
                                    t={t}
                                    isLastAssistant={
                                      index === lastAssistantIndex
                                    }
                                    isProcessing={
                                      index === lastAssistantIndex &&
                                      (status === "streaming" ||
                                        status === "submitted")
                                    }
                                    onRegenerate={regenerate}
                                    canRegenerate={canRegenerate}
                                  />
                                </Presence>
                              </Box>
                            </HStack>
                          </Flex>
                          {/* order items */}
                          {meta?.orderItems && !isEmpty(meta.orderItems) && (
                            <Flex
                              w="100%"
                              gap={2}
                              mt={6}
                              px={4}
                              py={6}
                              border="1px solid"
                              borderColor={{
                                base: "gray.200",
                                _dark: "gray.700",
                              }}
                              borderRadius="3xl"
                            >
                              {meta.orderItems.map(
                                (item: FormattedOrderItem) => (
                                  <Item
                                    key={item.id}
                                    item={item as unknown as OrderItem}
                                    channelId={channel?.id ?? ""}
                                    t={t}
                                    i18n={i18n}
                                  />
                                ),
                              )}
                            </Flex>
                          )}
                          {/* references button */}
                          {meta?.references && meta.references.length > 0 && (
                            <Button
                              mt={2}
                              ml={2}
                              bottom="7px"
                              size="xs"
                              variant="surface"
                              onClick={() =>
                                startTransition(() =>
                                  handleOpenReferences(meta.references!),
                                )
                              }
                            >
                              <MaterialSymbol>article_shortcut</MaterialSymbol>
                              {meta.references.length}{" "}
                              {t("assistant.references", {
                                defaultValue: "References",
                              })}
                            </Button>
                          )}
                        </Presence>
                      );
                    })}
                    {/* Thinking indicator when AI is processing */}
                    {(status === "streaming" || status === "submitted") && (
                      <ThinkingIndicator />
                    )}
                    {/* anchor element – stays at the very end */}
                    <div ref={bottomRef} />
                  </VStack>
                </ScrollArea.Content>
              </ScrollArea.Viewport>
              <ScrollToBottom sticky={sticky} t={t} />
            </ScrollArea.Root>
          </Box>
          {isEmpty(messages) && (
            <Presence
              present={true}
              animationName={{ _open: "fade-in" }}
              animationDuration="moderate"
            >
              <Heading size={"4xl"} w={"33%"}>
                {t("assistant.greeting", {
                  defaultValue: "Hello! How can I help You today?",
                })}
              </Heading>
            </Presence>
          )}
          {isEmpty(messages) && (
            <SampleMessages
              isLoading={status !== "ready"}
              onSendMessage={handleSubmit}
              onSetInputValue={setInputValue}
            />
          )}
          {/* Input area */}
          <VStack w="full" gap={2} align="stretch">
            <HStack
              w={"full"}
              gap={2}
              position={"relative"}
              pt={"16px"}
              pb={"72px"}
              bgColor={{ base: "gray.50", _dark: "black" }}
              borderRadius={"3xl"}
            >
              <Textarea
                focusRingColor={"transparent"}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyUp={handleKeyPress}
                placeholder={t("assistant.messagePlaceholder", {
                  defaultValue: "Type a message...",
                })}
                borderRadius="3xl"
                autoresize
                rows={1}
                maxHeight={"200px"}
                flex={1}
                variant={"subtle"}
                size={"lg"}
                disabled={status !== "ready"}
                bgColor={{ base: "gray.50", _dark: "black" }}
                pt={0}
              />
              {/* Display selected files */}
              {files && files.length > 0 && (
                <Box position={"absolute"} top={"-40px"} left={4}>
                  <HStack gap={2} flexWrap="wrap">
                    {Array.from(files).map((file, idx) => (
                      <Card.Root key={idx} size="sm">
                        <Card.Body p={2}>
                          <HStack gap={1}>
                            <MaterialSymbol>
                              {file.type.startsWith("image/")
                                ? "image"
                                : "attachment"}
                            </MaterialSymbol>
                            <Text fontSize="xs" maxLines={3} maxW="100px">
                              {file.name}
                            </Text>
                            <IconButton
                              size="xs"
                              variant="ghost"
                              aria-label="Remove file"
                              onClick={() => {
                                const dt = new DataTransfer();
                                Array.from(files).forEach((f, i) => {
                                  if (i !== idx) dt.items.add(f);
                                });
                                setFiles(
                                  dt.files.length > 0 ? dt.files : undefined,
                                );
                                if (fileInputRef.current) {
                                  fileInputRef.current.files = dt.files;
                                }
                              }}
                            >
                              <MaterialSymbol>close</MaterialSymbol>
                            </IconButton>
                          </HStack>
                        </Card.Body>
                      </Card.Root>
                    ))}
                  </HStack>
                </Box>
              )}
              <HStack
                justify={"space-between"}
                position={"absolute"}
                bottom={"4"}
                px={4}
                w={"100%"}
              >
                <Box>
                  <HStack gap={2}>
                    {/* File upload button */}
                    <input
                      type="file"
                      ref={fileInputRef}
                      style={{ display: "none" }}
                      multiple
                      accept="image/*,application/pdf,text/*"
                      size={5 * 1024 * 1024} // 5MB limit per file
                      onChange={(e) => {
                        if (e.target.files) {
                          setFiles(e.target.files);
                        }
                      }}
                    />
                    <IconButton
                      aria-label="Attach files"
                      rounded={"full"}
                      variant={"outline"}
                      disabled={status !== "ready"}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <MaterialSymbol>attach_file</MaterialSymbol>
                    </IconButton>
                    {/* Model selector popup */}
                    <Menu.Root>
                      <Menu.Trigger asChild>
                        <Button
                          colorPalette={
                            currentModelConfig.isExperimental
                              ? "amber"
                              : "neutral"
                          }
                          aria-label="Model Settings"
                          rounded={"full"}
                          variant={"outline"}
                          disabled={status !== "ready"}
                        >
                          <MaterialSymbol>expand_less</MaterialSymbol>
                          {getModelLabel(currentModel)}
                        </Button>
                        {/* </Tooltip> */}
                      </Menu.Trigger>
                      <Menu.Positioner>
                        <Menu.Content>
                          <Menu.ItemGroup>
                            <Menu.ItemGroupLabel>
                              {t("assistant.selectModel", {
                                defaultValue: "Select model",
                              })}
                            </Menu.ItemGroupLabel>
                            {assistantModelConfigs.map((modelConfig) => (
                              <Menu.Item
                                value={modelConfig.id}
                                key={modelConfig.id}
                                onClick={() => {
                                  updateModel(modelConfig.id);
                                }}
                                color={
                                  modelConfig.isExperimental
                                    ? "amber.500"
                                    : undefined
                                }
                              >
                                {modelConfig.isExperimental && (
                                  <Box
                                    fontSize="xs"
                                    px={1}
                                    py={0.5}
                                    borderRadius="sm"
                                    bg="amber.100"
                                    color="amber.800"
                                  >
                                    {t("assistant.experimental", {
                                      defaultValue: "Experimental",
                                    })}
                                  </Box>
                                )}
                                {getModelLabel(modelConfig.id)}
                              </Menu.Item>
                            ))}
                          </Menu.ItemGroup>
                        </Menu.Content>
                      </Menu.Positioner>
                    </Menu.Root>
                    <Show when={!isEmpty(orderItems)}>
                      <Dialog.Root
                        size="full"
                        lazyMount
                        unmountOnExit
                        open={isOrderDialogOpen}
                        onOpenChange={({ open }) => setIsOrderDialogOpen(open)}
                      >
                        <Dialog.Trigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            colorPalette="primary"
                            animation={"fade-in 300ms ease-out"}
                          >
                            <MaterialSymbol>edit</MaterialSymbol>
                            {t("order.new", { defaultValue: "New Order" })}
                          </Button>
                        </Dialog.Trigger>
                        <Portal>
                          <Dialog.Backdrop />
                          <Dialog.Positioner>
                            <Dialog.Content>
                              <Dialog.Body pt={8}>
                                <CreateOrderPage
                                  orderItems={memoizedOrderItems}
                                />
                              </Dialog.Body>
                              <Dialog.Footer>
                                <Dialog.ActionTrigger asChild>
                                  <Button variant="outline">
                                    {t("common.cancel", {
                                      defaultValue: "Cancel",
                                    })}
                                  </Button>
                                </Dialog.ActionTrigger>
                              </Dialog.Footer>
                              <Dialog.CloseTrigger asChild>
                                <CloseButton size="sm" />
                              </Dialog.CloseTrigger>
                            </Dialog.Content>
                          </Dialog.Positioner>
                        </Portal>
                      </Dialog.Root>
                    </Show>
                    <Show when={!isEmpty(orderItems)}>
                      <Dialog.Root
                        size="full"
                        lazyMount
                        unmountOnExit
                        open={isQuoteDialogOpen}
                        onOpenChange={({ open }) => setIsQuoteDialogOpen(open)}
                      >
                        <Dialog.Trigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            colorPalette="primary"
                            animation={"fade-in 300ms ease-out"}
                          >
                            <MaterialSymbol>edit</MaterialSymbol>
                            {t("quote.new", { defaultValue: "New Quote" })}
                          </Button>
                        </Dialog.Trigger>
                        <Portal>
                          <Dialog.Backdrop />
                          <Dialog.Positioner>
                            <Dialog.Content>
                              <Dialog.Body pt={8}>
                                <CreateQuotePage
                                  orderItems={memoizedOrderItems}
                                />
                              </Dialog.Body>
                              <Dialog.Footer>
                                <Dialog.ActionTrigger asChild>
                                  <Button variant="outline">
                                    {t("common.cancel", {
                                      defaultValue: "Cancel",
                                    })}
                                  </Button>
                                </Dialog.ActionTrigger>
                              </Dialog.Footer>
                              <Dialog.CloseTrigger asChild>
                                <CloseButton size="sm" />
                              </Dialog.CloseTrigger>
                            </Dialog.Content>
                          </Dialog.Positioner>
                        </Portal>
                      </Dialog.Root>
                    </Show>
                  </HStack>
                </Box>
                {/* Stop button when streaming */}
                {status === "streaming" || status === "submitted" ? (
                  <IconButton
                    colorPalette="red"
                    aria-label={t("assistant.stop", { defaultValue: "Stop" })}
                    onClick={() => stop()}
                    rounded={"full"}
                  >
                    <MaterialSymbol>stop</MaterialSymbol>
                  </IconButton>
                ) : (
                  <IconButton
                    colorPalette="primary"
                    aria-label="Send message"
                    onClick={() => handleSubmit()}
                    disabled={
                      (!inputValue.trim() && !files) || status !== "ready"
                    }
                    rounded={"full"}
                  >
                    <MaterialSymbol>arrow_upward</MaterialSymbol>
                  </IconButton>
                )}
              </HStack>
            </HStack>
            {chatErrorMessage && (
              <ChatErrorNotice message={chatErrorMessage} px={4} />
            )}
          </VStack>
        </VStack>
        <Drawer.Root
          open={showReferences}
          onOpenChange={({ open }) => setShowReferences(open)}
          size={"lg"}
        >
          <Portal>
            <Drawer.Backdrop />
            <Drawer.Positioner>
              <Drawer.Content>
                <Drawer.Header>
                  <Drawer.Title>
                    {t("assistant.references", { defaultValue: "References" })}
                  </Drawer.Title>
                </Drawer.Header>
                <Drawer.Body>
                  <Stack>
                    {currentReferences.map((reference, index) => (
                      <Card.Root
                        key={index}
                        flexDirection="row"
                        overflow="hidden"
                        w={"100%"}
                        position={"relative"}
                      >
                        {reference.thumbnail && (
                          <Image
                            position={"absolute"}
                            bottom={4}
                            right={4}
                            objectFit={"cover"}
                            ratio={1}
                            width={100}
                            height={100}
                            borderRadius={"full"}
                            src={reference.thumbnail}
                            alt={reference.thumbnail}
                            priority={false}
                          />
                        )}
                        <Box>
                          <Card.Body>
                            {reference.title && (
                              <Card.Title mb="2">{reference.title}</Card.Title>
                            )}
                            {reference.content && (
                              <Card.Description>
                                {reference.content}
                              </Card.Description>
                            )}
                          </Card.Body>
                          {reference.url && (
                            <Card.Footer>
                              <ButtonLink
                                lng={i18n.resolvedLanguage}
                                size={"sm"}
                                variant={"outline"}
                                href={reference.url}
                                rel={"noopener noreferrer"}
                                ariaLabel={t("assistant.openInNewTab", {
                                  defaultValue: "Open in new tab",
                                })}
                                isExternal={true}
                              >
                                <MaterialSymbol>open_in_new</MaterialSymbol>
                                {t("assistant.openInNewTab", {
                                  defaultValue: "Open in new tab",
                                })}
                              </ButtonLink>
                            </Card.Footer>
                          )}
                        </Box>
                      </Card.Root>
                    ))}
                  </Stack>
                </Drawer.Body>
                <Drawer.CloseTrigger asChild>
                  <CloseButton size="sm" />
                </Drawer.CloseTrigger>
              </Drawer.Content>
            </Drawer.Positioner>
          </Portal>
        </Drawer.Root>
      </GridItem>
      <GridItem colSpan={{ base: 12, xl: 3 }} overflow={"visible"} />
    </Grid>
  );
}

interface MessageProps {
  message: UIMessage;
  t: TFunction;
  isLastAssistant?: boolean;
  isProcessing?: boolean;
  onRegenerate?: () => void;
  canRegenerate?: boolean;
}

const Message = ({
  message,
  t,
  isLastAssistant,
  isProcessing,
  onRegenerate,
  canRegenerate,
}: MessageProps) => {
  const reasoningEntries = message.parts
    .map((part, index) => ({ part, index }))
    .filter(
      (entry) =>
        entry.part.type === "reasoning" &&
        typeof (entry.part as any).text === "string",
    )
    .map((entry) => ({
      index: entry.index,
      text: (entry.part as any).text as string,
    }));

  const nonReasoningEntries = message.parts
    .map((part, index) => ({ part, index }))
    .filter((entry) => entry.part.type !== "reasoning");

  const currentReasoning =
    reasoningEntries.length > 0
      ? reasoningEntries[reasoningEntries.length - 1]
      : undefined;
  const hasFinalResponse = nonReasoningEntries.some(
    (entry) =>
      entry.part.type === "text" &&
      typeof entry.part.text === "string" &&
      entry.part.text.trim().length > 0,
  );
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [showActionButtons, setShowActionButtons] = useState(false);

  // Extract all text content for copy functionality
  const textContent = useMemo(() => {
    return message.parts
      .filter(
        (part) =>
          part.type === "text" && typeof (part as TextPart).text === "string",
      )
      .map((part) => (part as TextPart).text)
      .join("\n");
  }, [message.parts]);

  useEffect(() => {
    if (!hasFinalResponse && isHistoryOpen) {
      setIsHistoryOpen(false);
    }
  }, [hasFinalResponse, isHistoryOpen]);

  return (
    <Box
      position="relative"
      w="100%"
      onMouseEnter={() => setShowActionButtons(true)}
      onMouseLeave={() => setShowActionButtons(false)}
    >
      {/* Action buttons - appear on hover for assistant messages */}
      {message.role === "assistant" && (textContent || isLastAssistant) && (
        <Presence
          present={showActionButtons}
          animationName={{ _open: "fade-in", _closed: "fade-out" }}
          animationDuration="fast"
        >
          <HStack
            fontSize="xs"
            position="absolute"
            top={-6}
            right={0}
            zIndex={10}
            gap={1}
          >
            {/* Regenerate button - only for last assistant message */}
            {isLastAssistant && onRegenerate && (
              <MaterialSymbol onClick={() => canRegenerate && onRegenerate()}>
                refresh
              </MaterialSymbol>
            )}
            {/* Copy button */}
            {textContent && (
              <Clipboard.Root value={textContent}>
                <Clipboard.Trigger asChild>
                  <Clipboard.Indicator
                    copied={<MaterialSymbol>check</MaterialSymbol>}
                  >
                    <MaterialSymbol>content_copy</MaterialSymbol>
                  </Clipboard.Indicator>
                </Clipboard.Trigger>
              </Clipboard.Root>
            )}
          </HStack>
        </Presence>
      )}
      <VStack align="stretch" gap={3} w={"100%"}>
        {currentReasoning && currentReasoning.text.trim() !== "" && (
          <Presence
            key={`${message.id}-reasoning-active`}
            present={true}
            animationName={{ _open: "fade-in" }}
            animationDuration="moderate"
          >
            <Card.Root borderRadius="3xl" size="sm" variant="subtle">
              <Card.Header pb={1}>
                <HStack gap={2} align="center" justify="space-between">
                  <HStack gap={2} align="center">
                    <Text fontSize="sm" fontWeight="medium">
                      {t("assistant.reasoningSummary", {
                        defaultValue: "Reasoning summary",
                      })}
                    </Text>
                  </HStack>
                  <Text
                    fontSize="xs"
                    color={{ base: "gray.500", _dark: "gray.400" }}
                  >
                    {t("assistant.reasoningStepCounter", {
                      defaultValue: "Step {{current}} of {{total}}",
                      current: reasoningEntries.length,
                      total: reasoningEntries.length,
                    })}
                  </Text>
                </HStack>
              </Card.Header>
              <Card.Body pt={0} fontSize="xs">
                <ScrollArea.Root height={12}>
                  <ScrollArea.Viewport css={SCROLL_MASK_CSS}>
                    <ScrollArea.Content>
                      <Streamdown
                        components={mdxComponents}
                        plugins={streamdownPlugins}
                      >
                        {currentReasoning.text}
                      </Streamdown>
                    </ScrollArea.Content>
                  </ScrollArea.Viewport>
                </ScrollArea.Root>
              </Card.Body>
            </Card.Root>
          </Presence>
        )}
        {hasFinalResponse && reasoningEntries.length > 0 && (
          <Presence
            key={`${message.id}-reasoning-history`}
            present={true}
            animationName={{ _open: "fade-in" }}
            animationDuration="moderate"
          >
            <Collapsible.Root
              lazyMount
              open={isHistoryOpen}
              onOpenChange={({ open }) => setIsHistoryOpen(open)}
            >
              <Collapsible.Trigger asChild>
                <Button
                  size="xs"
                  variant="surface"
                  colorPalette="neutral"
                  gap={2}
                  pr={4}
                >
                  <MaterialSymbol>
                    {isHistoryOpen ? "unfold_less" : "unfold_more"}
                  </MaterialSymbol>
                  {isHistoryOpen
                    ? t("assistant.hideReasoningSteps", {
                        defaultValue: "Hide reasoning steps",
                      })
                    : t("assistant.viewReasoningSteps", {
                        defaultValue: "View reasoning steps ({{count}})",
                        count: reasoningEntries.length,
                      })}
                </Button>
              </Collapsible.Trigger>
              <Collapsible.Content>
                <VStack align="stretch" gap={2} mt={3}>
                  {reasoningEntries.map((entry, idx) => (
                    <Card.Root
                      key={`${message.id}-reasoning-${entry.index}`}
                      borderRadius="3xl"
                      size="sm"
                      variant="subtle"
                    >
                      <Card.Header pb={1}>
                        <HStack gap={2} align="center">
                          <Text fontSize="xs" fontWeight="medium">
                            {t("assistant.reasoningStep", {
                              defaultValue:
                                "Reasoning step {{current}} of {{total}}",
                              current: idx + 1,
                              total: reasoningEntries.length,
                            })}
                          </Text>
                        </HStack>
                      </Card.Header>
                      <Card.Body pt={0} fontSize="xs">
                        <Streamdown
                          components={mdxComponents}
                          plugins={streamdownPlugins}
                        >
                          {entry.text}
                        </Streamdown>
                      </Card.Body>
                    </Card.Root>
                  ))}
                </VStack>
              </Collapsible.Content>
            </Collapsible.Root>
          </Presence>
        )}
        {nonReasoningEntries.map(({ part, index }) => {
          if (part.type === "text") {
            return (
              <Presence
                key={`${message.id}-text-${index}`}
                present={true}
                animationName={{ _open: "fade-in" }}
                animationDuration="moderate"
              >
                <Streamdown
                  components={mdxComponents}
                  plugins={streamdownPlugins}
                >
                  {part.text}
                </Streamdown>
              </Presence>
            );
          }

          if (part.type === "file") {
            const filePart = part as FileUIPart;

            if (filePart.mediaType?.startsWith("image/")) {
              return (
                <Box key={`${message.id}-file-${index}`} mt={2}>
                  <Image
                    width={400}
                    height={400}
                    ratio={1}
                    src={filePart.url}
                    alt={filePart.filename || "Uploaded image"}
                    priority={false}
                    borderRadius="2xl"
                  />
                </Box>
              );
            }

            if (filePart.mediaType === "application/pdf") {
              return (
                <Box key={`${message.id}-file-${index}`} mt={2}>
                  <Card.Root>
                    <Card.Body>
                      <HStack gap={2}>
                        <MaterialSymbol>picture_as_pdf</MaterialSymbol>
                        <Text>{filePart.filename || "PDF Document"}</Text>
                      </HStack>
                    </Card.Body>
                  </Card.Root>
                </Box>
              );
            }

            return (
              <Box key={`${message.id}-file-${index}`} mt={2}>
                <Card.Root>
                  <Card.Body>
                    <HStack gap={2}>
                      <MaterialSymbol>attachment</MaterialSymbol>
                      <Text>{filePart.filename || "File"}</Text>
                    </HStack>
                  </Card.Body>
                </Card.Root>
              </Box>
            );
          }

          // Native AI SDK source part for citations
          if (part.type === "source-url") {
            const sourcePart = part as SourceUrlUIPart;
            return (
              <Presence
                key={`${message.id}-source-${index}`}
                present={true}
                animationName={{ _open: "fade-in" }}
                animationDuration="moderate"
              >
                <Card.Root size="sm" variant="outline" borderRadius="xl">
                  <Card.Body py={2} px={3}>
                    <HStack gap={2}>
                      <MaterialSymbol color="primaryAccent.fg">
                        link
                      </MaterialSymbol>
                      <a
                        href={sourcePart.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ textDecoration: "none" }}
                      >
                        <Text
                          fontSize="sm"
                          color="primaryAccent.fg"
                          _hover={{ textDecoration: "underline" }}
                        >
                          {sourcePart.title || sourcePart.url}
                        </Text>
                      </a>
                    </HStack>
                  </Card.Body>
                </Card.Root>
              </Presence>
            );
          }

          if (typeof part.type === "string" && part.type.startsWith("tool-")) {
            const toolName = part.type.slice(5);
            const toolPart = part as RenderableToolPart;
            const toolResult = getToolOutput(toolPart);

            // Always show startDurableAgent tool results with the button
            const isAgentResult =
              toolName === "startDurableAgent" && isAgentToolResult(toolResult);

            // For other tools, hide if there's text content or not the last part
            if (!isAgentResult) {
              if (
                message.parts[0].type === "text" &&
                (message.parts[0] as TextPart).text.trim() !== ""
              ) {
                return null;
              }

              if (message.parts.length - 1 !== index) {
                return null;
              }
            }

            return (
              <Presence
                key={`${message.id}-tool-${toolName}-${index}`}
                present={true}
                animationName={{ _open: "fade-in" }}
                animationDuration="moderate"
              >
                <ToolCallDisplay
                  toolName={toolName}
                  toolResult={toolResult}
                  toolState={toolPart.state}
                  errorText={toolPart.errorText}
                  isThinking={
                    Boolean(isProcessing) && !hasFinalResponse && !isAgentResult
                  }
                  t={t}
                />
              </Presence>
            );
          }

          return null;
        })}
      </VStack>
    </Box>
  );
};

const ToolCallDisplay = ({
  toolName,
  toolResult,
  toolState,
  errorText,
  isThinking,
  t,
}: {
  toolName: string;
  toolResult?: unknown;
  toolState?: ToolPartState;
  errorText?: string;
  isThinking?: boolean;
  t: TFunction;
}) => {
  const { i18n } = useT(["order", "translation"]);

  // Show button for completed agent runs
  if (toolName === "startDurableAgent" && isAgentToolResult(toolResult)) {
    return (
      <Card.Root
        size="sm"
        variant="outline"
        borderRadius="xl"
        colorPalette="primary"
      >
        <Card.Body py={3} px={4}>
          <HStack justify="space-between" gap={4}>
            <HStack gap={2}>
              <MaterialSymbol color="primary.solid">automation</MaterialSymbol>
              <VStack align="start" gap={0}>
                <Text fontSize="sm" fontWeight="medium">
                  {t("assistant.agentStarted", {
                    defaultValue: "Agent started successfully",
                  })}
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  {t(`agents.taskType.${toolResult.taskType}`, {
                    defaultValue:
                      toolResult.taskType === "quote"
                        ? "Quote"
                        : toolResult.taskType,
                  })}
                </Text>
              </VStack>
            </HStack>
            <ButtonLink
              lng={i18n.resolvedLanguage}
              href={ADMIN_TOOLS_TASKS}
              size="sm"
              colorPalette="primary"
              variant="solid"
              ariaLabel={t("assistant.viewAgentRun", {
                defaultValue: "View agent run",
              })}
            >
              <MaterialSymbol>open_in_new</MaterialSymbol>
              {t("assistant.viewAgentRun", { defaultValue: "View agent run" })}
            </ButtonLink>
          </HStack>
        </Card.Body>
      </Card.Root>
    );
  }

  const isComplete =
    toolState === "output-available" || toolResult !== undefined;
  const isFailed =
    toolState === "output-error" ||
    toolState === "output-denied" ||
    Boolean(errorText);
  const statusLabel = isFailed
    ? t("assistant.toolFailed", { defaultValue: "Failed" })
    : isThinking && isComplete
      ? t("assistant.thinking", { defaultValue: "Thinking…" })
      : isComplete
        ? t("assistant.toolCompleted", { defaultValue: "Completed" })
        : t(`assistant.tools.${toolName}`, { defaultValue: "Getting data..." });
  const statusIcon = isFailed ? "error" : isComplete ? "check_circle" : "bolt";
  const statusColor = isFailed
    ? "red.500"
    : isComplete
      ? "success.500"
      : undefined;

  if (isThinking && isComplete && !isFailed) {
    return (
      <Text
        fontWeight="bold"
        bgImage={themeGradients.chatShimmer}
        bgClip="text"
        backgroundSize="400% 100%"
        animation="shimmerText"
        color="transparent"
        py={2}
        px={2}
      >
        {statusLabel}
      </Text>
    );
  }

  if (isComplete || isFailed) {
    return (
      <HStack py={2} px={2} gap={2} color="fg.muted">
        <MaterialSymbol color={statusColor}>{statusIcon}</MaterialSymbol>
        <Text fontSize="sm" fontWeight="medium">
          {statusLabel}
        </Text>
      </HStack>
    );
  }

  return (
    <Text
      fontWeight="bold"
      bgImage={themeGradients.chatShimmer}
      bgClip="text"
      backgroundSize="400% 100%"
      animation="shimmerText"
      color="transparent"
      py={2}
      px={2}
    >
      {t(`assistant.tools.${toolName}`, { defaultValue: "Getting data..." })}
    </Text>
  );
};

// Thinking indicator shown when AI is processing
const ThinkingIndicator = () => {
  return (
    <Presence
      present={true}
      animationName={{ _open: "fade-in" }}
      animationDuration="fast"
    >
      <Flex justify="flex-start" w="full">
        <Avatar.Root
          size="sm"
          data-state="open"
          _open={{
            animation: "pulseSize 1.5s ease-in-out infinite",
          }}
        >
          <Avatar.Image src="/assets/avatar_agent.avif" />
          <Avatar.Fallback name="Konfi" />
        </Avatar.Root>
      </Flex>
    </Presence>
  );
};
