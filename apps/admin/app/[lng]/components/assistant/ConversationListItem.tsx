"use client";

import { useT } from "@/i18n/client";
import {
  Button,
  CloseButton,
  Dialog,
  HStack,
  IconButton,
  Menu,
  Portal,
  Presence,
  Text,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { AssistantConversation } from "@konfi/types";
import { useAssistantHistory } from "context/assistant-history";
import { useState } from "react";

interface ConversationListItemProps {
  conversation: AssistantConversation;
  isActive?: boolean;
  onSelect: (conversationId: string) => void;
}

export function ConversationListItem({
  conversation,
  isActive,
  onSelect,
}: ConversationListItemProps) {
  const { t } = useT();
  const { deleteConversation } = useAssistantHistory();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleDelete = async () => {
    await deleteConversation(conversation.id);
  };

  return (
    <Presence
      present={true}
      animationName={{ _open: "fade-in" }}
      animationDuration="moderate"
    >
      <HStack
        justify="space-between"
        align="start"
        _hover={{ bg: "gray.muted" }}
        p={1}
        pl={3}
        borderRadius="2xl"
        bg={isActive ? "gray.muted" : "transparent"}
        cursor="pointer"
        onClick={() => onSelect(conversation.id)}
      >
        <Text
          alignSelf="center"
          fontSize="sm"
          fontWeight="medium"
          lineClamp={1}
        >
          {conversation.title
            .trim()
            .split(/\s+/)
            .slice(0, 7) // first few words
            .join(" ")
            .slice(0, 50) ||
            t("assistant.history.new", { defaultValue: "New Conversation" })}
        </Text>
        <Menu.Root>
          <Menu.Trigger asChild>
            <IconButton
              size={"xs"}
              variant="ghost"
              onClick={(e) => e.stopPropagation()}
            >
              <MaterialSymbol>more_vert</MaterialSymbol>
            </IconButton>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content>
                <Menu.Item
                  value="delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDialogOpen(true);
                  }}
                  color={{ base: "red.500", _dark: "red.300" }}
                >
                  <MaterialSymbol>delete</MaterialSymbol>
                  {t("common.delete")}
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      </HStack>
      <Dialog.Root
        open={isDialogOpen}
        onOpenChange={({ open }) => setIsDialogOpen(open)}
        placement="center"
        role="alertdialog"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>{t("actions.remove")}</Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                <p>{t("actions.removeBody")}</p>
              </Dialog.Body>
              <Dialog.Footer>
                <Dialog.ActionTrigger asChild>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsDialogOpen(false);
                    }}
                    variant="outline"
                  >
                    {t("actions.cancelChanges")}
                  </Button>
                </Dialog.ActionTrigger>
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete();
                  }}
                  colorPalette="red"
                >
                  {t("actions.remove")}
                </Button>
              </Dialog.Footer>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </Dialog.CloseTrigger>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </Presence>
  );
}
