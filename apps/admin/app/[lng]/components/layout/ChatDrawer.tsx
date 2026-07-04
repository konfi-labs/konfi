"use client";

import { useT } from "@/i18n/client";
import { AgentsProvider } from "@/context/agents";
import { AssistantHistoryProvider } from "@/context/assistant-history";
import {
  Box,
  Drawer,
  Heading,
  HStack,
  IconButton,
  Portal,
  Skeleton,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components/shared/MaterialSymbol";
import { Tooltip } from "@konfi/components/ui/tooltip";
import { useAssistantHistory } from "context/assistant-history";
import { useChatDrawer } from "context/chat-drawer";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Suspense, useEffect } from "react";
const ChatPage = dynamic(() => import("../../tools/chat/[id]/chat-page"), {
  ssr: false,
});

function ChatDrawerContent() {
  const { clearSession } = useAssistantHistory();
  const { closeDrawer } = useChatDrawer();
  const { t } = useT();

  const handleNewChat = () => {
    clearSession();
  };

  return (
    <>
      <Drawer.Header justifyContent="space-between">
        <Heading>
          {t("tools.aiAssistant", { defaultValue: "AI Assistant" })}
        </Heading>
        <HStack gap={1}>
          <Tooltip
            content={t("assistant.newChat", { defaultValue: "New Chat" })}
            positioning={{ placement: "bottom" }}
          >
            <span>
              <IconButton
                aria-label={t("assistant.newChat", {
                  defaultValue: "New Chat",
                })}
                variant="ghost"
                onClick={handleNewChat}
              >
                <MaterialSymbol>add</MaterialSymbol>
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip
            content={t("common.close", { defaultValue: "Close" })}
            positioning={{ placement: "left" }}
          >
            <span>
              <IconButton
                aria-label={t("common.close", { defaultValue: "Close" })}
                variant="ghost"
                onClick={closeDrawer}
              >
                <MaterialSymbol>right_panel_close</MaterialSymbol>
              </IconButton>
            </span>
          </Tooltip>
        </HStack>
      </Drawer.Header>
      <Drawer.Body>
        <Box pt={16} w="full" h="full" display="flex" flexDirection="column">
          <Suspense fallback={<Skeleton h="100%" borderRadius="2xl" />}>
            <ChatPage isPanel={true} />
          </Suspense>
        </Box>
      </Drawer.Body>
    </>
  );
}

export default function ChatPanel() {
  const { isOpen, closeDrawer, openDrawer } = useChatDrawer();
  const pathname = usePathname();
  const isExpanded = isOpen;

  // Close panel when navigating to the chat page
  useEffect(() => {
    if (pathname.includes("/tools/chat")) {
      closeDrawer();
    }
  }, [pathname, closeDrawer]);

  // Don't render on auth or delivery routes
  if (pathname.includes("/auth/") || pathname.includes("/delivery")) {
    return null;
  }

  return (
    <Drawer.Root
      size="md"
      open={isExpanded}
      onOpenChange={(details) => {
        if (details.open) {
          openDrawer();
        } else {
          closeDrawer();
        }
      }}
      closeOnInteractOutside={false}
      modal={false}
      lazyMount
      unmountOnExit
    >
      <Portal>
        <Drawer.Positioner pointerEvents="none">
          <Drawer.Content pb={4} overflow="hidden">
            <AgentsProvider>
              <AssistantHistoryProvider>
                <ChatDrawerContent />
              </AssistantHistoryProvider>
            </AgentsProvider>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}
