import "server-only";

import { sendEmail } from "@/lib/email";
import { createAppNotification } from "@/lib/notifications/app-notifications";
import { NoteNotificationEmail } from "@konfi/emails";
import { Channel, Note, NotificationType } from "@konfi/types";
import { getChannelNotificationEmails } from "@konfi/utils";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { createElement } from "react";
import {
  buildAbsoluteAdminNoteUrl,
  createNoteAppNotification,
  getNoteNotificationCopy,
  type NoteNotificationEvent,
} from "./notification-helpers";

function getAdminBaseUrl(): string {
  const adminBaseUrl =
    process.env.ADMIN_URL?.trim() || process.env.NEXT_PUBLIC_ADMIN_URL?.trim();

  if (!adminBaseUrl) {
    throw new Error("ADMIN_URL or NEXT_PUBLIC_ADMIN_URL is not defined");
  }

  return adminBaseUrl;
}

export async function publishNoteNotifications(params: {
  firestore: FirebaseFirestore.Firestore;
  noteId: string;
  note: Note;
  event: NoteNotificationEvent;
  tenantContext?: TenantContext;
}) {
  const { firestore, noteId, note, event, tenantContext } = params;
  const notification = createNoteAppNotification({
    noteId,
    noteName: note.name,
    channelId: note.channelId,
    event,
  });

  await createAppNotification({
    firestore,
    notification,
    tenantContext,
  });

  if (!note.channelId) {
    return;
  }

  const channelSnapshot = await firestore
    .collection("channels")
    .doc(note.channelId)
    .get();

  if (!channelSnapshot.exists) {
    return;
  }

  const channel = {
    ...(channelSnapshot.data() as Channel),
    id: channelSnapshot.id,
  } satisfies Channel;
  const isEmailNotificationEnabled =
    channel.notifications?.enabledTypes?.includes(
      NotificationType.NOTE_CREATED,
    ) ?? false;

  if (!isEmailNotificationEnabled) {
    return;
  }

  const recipients = getChannelNotificationEmails(
    channel,
    process.env.NOTIFICATIONS_EMAIL?.trim() || undefined,
  );

  if (recipients.length === 0) {
    return;
  }

  const absoluteNoteUrl = buildAbsoluteAdminNoteUrl(
    noteId,
    note.channelId,
    getAdminBaseUrl(),
  );
  const copy = getNoteNotificationCopy(event, note.name);

  await sendEmail({
    to: recipients,
    from: process.env.NO_REPLY_EMAIL?.trim(),
    subject: copy.emailSubject,
    template: createElement(NoteNotificationEmail, {
      brand: "admin",
      event,
      noteContent: note.content,
      noteName: note.name,
      url: absoluteNoteUrl,
    }),
  });
}
