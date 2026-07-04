import { useT } from "@/i18n/client";
import {
  Circle,
  Flex,
  Float,
  HStack,
  IconButton,
  Menu,
  Portal,
  Show,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components/shared/MaterialSymbol";
import { Notification } from "@konfi/types";
import { useChannels } from "context/channels";
import { useNotifications } from "context/notifications";
import { isUndefined } from "es-toolkit";
import { Route } from "next";
import { useRouter } from "next/navigation";

export default function NotificationsMenu() {
  const { t } = useT();
  const {
    loadNotifications,
    notifications,
    notificationsCount,
    archiveNotification,
  } = useNotifications();
  const { channel, setChannel } = useChannels();
  const router = useRouter();

  function navigateToNotification(
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
    notification: Notification,
  ) {
    e.stopPropagation();
    if (notification.channelId !== channel?.id)
      setChannel({ value: notification.channelId });
    if (!isUndefined(notification.url)) {
      router.push(notification.url as Route);
    }
  }

  function handleArchiveNotification(
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
    notification: Notification,
  ) {
    e.stopPropagation();
    archiveNotification(notification.id);
  }

  return (
    <Menu.Root
      lazyMount
      onOpenChange={({ open }) => {
        if (open) {
          void loadNotifications();
        }
      }}
    >
      <Flex position={"relative"} alignSelf={"center"}>
        <Menu.Trigger
          asChild
          aria-label={t("common.new")}
          disabled={notificationsCount === 0}
          title={t("common.notifications")}
          justifyContent="center"
        >
          <IconButton variant={"ghost"}>
            <Show when={notificationsCount > 0}>
              <Float offset={1}>
                <Circle size={"5"} bg={"red.500"} color={"white"}>
                  {notificationsCount}
                </Circle>
              </Float>
            </Show>
            <MaterialSymbol>notifications</MaterialSymbol>
          </IconButton>
        </Menu.Trigger>
      </Flex>
      <Portal>
        <Menu.Positioner>
          <Menu.Content maxH={"500px"} overflowY={"auto"}>
            {notifications?.map((notification: Notification, index: number) => (
              <Menu.Item
                value={`notification-${index}`}
                as={"div"}
                onClick={(e) => navigateToNotification(e, notification)}
                borderBottom={"1px solid transparent"}
                borderColor={{
                  base: "blackAlpha.300",
                  _dark: "whiteAlpha.300",
                }}
                px={4}
                py={2}
                bg={"transparent"}
                _hover={{
                  bg: { base: "blackAlpha.100", _dark: "whiteAlpha.100" },
                  cursor: "pointer",
                }}
                key={index}
              >
                <HStack align={"flex-start"} w={"100%"}>
                  <MaterialSymbol mr={2}>info</MaterialSymbol>
                  <VStack align={"flex-start"}>
                    <Text fontWeight={600}>{notification.title}</Text>
                    <Text fontSize={"sm"} maxW={"300px"}>
                      {notification.options?.body}
                    </Text>
                  </VStack>
                  <IconButton
                    ml={"auto"}
                    onClick={(e) => handleArchiveNotification(e, notification)}
                    aria-label={t("common.archive")}
                  >
                    <MaterialSymbol>archive</MaterialSymbol>
                  </IconButton>
                </HStack>
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
