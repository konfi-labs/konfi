"use client";

import { useConfigurationMembers } from "@/context/configuration";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import {
  Badge,
  Box,
  Button,
  Card,
  Collapsible,
  Flex,
  HStack,
  IconButton,
  ScrollArea,
  Skeleton,
  Stack,
  Text,
  Textarea,
  Tooltip,
  VStack,
  Wrap,
  WrapItem,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components/shared/MaterialSymbol";
import { ScrollToBottom } from "@konfi/components/shared/ScrollToBottom";
import { Avatar } from "@konfi/components/ui/avatar";
import {
  createTeamMessage,
  ensureDefaultTeamChatThread,
  getTeamChatChannels,
  getTeamChatThreads,
  subscribeToTeamMessages,
} from "@konfi/firebase";
import type {
  NestedMember,
  TeamChatChannel,
  TeamChatThread,
  TeamMessage,
} from "@konfi/types";
import { SCROLL_MASK_CSS } from "@konfi/utils/constants";
import { safeLocalStorage } from "@konfi/utils/safe-local-storage";
import { useChannels } from "context/channels";
import { useCurrentMember } from "context/current-member";
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useStickToBottom } from "use-stick-to-bottom";

// Helper function to determine if we should show a time separator
function shouldShowTimeSeparator(
  currentMessage: TeamMessage,
  previousMessage: TeamMessage | null,
): boolean {
  if (!previousMessage) return true; // Show separator for first message

  const currentTime = currentMessage.createdAt?.toDate
    ? currentMessage.createdAt.toDate()
    : currentMessage.createdAt.toDate();
  const previousTime = previousMessage.createdAt?.toDate
    ? previousMessage.createdAt.toDate()
    : previousMessage.createdAt.toDate();

  const timeDiff = currentTime.getTime() - previousTime.getTime();
  const hoursDiff = timeDiff / (1000 * 60 * 60);

  // Show separator if more than 2 hours have passed
  return hoursDiff >= 2;
}

// Time separator component
function TimeSeparator({ timestamp, lng }: { timestamp: any; lng?: string }) {
  const formatTimeSeparator = (timestamp: any) => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const messageDate = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );

    if (messageDate.getTime() === today.getTime()) {
      // Today - show time
      return date.toLocaleTimeString(lng, {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else {
      // Other days - show date
      return date.toLocaleDateString(lng, { month: "short", day: "numeric" });
    }
  };

  return (
    <Flex justify="center" my={4}>
      <Text
        fontSize="xs"
        color="gray.solid"
        bg={{ base: "white", _dark: "gray.950" }}
        px={3}
        py={1}
        borderRadius="full"
        border="1px solid"
        borderColor="gray.muted"
      >
        {formatTimeSeparator(timestamp)}
      </Text>
    </Flex>
  );
}

export const TeamChat = memo(function TeamChat({
  initialChannelId,
  onUnreadCountChange,
}: {
  initialChannelId?: string;
  onUnreadCountChange?: (count: number) => void;
}) {
  const { t, i18n } = useT();
  const { filteredMembers } = useConfigurationMembers();
  const { currentMember, setCurrentMember } = useCurrentMember();
  const { channel: currentAppChannel } = useChannels();
  const sticky = useStickToBottom();
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [channels, setChannels] = useState<TeamChatChannel[]>([]);
  const [threads, setThreads] = useState<TeamChatThread[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    initialChannelId || null,
  );
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const currentChannel = useMemo(
    () => channels.find((channel) => channel.id === selectedChannelId) ?? null,
    [channels, selectedChannelId],
  );
  const currentChannelDefaultThreadId = currentChannel?.defaultThreadId;
  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [threads, selectedThreadId],
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isScrollable, setIsScrollable] = useState(false);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const isVisibleRef = useRef(true);

  // Get storage key for this member's last read timestamp
  const getStorageKey = useCallback(() => {
    if (!currentMember?.id) return null;
    return `teamChat_lastRead_${currentMember.id}`;
  }, [currentMember?.id]);

  // Load last read timestamp from local storage
  const getLastReadTimestamp = useCallback((): Date => {
    const storageKey = getStorageKey();
    if (!storageKey) return new Date();

    const stored = safeLocalStorage.getItem(storageKey);
    if (stored) {
      const timestamp = new Date(stored);
      // Validate the timestamp is valid
      if (!isNaN(timestamp.getTime())) {
        return timestamp;
      }
    }
    return new Date();
  }, [getStorageKey]);

  // Save last read timestamp to local storage
  const saveLastReadTimestamp = useCallback(
    (timestamp: Date) => {
      const storageKey = getStorageKey();
      if (!storageKey) return;

      safeLocalStorage.setItem(storageKey, timestamp.toISOString());
    },
    [getStorageKey],
  );

  // Check if content is scrollable
  const checkScrollable = useCallback(() => {
    if (scrollViewportRef.current) {
      const { scrollHeight, clientHeight } = scrollViewportRef.current;
      setIsScrollable(scrollHeight > clientHeight);
    }
  }, []);

  useEffect(() => {
    setSelectedThreadId(null);
  }, [selectedChannelId]);

  // Load channels
  useEffect(() => {
    if (!firestore) return;

    const loadChannels = async () => {
      try {
        const channelsData = await getTeamChatChannels(
          firestore,
          currentMember?.id,
        );
        setChannels(channelsData);

        // Auto-select current app channel if available, otherwise first channel
        if (!selectedChannelId && channelsData.length > 0) {
          const _currentAppChannel = channelsData.find(
            (channel) => channel.id === currentAppChannel?.id,
          );
          setSelectedChannelId(currentAppChannel?.id || channelsData[0].id);
        }
      } catch (error) {
        console.error("Error loading channels:", error);
      }
    };

    loadChannels();
  }, [firestore, currentMember, selectedChannelId, currentAppChannel]);

  // Load threads when channel changes
  useEffect(() => {
    if (!firestore || !selectedChannelId) return;

    const loadThreads = async () => {
      try {
        const threadsData = await getTeamChatThreads(
          firestore,
          selectedChannelId,
        );
        setThreads(threadsData);

        if (
          selectedThreadId &&
          threadsData.some((thread) => thread.id === selectedThreadId)
        ) {
          return;
        }

        const preferredThread =
          (currentChannelDefaultThreadId
            ? threadsData.find(
                (thread) => thread.id === currentChannelDefaultThreadId,
              )
            : undefined) ??
          threadsData.find((thread) => thread.isDefault) ??
          threadsData[0];

        if (preferredThread) {
          setSelectedThreadId(preferredThread.id);
        }
      } catch (error) {
        console.error("Error loading threads:", error);
      }
    };

    loadThreads();
  }, [
    firestore,
    selectedChannelId,
    currentChannelDefaultThreadId,
    selectedThreadId,
  ]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Subscribe to messages
  useEffect(() => {
    if (!firestore || !selectedChannelId || !selectedThread?.id) {
      setMessages([]);
      return;
    }

    const unsubscribe = subscribeToTeamMessages(
      firestore,
      selectedChannelId,
      selectedThread.id,
      (newMessages) => {
        setMessages(newMessages.reverse()); // Reverse to show in chronological order
        scrollToBottom();
      },
      50,
    );

    return () => unsubscribe();
  }, [firestore, selectedChannelId, selectedThread?.id, scrollToBottom]);

  // Calculate unread count when messages change or visibility changes
  useEffect(() => {
    if (!currentMember || !onUnreadCountChange) return;

    // Get the last read timestamp from storage
    const lastReadTimestamp = getLastReadTimestamp();

    // If component is visible, update last read timestamp
    if (isVisibleRef.current) {
      const now = new Date();
      saveLastReadTimestamp(now);
      onUnreadCountChange(0);
      return;
    }

    // Count messages that came after last read timestamp from other users
    const unreadMessages = messages.filter((msg) => {
      if (msg.member.id === currentMember.id) return false; // Don't count own messages
      const msgDate = msg.createdAt.toDate();
      return msgDate > lastReadTimestamp;
    });

    onUnreadCountChange(unreadMessages.length);
  }, [
    messages,
    currentMember,
    onUnreadCountChange,
    saveLastReadTimestamp,
    getLastReadTimestamp,
  ]);

  // Track component visibility (when chat is opened/closed)
  useEffect(() => {
    // Mark as visible when component mounts
    isVisibleRef.current = true;
    const now = new Date();
    saveLastReadTimestamp(now);

    return () => {
      // Mark as not visible when component unmounts
      isVisibleRef.current = false;
    };
  }, [saveLastReadTimestamp]);

  // Check scrollability when messages change
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

  const ensureThreadSelection = useCallback(async (): Promise<
    string | undefined
  > => {
    if (!firestore || !selectedChannelId || !currentMember) {
      return undefined;
    }

    if (selectedThreadId) {
      return selectedThreadId;
    }

    const existingDefault =
      (currentChannelDefaultThreadId
        ? threads.find((thread) => thread.id === currentChannelDefaultThreadId)
        : undefined) ?? threads.find((thread) => thread.isDefault);

    if (existingDefault) {
      setSelectedThreadId(existingDefault.id);
      return existingDefault.id;
    }

    const memberSummary: NestedMember = {
      id: currentMember.id,
      name: currentMember.name,
    };

    const ensuredThread = await ensureDefaultTeamChatThread(
      firestore,
      selectedChannelId,
      memberSummary,
      currentChannel?.name,
    );

    if (!ensuredThread) {
      return undefined;
    }

    setThreads((prev) => {
      const exists = prev.some((thread) => thread.id === ensuredThread.id);
      if (exists) {
        return prev.map((thread) =>
          thread.id === ensuredThread.id ? ensuredThread : thread,
        );
      }
      return [...prev, ensuredThread];
    });

    setSelectedThreadId(ensuredThread.id);
    setChannels((prev) =>
      prev.map((channel) =>
        channel.id === selectedChannelId
          ? { ...channel, defaultThreadId: ensuredThread.id }
          : channel,
      ),
    );

    return ensuredThread.id;
  }, [
    firestore,
    selectedChannelId,
    selectedThreadId,
    currentMember,
    currentChannel,
    currentChannelDefaultThreadId,
    threads,
    setChannels,
  ]);

  const sendMessage = useCallback(async () => {
    if (
      !inputValue.trim() ||
      !currentMember ||
      !selectedChannelId ||
      !firestore
    )
      return;

    try {
      const threadId = await ensureThreadSelection();
      if (!threadId) {
        console.warn(
          "Unable to resolve team chat thread before sending message.",
        );
        return;
      }

      await createTeamMessage(firestore, {
        text: inputValue,
        member: {
          id: currentMember.id,
          name: currentMember.name,
        },
        channelId: selectedChannelId,
        threadId,
        mentions: extractMentions(inputValue),
      });

      setInputValue("");
    } catch (error) {
      console.error("Error sending message:", error);
    }
  }, [
    inputValue,
    currentMember,
    selectedChannelId,
    firestore,
    ensureThreadSelection,
  ]);

  const extractMentions = (text: string): string[] => {
    const mentions = text.match(/@(\w+)/g) || [];
    return mentions.map((m) => m.slice(1));
  };

  if (!firestore) {
    return (
      <Box p={4}>
        <VStack align="stretch" gap={3}>
          <Skeleton h="10" borderRadius="xl" />
          <Skeleton h="24" borderRadius="2xl" />
          <Skeleton h="10" borderRadius="xl" />
        </VStack>
      </Box>
    );
  }

  return (
    <Flex
      direction="column"
      w="full"
      maxH={{ base: "75vh", md: "65vh" }}
      minH="420px"
    >
      {/* Channel and Thread Selector */}
      <Collapsible.Root>
        <Collapsible.Trigger asChild>
          <Button size="xs" w="full" variant="surface" my={4}>
            <MaterialSymbol style={{ marginRight: 4 }}>settings</MaterialSymbol>
            {t("teamChat.settings", { defaultValue: "Settings" })}
          </Button>
        </Collapsible.Trigger>
        <Collapsible.Content>
          <VStack p={4} align="stretch" gap={2}>
            {/* Channel Selector */}
            <Stack
              direction={{ base: "column", md: "row" }}
              align={{ base: "flex-start", md: "center" }}
              gap={2}
            >
              <Text fontSize="sm" fontWeight="bold">
                {t("teamChat.channel", { defaultValue: "Channel" })}:
              </Text>
              <Wrap gap="2">
                {channels.map((channel) => (
                  <WrapItem key={channel.id}>
                    <Button
                      size="xs"
                      variant={
                        selectedChannelId === channel.id ? "solid" : "outline"
                      }
                      colorPalette="primary"
                      onClick={() => setSelectedChannelId(channel.id)}
                    >
                      <HStack gap={1}>
                        <Text as="span">{channel.name}</Text>
                        {channel.kind === "custom" && (
                          <Badge size="xs" colorPalette="purple">
                            {t("teamChat.customChannel", {
                              defaultValue: "Custom",
                            })}
                          </Badge>
                        )}
                        {channel.kind === "global" && (
                          <Badge size="xs" colorPalette="green">
                            {t("teamChat.globalChannel", {
                              defaultValue: "Global",
                            })}
                          </Badge>
                        )}
                      </HStack>
                    </Button>
                  </WrapItem>
                ))}
              </Wrap>
            </Stack>

            {/* Thread Selector */}
            {threads.length > 0 && (
              <Stack
                direction={{ base: "column", md: "row" }}
                align={{ base: "flex-start", md: "center" }}
                gap={2}
              >
                <Text fontSize="sm" fontWeight="bold">
                  {t("teamChat.thread", { defaultValue: "Thread" })}:
                </Text>
                <Wrap gap="2">
                  {threads.map((thread) => (
                    <WrapItem key={thread.id}>
                      <Button
                        size="xs"
                        variant={
                          selectedThreadId === thread.id ? "solid" : "outline"
                        }
                        colorPalette="gray"
                        onClick={() => setSelectedThreadId(thread.id)}
                      >
                        {thread.title}
                        {thread.isDefault && (
                          <Badge
                            size="xs"
                            colorPalette="green"
                            variant="solid"
                            ml={1}
                          >
                            {t("common.default", { defaultValue: "Default" })}
                          </Badge>
                        )}
                      </Button>
                    </WrapItem>
                  ))}
                </Wrap>
              </Stack>
            )}

            {/* Member Selector */}
            <Stack
              direction={{ base: "column", md: "row" }}
              align={{ base: "flex-start", md: "center" }}
              gap={2}
            >
              <Text fontSize="sm" fontWeight="bold">
                {t("teamChat.postingAs", { defaultValue: "Posting as" })}:
              </Text>
              <Wrap gap="2">
                {filteredMembers?.map((member) => (
                  <WrapItem key={member.id}>
                    <Tooltip.Root>
                      <Tooltip.Trigger asChild>
                        <IconButton
                          aria-label={member.name}
                          onClick={() => setCurrentMember(member)}
                          variant={
                            currentMember?.id === member.id ? "solid" : "ghost"
                          }
                          colorPalette="primary"
                          size="sm"
                        >
                          <Avatar name={member.name} size="xs" />
                        </IconButton>
                      </Tooltip.Trigger>
                      <Tooltip.Positioner>
                        <Tooltip.Content>{member.name}</Tooltip.Content>
                      </Tooltip.Positioner>
                    </Tooltip.Root>
                  </WrapItem>
                ))}
              </Wrap>
            </Stack>
          </VStack>
        </Collapsible.Content>
      </Collapsible.Root>

      {/* Messages Area */}
      <ScrollArea.Root flex={1} maxH="320px">
        <ScrollArea.Viewport
          p={4}
          css={isScrollable ? SCROLL_MASK_CSS : undefined}
          ref={(node) => {
            sticky.scrollRef.current = node;
            scrollViewportRef.current = node;
          }}
        >
          <ScrollArea.Content spaceY={2} ref={sticky.contentRef}>
            {messages.length === 0 ? (
              <Text textAlign="center" color="gray.solid">
                {t("teamChat.noMessages", {
                  defaultValue: "No messages yet. Start the conversation!",
                })}
              </Text>
            ) : (
              messages.map((message, index) => {
                const prevMessage = index > 0 ? messages[index - 1] : null;
                const showTimeSeparator = shouldShowTimeSeparator(
                  message,
                  prevMessage,
                );

                return (
                  <React.Fragment key={message.id}>
                    {showTimeSeparator && (
                      <TimeSeparator
                        timestamp={message.createdAt}
                        lng={i18n.resolvedLanguage}
                      />
                    )}
                    <MessageBubble
                      message={message}
                      isCurrentUser={message.member.id === currentMember?.id}
                    />
                  </React.Fragment>
                );
              })
            )}
          </ScrollArea.Content>
        </ScrollArea.Viewport>
        <ScrollToBottom sticky={sticky} t={t} />
      </ScrollArea.Root>

      {/* Input Area */}
      <Box px={4} py={4}>
        <Box
          position="relative"
          w="full"
          bgColor={{ base: "white", _dark: "gray.950" }}
          borderRadius="3xl"
          px={4}
          pt="16px"
          pb="52px"
        >
          <HStack align="flex-start" gap={3}>
            <Avatar name={currentMember?.name} size="sm" />
            <Textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={t("teamChat.typeMessage", {
                defaultValue: "Type your message...",
              })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              autoresize
              rows={1}
              maxHeight="200px"
              flex={1}
              variant="subtle"
              size="lg"
              focusRingColor="transparent"
              borderRadius="3xl"
              resize="none"
              pt={0}
              bgColor={{ base: "white", _dark: "gray.950" }}
            />
          </HStack>
          <IconButton
            aria-label={t("teamChat.sendMessage", {
              defaultValue: "Send message",
            })}
            onClick={sendMessage}
            colorPalette="primary"
            disabled={!inputValue.trim()}
            rounded="full"
            position="absolute"
            bottom="4"
            right="4"
          >
            <MaterialSymbol>arrow_upward</MaterialSymbol>
          </IconButton>
        </Box>
      </Box>
    </Flex>
  );
});

function MessageBubble({
  message,
  isCurrentUser,
}: {
  message: TeamMessage;
  isCurrentUser: boolean;
}) {
  const { t } = useT();
  const formatTime = (timestamp: any) => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <Flex justify={isCurrentUser ? "flex-end" : "flex-start"}>
      <HStack align="flex-start" maxW="70%">
        {!isCurrentUser && <Avatar name={message.member.name} size="sm" />}
        <Card.Root
          p={isCurrentUser ? 3 : 1.5}
          bg={
            isCurrentUser
              ? { base: "gray.100", _dark: "gray.950" }
              : "transparent"
          }
          border={!isCurrentUser ? "none" : undefined}
        >
          <Card.Body p={0}>
            <VStack align="stretch" gap={1}>
              <Text>{message.text}</Text>
            </VStack>
          </Card.Body>
        </Card.Root>
      </HStack>
    </Flex>
  );
}
