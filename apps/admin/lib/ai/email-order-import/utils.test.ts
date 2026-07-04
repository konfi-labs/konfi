import { describe, expect, it } from "vitest";
import type { Email } from "@konfi/microsoft";
import {
  buildDraftSpecialNotes,
  normalizeConversationEmails,
  stripHtmlToText,
} from "./utils";

describe("email-order-import utils", () => {
  it("strips html into readable text", () => {
    expect(
      stripHtmlToText("<p>Hello<br>world</p><div>More&nbsp;text</div>"),
    ).toBe("Hello\nworld\nMore text");
  });

  it("normalizes conversation emails into plain text payloads", () => {
    const emails: Email[] = [
      {
        id: "message-1",
        createdDateTime: "2026-03-27T08:00:00.000Z",
        lastModifiedDateTime: "2026-03-27T08:00:00.000Z",
        receivedDateTime: "2026-03-27T08:00:00.000Z",
        sentDateTime: "2026-03-27T08:00:00.000Z",
        hasAttachments: false,
        internetMessageId: "internet-id-1",
        subject: "Business cards",
        bodyPreview: "Need 500 cards",
        importance: "normal",
        parentFolderId: "folder-1",
        conversationId: "conversation-1",
        conversationIndex: "index-1",
        isDeliveryReceiptRequested: false,
        isReadReceiptRequested: false,
        isRead: false,
        isDraft: false,
        webLink: "https://outlook.example/message-1",
        body: {
          contentType: "html",
          content: "<p>Need <strong>500</strong> cards</p>",
        },
        sender: {
          emailAddress: {
            name: "Example Customer",
            address: "customer@example.com",
          },
        },
        from: {
          emailAddress: {
            name: "Example Customer",
            address: "customer@example.com",
          },
        },
        toRecipients: [
          {
            emailAddress: {
              name: "Sales",
              address: "sales@example.com",
            },
          },
        ],
        ccRecipients: [],
        bccRecipients: [],
        replyTo: [],
        flag: { flagStatus: "notFlagged" },
      },
    ];

    expect(normalizeConversationEmails(emails)).toEqual([
      {
        id: "message-1",
        subject: "Business cards",
        senderName: "Example Customer",
        senderEmail: "customer@example.com",
        recipientEmails: ["sales@example.com"],
        bodyText: "Need 500 cards",
        bodyPreview: "Need 500 cards",
        sentAt: "2026-03-27T08:00:00.000Z",
        receivedAt: "2026-03-27T08:00:00.000Z",
        hasAttachments: false,
      },
    ]);
  });

  it("builds draft notes with missing details", () => {
    expect(
      buildDraftSpecialNotes({
        conversationId: "conversation-1",
        subject: "Business cards",
        rationale: "A workable draft could be prepared.",
        missingButNonBlocking: ["deadline", "paper finish"],
      }),
    ).toBe(
      [
        "Imported from email conversation conversation-1.",
        "Email subject: Business cards",
        "AI summary: A workable draft could be prepared.",
        "Details to verify manually: deadline, paper finish",
      ].join("\n"),
    );
  });
});
