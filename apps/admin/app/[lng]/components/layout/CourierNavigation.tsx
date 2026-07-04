"use client";

import { useT } from "@/i18n/client";
import {
  Badge,
  Box,
  Button,
  CloseButton,
  Drawer,
  HStack,
  IconButton,
  Portal,
  ScrollArea,
  Separator,
  Skeleton,
  Text,
  useDisclosure,
  VStack,
} from "@chakra-ui/react";
import { LanguageSwitcher } from "@konfi/components/shared/LanguageSwitcher";
import { Logo } from "@konfi/components/shared/Logo";
import { MaterialSymbol } from "@konfi/components/shared/MaterialSymbol";
import { NotePriority } from "@konfi/types";
import { useAuth } from "context/auth";
import { useConfigurationMembers } from "context/configuration";
import { CourierNavigationProvider } from "context/courier-navigation";
import { useNotes } from "context/notes";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";
import { useSwipeable } from "react-swipeable";
import ChannelsSelect from "./ChannelsSelect";

const CourierNavigation = ({
  lng,
  children,
}: {
  lng: string;
  children?: React.ReactNode;
}) => {
  const { t, i18n } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const { logout, user } = useAuth();
  const { members, loadingMembers } = useConfigurationMembers();
  const { loadingNotes, notes, completeNote } = useNotes();
  const { open, onOpen, onClose } = useDisclosure();
  const userEmail = user?.email?.toLowerCase() ?? null;
  const memberNameForUser = useMemo(() => {
    if (!members || !userEmail) {
      return null;
    }
    const matchedMember = members.find(
      (member) => member.email?.toLowerCase() === userEmail,
    );
    return matchedMember?.name ?? null;
  }, [members, userEmail]);
  const scopedNotes = useMemo(() => {
    if (!notes || !memberNameForUser) {
      return [];
    }
    const assignedNotes = notes.filter((note) =>
      note.carriedOutBy?.includes(memberNameForUser),
    );
    return assignedNotes.sort((a, b) => {
      const aTime = new Date(a.dueDate).getTime();
      const bTime = new Date(b.dueDate).getTime();
      if (Number.isNaN(aTime) && Number.isNaN(bTime)) {
        return 0;
      }
      if (Number.isNaN(aTime)) {
        return 1;
      }
      if (Number.isNaN(bTime)) {
        return -1;
      }
      return aTime - bTime;
    });
  }, [notes, memberNameForUser]);
  const noteCount = scopedNotes.length;
  const drawerSubtitle = useMemo(() => {
    if (loadingMembers) {
      return t("notes.drawerSubtitleLoading");
    }
    if (memberNameForUser) {
      return t("notes.drawerScopedSubtitle");
    }
    return t("notes.drawerSubtitleMissingMember");
  }, [loadingMembers, memberNameForUser, t]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case NotePriority.URGENT:
        return "red";
      case NotePriority.HIGH:
        return "orange";
      case NotePriority.MEDIUM:
        return "yellow";
      case NotePriority.LOW:
      default:
        return "green";
    }
  };

  const getDueDateMeta = (value?: string) => {
    const fallback = {
      color: "fg.muted",
      label: t("notes.noDueDate"),
    };
    if (!value) {
      return fallback;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return fallback;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const normalized = new Date(parsed);
    normalized.setHours(0, 0, 0, 0);
    let color = "fg.muted";
    if (normalized.getTime() < today.getTime()) {
      color = "red.500";
    } else if (normalized.getTime() === today.getTime()) {
      color = "orange.500";
    }
    return {
      color,
      label: normalized.toLocaleDateString(i18n.resolvedLanguage),
    };
  };

  const missingMemberMessage = user?.email
    ? t("notes.memberMappingMissingForEmail", { email: user.email })
    : t("notes.memberMappingMissing");

  const renderNotesSection = () => {
    if (loadingNotes || loadingMembers) {
      return (
        <VStack gap={2}>
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} h="80px" borderRadius="xl" />
          ))}
        </VStack>
      );
    }

    if (!memberNameForUser) {
      return (
        <Text fontSize="sm" color="fg.muted">
          {missingMemberMessage}
        </Text>
      );
    }

    if (!noteCount) {
      return (
        <Text fontSize="sm" color="fg.muted">
          {t("notes.noAssignedNotes")}
        </Text>
      );
    }

    return (
      <ScrollArea.Root maxH={{ base: "50vh", md: "66vh" }}>
        <ScrollArea.Viewport>
          <ScrollArea.Content spaceY="2">
            {scopedNotes.map((note) => {
              const dueMeta = getDueDateMeta(note.dueDate);
              return (
                <Box
                  key={note.id}
                  borderWidth="1px"
                  borderRadius="xl"
                  p={3}
                  bg="bg.muted"
                  borderColor={{ base: "gray.200", _dark: "gray.700" }}
                >
                  <HStack justify="space-between" align="flex-start" gap={3}>
                    <Text fontWeight="medium" lineClamp={2}>
                      {note.name}
                    </Text>
                    <Badge colorPalette={getPriorityColor(note.priority)}>
                      {t(`NotePriority.${note.priority}`)}
                    </Badge>
                  </HStack>
                  <HStack justify="space-between" mt={1} align="center">
                    <HStack gap={1}>
                      <MaterialSymbol color={dueMeta.color}>
                        event
                      </MaterialSymbol>
                      <Text fontSize="xs" color={dueMeta.color}>
                        {dueMeta.label}
                      </Text>
                    </HStack>
                    <Badge variant="subtle">
                      {t(`NoteCategory.${note.category}`)}
                    </Badge>
                  </HStack>
                  <Text mt={2} fontSize="sm" color="fg" lineClamp={3}>
                    {note.content}
                  </Text>
                  <HStack justify="flex-end" mt={2}>
                    <Button
                      w="100%"
                      variant="outline"
                      colorPalette="success"
                      aria-label={t("notes.completeNote")}
                      onClick={() => completeNote(note.id)}
                    >
                      <MaterialSymbol>check</MaterialSymbol>
                    </Button>
                  </HStack>
                </Box>
              );
            })}
          </ScrollArea.Content>
        </ScrollArea.Viewport>
      </ScrollArea.Root>
    );
  };
  const navigationHandler = useSwipeable({
    onSwipedLeft: () => onOpen(),
    trackMouse: true,
  });

  const drawerHandler = useSwipeable({
    onSwipedRight: () => onClose(),
    trackMouse: true,
  });

  return (
    <CourierNavigationProvider openMenu={onOpen}>
      {children}
      <Box
        as={"footer"}
        position={"fixed"}
        bottom={"32"}
        w={"100%"}
        minH={"32"}
        zIndex={"200"}
        {...navigationHandler}
      >
        <Drawer.Root
          {...navigationHandler}
          open={open}
          onOpenChange={({ open }) => (open ? onOpen() : onClose())}
        >
          <Portal>
            <Drawer.Backdrop />
            <Drawer.Positioner>
              <Drawer.Content {...drawerHandler}>
                <Drawer.Header>
                  <Logo />
                </Drawer.Header>
                <Drawer.Body>
                  <VStack gap={4} align="stretch">
                    <ChannelsSelect notPortalled={true} />
                    <Separator />
                    <Box>
                      <HStack justify="space-between" align="center">
                        <HStack gap={2} align="center">
                          <MaterialSymbol>description</MaterialSymbol>
                          <Text fontWeight="semibold">{t("tools.notes")}</Text>
                        </HStack>
                        {noteCount > 0 && (
                          <Badge
                            borderRadius="full"
                            px={2}
                            colorPalette="yellow"
                          >
                            {noteCount}
                          </Badge>
                        )}
                      </HStack>
                      <Text mt={1} fontSize="sm" color="fg.muted">
                        {drawerSubtitle}
                      </Text>
                      <Box
                        mt={3}
                        borderRadius="2xl"
                        p={3}
                        borderWidth="1px"
                        borderColor={{ base: "gray.200", _dark: "gray.700" }}
                        bg={{ base: "white", _dark: "gray.900" }}
                      >
                        {renderNotesSection()}
                      </Box>
                    </Box>
                  </VStack>
                </Drawer.Body>
                <Drawer.Footer>
                  <HStack w={"full"} justify={"space-between"} py={2}>
                    <LanguageSwitcher
                      lng={lng}
                      t={t}
                      router={router}
                      pathname={pathname}
                    />
                    <IconButton
                      onClick={logout}
                      aria-label={t("account.logout")}
                    >
                      <MaterialSymbol>logout</MaterialSymbol>
                    </IconButton>
                  </HStack>
                </Drawer.Footer>
                <Drawer.CloseTrigger asChild>
                  <CloseButton size="sm" />
                </Drawer.CloseTrigger>
              </Drawer.Content>
            </Drawer.Positioner>
          </Portal>
        </Drawer.Root>
      </Box>
    </CourierNavigationProvider>
  );
};

export default CourierNavigation;
