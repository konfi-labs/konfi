"use server";

import { requireAdminAuth } from "./auth-utils";
import {
  getAdminDb,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import { publishNoteNotifications } from "@/lib/notes/notification-service";
import { Note } from "@konfi/types";
import { NoteCreateSchema, NoteUpdateSchema } from "@konfi/utils";
import { Timestamp } from "firebase-admin/firestore";
import type { InferType } from "yup";

type CreateNoteInput = InferType<typeof NoteCreateSchema>;
type UpdateNoteInput = InferType<typeof NoteUpdateSchema>;

function getNoteName(name: string | undefined, content: string): string {
  const trimmedName = name?.trim();

  if (trimmedName) {
    return trimmedName;
  }

  const trimmedContent = content.trim();

  if (trimmedContent.length <= 80) {
    return trimmedContent || "Bez tytułu";
  }

  return `${trimmedContent.slice(0, 77).trimEnd()}...`;
}

function buildCreateNote(
  input: CreateNoteInput,
  timestampNow: Timestamp,
): Omit<Note, "id"> {
  return {
    name: getNoteName(input.name, input.content),
    content: input.content,
    category: input.category,
    priority: input.priority,
    dueDate: input.dueDate,
    completed: input.completed,
    createdBy: input.createdBy,
    createdAt: timestampNow,
    updatedBy: input.createdBy,
    updatedAt: timestampNow,
    carriedOutBy: input.carriedOutBy,
    ...(input.toChannel?.id ? { channelId: input.toChannel.id } : {}),
    ...(input.entityType
      ? {
          entityId: input.entityId,
          entityType: input.entityType,
        }
      : {}),
  };
}

function buildUpdatedNote(
  noteId: string,
  existingNote: Note,
  input: UpdateNoteInput,
  timestampNow: Timestamp,
): Note {
  return {
    id: noteId,
    createdBy: existingNote.createdBy,
    createdAt: existingNote.createdAt,
    name: getNoteName(input.name, input.content),
    content: input.content,
    category: input.category,
    priority: input.priority,
    dueDate: input.dueDate,
    completed: input.completed,
    updatedBy: input.updatedBy,
    updatedAt: timestampNow,
    carriedOutBy: input.carriedOutBy,
    ...(input.toChannel?.id ? { channelId: input.toChannel.id } : {}),
    ...(input.entityType
      ? {
          entityId: input.entityId,
          entityType: input.entityType,
        }
      : {}),
  };
}

export async function createNote(input: CreateNoteInput) {
  await requireAdminAuth();

  const tenantContext = await getTenantContextForRequest();
  const validatedInput = await NoteCreateSchema.validate(input, {
    abortEarly: false,
    stripUnknown: true,
  });
  const firestore = getAdminDb();
  const noteRef = firestore.collection("notes").doc();
  const timestampNow = Timestamp.now();
  const note = {
    ...buildCreateNote(validatedInput, timestampNow),
    id: noteRef.id,
  } satisfies Note;

  await noteRef.set(note);
  await publishNoteNotifications({
    firestore,
    noteId: noteRef.id,
    note,
    event: "created",
    tenantContext,
  });

  return { id: noteRef.id };
}

export async function updateNote(noteId: string, input: UpdateNoteInput) {
  await requireAdminAuth();

  const tenantContext = await getTenantContextForRequest();
  const validatedInput = await NoteUpdateSchema.validate(input, {
    abortEarly: false,
    stripUnknown: true,
  });
  const firestore = getAdminDb();
  const noteRef = firestore.collection("notes").doc(noteId);
  const existingNoteSnapshot = await noteRef.get();

  if (!existingNoteSnapshot.exists) {
    throw new Error(`Note ${noteId} not found`);
  }

  const existingNote = existingNoteSnapshot.data() as Note;
  const nextNote = buildUpdatedNote(
    noteId,
    existingNote,
    validatedInput,
    Timestamp.now(),
  );

  await noteRef.set(nextNote);
  await publishNoteNotifications({
    firestore,
    noteId,
    note: nextNote,
    event: "updated",
    tenantContext,
  });
}
