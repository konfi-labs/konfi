import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import {
  buildAbsoluteAdminNoteUrl,
  buildNoteUrl,
  createNoteAppNotification,
  getNoteNotificationCopy,
} from "./notification-helpers";

describe("note notification helpers", () => {
  it("builds the notes page link with the current note and channel", () => {
    expect(buildNoteUrl("note-123", "channel-456")).toBe(
      "/notes?currentNote=note-123&channelId=channel-456",
    );
  });

  it("keeps the admin channel context on app notifications", () => {
    const createdAt = Timestamp.now();
    const notification = createNoteAppNotification({
      noteId: "note-123",
      noteName: "Status produkcji",
      channelId: "channel-456",
      event: "updated",
      createdAt,
    });

    expect(notification).toMatchObject({
      archived: false,
      channelId: "channel-456",
      options: {
        body: "Zaktualizowano notatkę: Status produkcji",
      },
      title: "Zaktualizowano notatkę",
      url: "/notes?currentNote=note-123&channelId=channel-456",
    });
    expect(notification.createdAt).toBe(createdAt);
  });

  it("creates absolute admin note links", () => {
    expect(
      buildAbsoluteAdminNoteUrl("note-123", "channel-456", "admin.example.com"),
    ).toBe(
      "https://admin.example.com/notes?currentNote=note-123&channelId=channel-456",
    );
  });

  it("normalizes empty note names in notification copy", () => {
    expect(getNoteNotificationCopy("created", "   ")).toEqual({
      emailSubject: "Nowa notatka: Bez tytułu",
      notificationBody: "Dodano notatkę: Bez tytułu",
      notificationTitle: "Nowa notatka",
    });
  });
});
