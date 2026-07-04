import { Notification } from "@konfi/types";
import { ADMIN_NOTES } from "@konfi/utils";
import { Timestamp } from "firebase-admin/firestore";

export type NoteNotificationEvent = "created" | "updated";

function normalizeNoteName(noteName: string): string {
  const trimmedName = noteName.trim();

  return trimmedName.length > 0 ? trimmedName : "Bez tytułu";
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/u, "");

  if (/^https?:\/\//iu.test(trimmed)) {
    return `${trimmed}/`;
  }

  return `https://${trimmed.replace(/^\/+/u, "")}/`;
}

export function buildNoteUrl(noteId: string, channelId?: string): string {
  const params = new URLSearchParams({ currentNote: noteId });

  if (channelId) {
    params.set("channelId", channelId);
  }

  return `${ADMIN_NOTES}?${params.toString()}`;
}

export function buildAbsoluteAdminNoteUrl(
  noteId: string,
  channelId: string | undefined,
  adminBaseUrl: string,
): string {
  return new URL(
    buildNoteUrl(noteId, channelId),
    normalizeBaseUrl(adminBaseUrl),
  ).toString();
}

export function getNoteNotificationCopy(
  event: NoteNotificationEvent,
  noteName: string,
) {
  const safeNoteName = normalizeNoteName(noteName);

  if (event === "updated") {
    return {
      emailSubject: `Zaktualizowano notatkę: ${safeNoteName}`,
      notificationBody: `Zaktualizowano notatkę: ${safeNoteName}`,
      notificationTitle: "Zaktualizowano notatkę",
    };
  }

  return {
    emailSubject: `Nowa notatka: ${safeNoteName}`,
    notificationBody: `Dodano notatkę: ${safeNoteName}`,
    notificationTitle: "Nowa notatka",
  };
}

export function createNoteAppNotification(params: {
  noteId: string;
  noteName: string;
  channelId?: string;
  event: NoteNotificationEvent;
  createdAt?: Timestamp;
}): Notification {
  const {
    noteId,
    noteName,
    channelId,
    event,
    createdAt = Timestamp.now(),
  } = params;
  const copy = getNoteNotificationCopy(event, noteName);

  return {
    id: "",
    title: copy.notificationTitle,
    options: {
      body: copy.notificationBody,
    },
    archived: false,
    channelId: channelId ?? "",
    url: buildNoteUrl(noteId, channelId),
    createdAt,
  };
}
