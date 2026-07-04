"use client";

import ChannelsSelect from "@/components/layout/ChannelsSelect";
import NoteForm from "@/components/notes/NoteForm";
import { CarriedOutByCell } from "@/components/orders/CarriedOutBy";
import { useChannels } from "@/context/channels";
import { useConfigurationMembers } from "@/context/configuration";
import { useT } from "@/i18n/client";
import {
  Badge,
  Button,
  Card,
  Flex,
  Grid,
  GridItem,
  HStack,
  IconButton,
  Presence,
  Separator,
  Spacer,
} from "@chakra-ui/react";
import {
  ButtonLink,
  CustomHeading,
  Empty,
  MaterialSymbol,
  Preview,
  SpecialNotesPanel,
} from "@konfi/components";
import { Note, NoteEntityType, NotePriority } from "@konfi/types";
import { ADMIN_CUSTOMERS, ADMIN_ORDERS, ADMIN_PRODUCTS } from "@konfi/utils";
import { useNotes } from "context/notes";
import { isEmpty } from "es-toolkit/compat";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

export default function NotesPage({
  searchParamsCurrentNote,
  searchParamsChannelId,
  searchParamsMemberEmail,
}: {
  searchParamsCurrentNote?: string | string[];
  searchParamsChannelId?: string;
  searchParamsMemberEmail?: string;
}) {
  const { t, i18n } = useT();
  const { channel, setChannel } = useChannels();
  const { members } = useConfigurationMembers();
  const [currentNote, setCurrentNote] = useState<Note | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDuplicateForm, setShowDuplicateForm] = useState(false);
  const [hoveredNoteId, setHoveredNoteId] = useState<string>("");
  const [showActionBar, setShowActionBar] = useState(false);
  const { notes: allNotes, completeNote, updateCarriedOutBy } = useNotes();

  // Find member ID by email if memberEmail is provided
  const memberIdByEmail = useMemo(() => {
    if (!searchParamsMemberEmail || !members) return null;
    const member = members.find((m) => m.email === searchParamsMemberEmail);
    return member?.id || null;
  }, [searchParamsMemberEmail, members]);

  // Filter notes by member ID if email was provided and member found
  const notes = useMemo(() => {
    if (!memberIdByEmail || !allNotes) return allNotes;
    return allNotes.filter((note) =>
      note.carriedOutBy?.includes(memberIdByEmail),
    );
  }, [memberIdByEmail, allNotes]);

  useEffect(() => {
    if (!searchParamsChannelId || searchParamsChannelId === channel?.id) {
      return;
    }

    setChannel({ value: searchParamsChannelId });
  }, [channel?.id, searchParamsChannelId, setChannel]);

  const getPriorityColor = useCallback((priority: string) => {
    switch (priority) {
      case NotePriority.LOW:
        return "green";
      case NotePriority.MEDIUM:
        return "yellow";
      case NotePriority.HIGH:
        return "orange";
      case NotePriority.URGENT:
        return "red";
      default:
        return undefined;
    }
  }, []);

  const getRouteForEntity = useCallback(
    (entityType: NoteEntityType, entityId: string) => {
      switch (entityType) {
        case "CUSTOMER":
          return `${ADMIN_CUSTOMERS}/${entityId}`;
        case "ORDER":
          return `${ADMIN_ORDERS}/${entityId}`;
        case "PRODUCT":
          return `${ADMIN_PRODUCTS}/${entityId}`;
        default:
          return "";
      }
    },
    [],
  );

  const _updateCarriedOutBy = useCallback(
    (carriedOutBy: string[]) => {
      if (!currentNote) return;
      updateCarriedOutBy(currentNote.id, carriedOutBy);
    },
    [currentNote],
  );

  useEffect(() => {
    if (notes && notes.length > 0 && !currentNote) {
      if (searchParamsCurrentNote) {
        const note = notes.find((n) => n.id === searchParamsCurrentNote);
        if (note) {
          setCurrentNote(note);
        } else {
          setCurrentNote(notes[0]);
        }
      } else {
        setCurrentNote(notes[0]);
      }
    }
  }, [notes, searchParamsCurrentNote, currentNote]);

  return (
    <>
      <CustomHeading
        heading={t("tools.notes", { defaultValue: "Notes" })}
        mb={"8"}
        breadcrumb={true}
        channelsSwitch={<ChannelsSelect />}
        goBack={true}
        t={t}
      />
      <Flex flexDir={["column", "row"]} gap={2}>
        <Spacer />
        <Button
          colorPalette={"primary"}
          variant={"solid"}
          onClick={() => {
            setShowCreateForm(true);
            setShowEditForm(false);
          }}
        >
          <MaterialSymbol>create</MaterialSymbol>
          {t("admin.newNote")}
        </Button>
      </Flex>
      <Separator my={"6"} />
      {!isEmpty(notes) ? (
        <Grid templateColumns="repeat(4, 1fr)" gap="6">
          <GridItem colSpan={2} minW={0}>
            <Grid
              templateColumns="repeat(2, 1fr)"
              gap={"2"}
              rounded={"3xl"}
              bg={{ base: "gray.50", _dark: "black" }}
              p={4}
            >
              {notes?.map((note) => (
                <Card.Root
                  key={note.id}
                  rounded={"3xl"}
                  onClick={() => {
                    startTransition(() => {
                      setCurrentNote(note);
                      setShowCreateForm(false);
                      setShowEditForm(false);
                      setShowDuplicateForm(false);
                    });
                  }}
                  onMouseEnter={() =>
                    startTransition(() => {
                      setHoveredNoteId(note.id);
                      setShowActionBar(true);
                    })
                  }
                  onMouseLeave={() =>
                    startTransition(() => {
                      setHoveredNoteId("");
                      setShowActionBar(false);
                    })
                  }
                  _hover={{
                    cursor: "pointer",
                    shadow: "0 0 0 3px {colors.primaryAccent.500/30}",
                  }}
                >
                  <Presence
                    present={showActionBar && hoveredNoteId === note.id}
                    animationName={{ _open: "fade-in", _closed: "fade-out" }}
                    animationDuration="moderate"
                  >
                    <HStack
                      background={{ base: "white", _dark: "gray.900" }}
                      border={"1px solid"}
                      borderColor={{ base: "gray.200", _dark: "gray.700" }}
                      borderRadius={"3xl"}
                      py={1.5}
                      px={2}
                      pos={"absolute"}
                      top={-6}
                      right={2}
                      gap={1}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <IconButton colorPalette={"primary"} size={"xs"}>
                        <MaterialSymbol
                          onClick={(e) => {
                            e.stopPropagation();
                            setCurrentNote(note);
                            setShowCreateForm(false);
                            setShowEditForm(false);
                            setShowDuplicateForm(true);
                          }}
                        >
                          content_copy
                        </MaterialSymbol>
                      </IconButton>
                      <IconButton colorPalette={"primary"} size={"xs"}>
                        <MaterialSymbol
                          onClick={(e) => {
                            e.stopPropagation();
                            setCurrentNote(note);
                            setShowCreateForm(false);
                            setShowEditForm(true);
                            setShowDuplicateForm(false);
                          }}
                        >
                          edit
                        </MaterialSymbol>
                      </IconButton>
                      <IconButton colorPalette={"success"} size={"xs"}>
                        <MaterialSymbol
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isEmpty(notes)) {
                              setCurrentNote(notes[0]);
                            }
                            setShowCreateForm(false);
                            setShowEditForm(false);
                            setShowDuplicateForm(false);
                            completeNote(note.id);
                          }}
                        >
                          check
                        </MaterialSymbol>
                      </IconButton>
                    </HStack>
                  </Presence>
                  <Card.Header>
                    <Card.Title truncate>{note.name}</Card.Title>
                    <HStack gap={2}>
                      <Badge>{t(`NoteCategory.${note.category}`)}</Badge>
                      {note.entityId && (
                        <ButtonLink
                          lng={i18n.resolvedLanguage}
                          href={getRouteForEntity(
                            note.entityType!,
                            note.entityId,
                          )}
                          ariaLabel={
                            t("admin.goTo", { defaultValue: "Go to" }) +
                            " " +
                            t(`NoteEntityType.${note.entityType}`)
                          }
                          size={"xs"}
                          py={1}
                        >
                          {t("admin.goTo", { defaultValue: "Go to" }) +
                            " " +
                            t(`NoteEntityType.${note.entityType}`)}
                          <MaterialSymbol>open_in_new</MaterialSymbol>
                        </ButtonLink>
                      )}
                    </HStack>
                  </Card.Header>
                  <Card.Body>
                    <Card.Description color="fg" lineClamp={5}>
                      {note.content}
                    </Card.Description>
                  </Card.Body>
                  <Card.Footer justifyContent={"space-between"}>
                    <HStack gap={2}>
                      <Badge opacity={0.67}>
                        {note.createdAt
                          .toDate()
                          .toLocaleDateString(i18n.resolvedLanguage)}
                      </Badge>
                      <DueDateBadge note={note} />
                    </HStack>
                    <HStack gap={2}>
                      <Badge colorPalette={getPriorityColor(note.priority)}>
                        {t(`NotePriority.${note.priority}`)}
                      </Badge>
                    </HStack>
                  </Card.Footer>
                </Card.Root>
              ))}
            </Grid>
          </GridItem>
          <GridItem colSpan={2} w={"100%"}>
            {showCreateForm ? (
              <NoteForm
                type={"CREATE"}
                open={showCreateForm}
                setOpen={setShowCreateForm}
              />
            ) : showEditForm ? (
              <NoteForm
                note={currentNote!}
                type={"UPDATE"}
                open={showEditForm}
                setOpen={setShowEditForm}
              />
            ) : showDuplicateForm ? (
              <NoteForm
                note={currentNote!}
                type={"DUPLICATE"}
                open={showDuplicateForm}
                setOpen={setShowDuplicateForm}
              />
            ) : (
              currentNote && (
                <SpecialNotesPanel
                  heading={currentNote.name}
                  actions={
                    <CarriedOutByCell
                      value={currentNote.carriedOutBy}
                      updateCarriedOutBy={_updateCarriedOutBy}
                      createdBy={currentNote.createdBy.name}
                      updatedBy={currentNote.updatedBy.name}
                    />
                  }
                >
                  <Preview source={currentNote.content} />
                </SpecialNotesPanel>
              )
            )}
          </GridItem>
        </Grid>
      ) : showCreateForm ? (
        <NoteForm
          type={"CREATE"}
          open={showCreateForm}
          setOpen={setShowCreateForm}
        />
      ) : (
        <Empty
          title={t("admin.noNotes", { defaultValue: "No notes" })}
          description={t("admin.addNoteHelperText")}
          icon={"note_add"}
        />
      )}
    </>
  );
}

function DueDateBadge({ note }: { note: Note }) {
  const { i18n } = useT();
  const currentDate = new Date();
  const deadlineDate = new Date(note.dueDate);
  const isDeadlinePassed = deadlineDate < currentDate;
  const isDeadlineToday =
    deadlineDate.toDateString() === currentDate.toDateString();
  const colorPalette = isDeadlinePassed
    ? isDeadlineToday
      ? "orange"
      : "red"
    : undefined;
  return (
    <Badge colorPalette={note.completed ? undefined : colorPalette}>
      {new Date(note.dueDate).toLocaleDateString(i18n.resolvedLanguage)}
    </Badge>
  );
}
