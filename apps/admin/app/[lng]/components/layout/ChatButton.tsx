"use client";

import { Avatar, HStack } from "@chakra-ui/react";
import { isElectron } from "@konfi/utils/browser-platform";
import {
  ADMIN_DELIVERY,
  ADMIN_TOOLS_CHAT,
  AUTH_LOGIN,
} from "@konfi/utils/routes";
import { useAuth } from "context/auth";
import { useChatDrawer } from "context/chat-drawer";
import { usePathname } from "next/navigation";

export default function ChatButton() {
  const pathname = usePathname();
  const { isAdminClient } = useAuth();
  const { toggleDrawer, isOpen } = useChatDrawer();

  if (pathname.includes(AUTH_LOGIN)) return null;
  if (pathname.includes(ADMIN_TOOLS_CHAT)) return null;
  if (pathname.includes(ADMIN_DELIVERY)) return null;
  if (isOpen) return null;

  if (!isAdminClient) return null;

  return (
    <HStack
      position={"absolute"}
      top={isElectron() ? 10 : 8}
      right={8}
      zIndex={1000}
    >
      <Avatar.Root
        _hover={{ transform: "scale(1.1)" }}
        transition={"transform 0.2s"}
        cursor="pointer"
        onClick={toggleDrawer}
      >
        <Avatar.Image src="/assets/avatar_agent.avif" />
        <Avatar.Fallback name={"Konfi"} />
      </Avatar.Root>
    </HStack>
  );
}
