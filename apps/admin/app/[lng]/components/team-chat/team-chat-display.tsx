"use client";

import { useT } from "@/i18n/client";
import {
  Box,
  Circle,
  Float,
  HStack,
  IconButton,
  Portal,
  Separator,
  Skeleton,
  Tooltip,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components/shared/MaterialSymbol";
import { CurrentMemberProvider } from "@/context/current-member";
import { isElectron } from "@konfi/utils/browser-platform";
import {
  ADMIN_DELIVERY,
  ADMIN_TOOLS_CHAT,
  AUTH_LOGIN,
} from "@konfi/utils/routes";
import { useAuth } from "context/auth";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

const TeamChat = dynamic(
  () => import("./team-chat").then((mod) => mod.TeamChat),
  {
    loading: () => <Skeleton h="420px" borderRadius="2xl" />,
    ssr: false,
  },
);

function clamp(value: number, min: number, max: number) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export function TeamChatDisplay() {
  const { t } = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef({
    isDragging: false,
    offsetX: 0,
    offsetY: 0,
    width: 0,
    height: 0,
  });
  const positionRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const { isAdminClient } = useAuth();
  const pathname = usePathname();

  const applyTransform = useCallback((x: number, y: number) => {
    const node = containerRef.current;
    if (!node) {
      return;
    }

    const setTransform = () => {
      node.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };

    if (typeof window === "undefined") {
      setTransform();
      return;
    }

    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      setTransform();
    });
  }, []);

  const updatePosition = useCallback(
    (x: number, y: number) => {
      positionRef.current = { x, y };
      applyTransform(x, y);
    },
    [applyTransform],
  );

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !isDragging) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!dragStateRef.current.isDragging) {
        return;
      }

      const margin = 16;
      const viewportWidth = event.view?.innerWidth ?? window.innerWidth;
      const viewportHeight = event.view?.innerHeight ?? window.innerHeight;
      const maxX = Math.max(
        viewportWidth - dragStateRef.current.width - margin,
        margin,
      );
      const maxY = Math.max(
        viewportHeight - dragStateRef.current.height - margin,
        margin,
      );
      const nextX = clamp(
        event.clientX - dragStateRef.current.offsetX,
        margin,
        maxX,
      );
      const nextY = clamp(
        event.clientY - dragStateRef.current.offsetY,
        margin,
        maxY,
      );

      updatePosition(nextX, nextY);
    };

    const handlePointerUp = () => {
      if (!dragStateRef.current.isDragging) {
        return;
      }

      dragStateRef.current.isDragging = false;
      setIsDragging(false);

      const { x, y } = positionRef.current;
      updatePosition(x, y);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isDragging, updatePosition]);

  useEffect(() => {
    if (typeof window === "undefined" || !isOpen) {
      return;
    }

    const handleResize = () => {
      if (!containerRef.current) {
        return;
      }

      const margin = 16;
      const width = containerRef.current.offsetWidth;
      const height = containerRef.current.offsetHeight;
      const maxX = Math.max(window.innerWidth - width - margin, margin);
      const maxY = Math.max(window.innerHeight - height - margin, margin);

      const current = positionRef.current;
      const nextX = clamp(current.x, margin, maxX);
      const nextY = clamp(current.y, margin, maxY);

      updatePosition(nextX, nextY);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") {
      return;
    }

    const margin = 24;
    const width = containerRef.current?.offsetWidth ?? 640;
    const height = containerRef.current?.offsetHeight ?? 480;
    const nextX = Math.max(window.innerWidth - width - margin, margin);
    const nextY = Math.max(window.innerHeight - height - margin, margin);

    updatePosition(nextX, nextY);
  }, [isOpen, updatePosition]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !containerRef.current) {
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    dragStateRef.current = {
      isDragging: true,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    };

    setIsDragging(true);
    event.preventDefault();
  };

  const handleToggle = () => {
    if (isOpen) {
      dragStateRef.current.isDragging = false;
      setIsDragging(false);
    } else {
      // Reset unread count when opening
      setUnreadCount(0);
    }
    setIsOpen((prev) => !prev);
  };

  const handleClose = () => {
    dragStateRef.current.isDragging = false;
    setIsDragging(false);
    setIsOpen(false);
  };

  // Reset unread count when chat is open
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
    }
  }, [isOpen]);

  const shouldHide =
    pathname.includes(AUTH_LOGIN) ||
    pathname.includes(ADMIN_DELIVERY) ||
    !isAdminClient;
  if (shouldHide) {
    return null;
  }

  // Position button at top when either on chat page or assistant chat is open
  const shouldPositionAtTop = pathname.includes(ADMIN_TOOLS_CHAT);

  return (
    <>
      {/* Floating Team Chat Button */}
      <HStack
        position="fixed"
        bottom={shouldPositionAtTop ? undefined : 8}
        top={shouldPositionAtTop ? (isElectron() ? 16 : 8) : undefined}
        right={8}
        zIndex="overlay"
      >
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Box position="relative" display="inline-block">
              <IconButton
                aria-label={t("teamChat.openChat", {
                  defaultValue: "Open Team Chat",
                })}
                colorPalette="primary"
                size="lg"
                rounded="full"
                onClick={handleToggle}
                _hover={{ transform: "scale(1.1)" }}
                transition="transform 0.2s"
                boxShadow="lg"
              >
                <MaterialSymbol>chat</MaterialSymbol>
              </IconButton>
              {unreadCount > 0 && (
                <Float placement="top-end" offsetX="1" offsetY="1">
                  <Circle
                    size="5"
                    bg={{ base: "red.500", _dark: "red.400" }}
                    color={{ base: "white", _dark: "gray.900" }}
                    fontWeight="bold"
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </Circle>
                </Float>
              )}
            </Box>
          </Tooltip.Trigger>
          <Tooltip.Positioner>
            <Tooltip.Content>
              {t("teamChat.openChat", { defaultValue: "Open Team Chat" })}
            </Tooltip.Content>
          </Tooltip.Positioner>
        </Tooltip.Root>
      </HStack>

      {isOpen && (
        <Portal>
          <Box
            ref={containerRef}
            position="fixed"
            left="0"
            top="0"
            zIndex="modal"
            w={{ base: "calc(100vw - 32px)", md: "640px" }}
            maxW={{ base: "calc(100vw - 32px)", md: "640px" }}
            maxH={{ base: "80vh", md: "70vh" }}
            bg={{ base: "gray.50", _dark: "black" }}
            borderRadius={{ base: "2xl", md: "3xl" }}
            boxShadow="2xl"
            overflow="hidden"
            pointerEvents="auto"
            display="flex"
            flexDirection="column"
            userSelect={isDragging ? "none" : "auto"}
            style={{
              transform: `translate3d(${positionRef.current.x}px, ${positionRef.current.y}px, 0)`,
              willChange: isDragging ? "transform" : undefined,
            }}
          >
            <HStack
              align="center"
              justify="space-between"
              px={{ base: 3, md: 4 }}
              py={{ base: 2, md: 3 }}
              cursor={isDragging ? "grabbing" : "grab"}
              onPointerDown={handlePointerDown}
            >
              <Box px={2} fontWeight="semibold">
                {t("teamChat.title", { defaultValue: "Team Chat" })}
              </Box>
              <IconButton
                aria-label={t("teamChat.close", { defaultValue: "Close chat" })}
                size="sm"
                variant="ghost"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={handleClose}
              >
                <MaterialSymbol>close</MaterialSymbol>
              </IconButton>
            </HStack>
            <Separator />
            <Box
              flex="1"
              overflow="auto"
              px={{ base: 2, md: 4 }}
              pb={{ base: 2, md: 4 }}
            >
              <CurrentMemberProvider>
                <TeamChat onUnreadCountChange={setUnreadCount} />
              </CurrentMemberProvider>
            </Box>
          </Box>
        </Portal>
      )}
    </>
  );
}
