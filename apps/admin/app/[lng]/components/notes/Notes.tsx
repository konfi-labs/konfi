import { Show, VStack } from "@chakra-ui/react";
import { ButtonLink, MaterialSymbol } from "@konfi/components";
import { Note } from "@konfi/types";
import { ADMIN_NOTES } from "@konfi/utils";
import { useT } from "@/i18n/client";

interface Props {
  notes: Note[];
}

export function Notes({ notes }: Props) {
  const { i18n } = useT();

  return (
    <Show when={notes.length > 0}>
      <VStack mb={6} gap={2} alignItems={"stretch"}>
        {notes.map((note) => (
          <ButtonLink
            lng={i18n.resolvedLanguage}
            key={note.id}
            href={`${ADMIN_NOTES}?currentNote=${note.id}`}
            ariaLabel={note.name}
            colorPalette={"yellow"}
            variant="outline"
            width="full"
            mb={2}
            truncate
            justifyContent={"space-between"}
          >
            <MaterialSymbol>note</MaterialSymbol>
            {note.name}
            <MaterialSymbol>open_in_new</MaterialSymbol>
          </ButtonLink>
        ))}
      </VStack>
    </Show>
  );
}
