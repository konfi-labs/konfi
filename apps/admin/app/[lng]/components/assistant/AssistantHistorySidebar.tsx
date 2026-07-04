"use client";

import { useT } from "@/i18n/client";
import { filterLocalFuseItems } from "@/lib/local-fuse-search";
import {
  Box,
  Button,
  Input,
  InputGroup,
  Presence,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { ADMIN_TOOLS_CHAT_ID } from "@konfi/utils";
import { generateId } from "ai";
import { useAssistantHistory } from "context/assistant-history";
import { isEmpty } from "es-toolkit/compat";
import { useMemo, useState } from "react";
import { ConversationListItem } from "./ConversationListItem";
import { PrivateModeToggle } from "./PrivateModeToggle";

export function AssistantHistorySidebar({
  handleClearChatAction,
}: {
  handleClearChatAction: () => void;
}) {
  const { t, i18n } = useT();

  const {
    conversations,
    currentConversation,
    currentSession,
    loadConversation,
    clearSession,
  } = useAssistantHistory();

  const [searchTerm, setSearchTerm] = useState("");

  const filteredConversations = useMemo(() => {
    return filterLocalFuseItems(conversations ?? [], searchTerm, {
      keys: ["title"],
      threshold: 0.36,
    });
  }, [conversations, searchTerm]);

  const handleNewConversation = () => {
    clearSession();
    handleClearChatAction();
    history.pushState(
      {},
      "",
      "/" + i18n.resolvedLanguage + ADMIN_TOOLS_CHAT_ID(generateId()),
    );
  };

  const handleLoadConversation = async (conversationId: string) => {
    await loadConversation(conversationId);
    history.pushState(
      {},
      "",
      "/" + i18n.resolvedLanguage + ADMIN_TOOLS_CHAT_ID(conversationId),
    );
  };

  return (
    <Box
      overflow="visible"
      display="flex"
      flexDirection="column"
      p={1.5}
      borderRadius="2xl"
      h="100%"
    >
      {/* Header */}
      <VStack
        gap={2}
        borderBottom="1px"
        borderColor={{ base: "gray.200", _dark: "gray.600" }}
      >
        <Button
          w={"100%"}
          onClick={handleNewConversation}
          size={"xs"}
          variant={"outline"}
          disabled={isEmpty(currentSession.messages)}
        >
          <MaterialSymbol>chat_add_on</MaterialSymbol>
          {t("assistant.history.new")}
        </Button>
        <PrivateModeToggle />
      </VStack>

      {/* Search */}
      <InputGroup startElement={<MaterialSymbol pt={2}>search</MaterialSymbol>}>
        <Input
          mt={2}
          placeholder={t("assistant.history.searchPlaceholder")}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          size={"xs"}
        />
      </InputGroup>

      {/* Conversations List */}
      <Box flex={1} overflow="auto">
        <Stack mt={2} gap={2}>
          {!isEmpty(filteredConversations) ? (
            filteredConversations.map((conversation) => (
              <ConversationListItem
                key={conversation.id}
                conversation={conversation}
                isActive={currentConversation?.id === conversation.id}
                onSelect={handleLoadConversation}
              />
            ))
          ) : (
            <Presence
              present={true}
              animationName={{ _open: "fade-in" }}
              animationDuration="moderate"
            >
              <Text pt={6} fontSize={"sm"} color={"gray.500"}>
                {searchTerm
                  ? t("assistant.history.noChatFound")
                  : t("assistant.history.noChatYet")}
              </Text>
            </Presence>
          )}
        </Stack>
      </Box>
    </Box>
  );
}
