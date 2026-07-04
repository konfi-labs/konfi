import { requireAdminAuth } from "@/actions/auth-utils";
import { getResendRuntimeClient } from "@/lib/resend/client";
import { connection, NextRequest, NextResponse } from "next/server";

interface ResendSentEmail {
  id: string;
  from: string;
}

const maxResendListPages = 10;
const resendListPageSize = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getEmailAddress(value: string): string {
  const match = value.match(/<([^<>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

function getEmailDomain(value: string | undefined): string | undefined {
  if (!value) {
    return;
  }

  const email = getEmailAddress(value);
  const atIndex = email.lastIndexOf("@");

  return atIndex >= 0 ? email.slice(atIndex + 1) : undefined;
}

function isResendSentEmail(value: unknown): value is ResendSentEmail {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.from === "string"
  );
}

function matchesSenderDomain(email: unknown, senderDomain: string | undefined) {
  if (!senderDomain) {
    return true;
  }

  if (!isResendSentEmail(email)) {
    return false;
  }

  return getEmailDomain(email.from) === senderDomain;
}

export async function GET(request: NextRequest) {
  await connection();
  try {
    await requireAdminAuth();

    const { config, resend } = await getResendRuntimeClient();
    const senderDomain = getEmailDomain(config.fromEmail);
    const { searchParams } = request.nextUrl;

    const id = searchParams.get("id");

    // Single email detail
    if (id) {
      const { data, error } = await resend.emails.get(id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (!matchesSenderDomain(data, senderDomain)) {
        return NextResponse.json({ error: "Email not found" }, { status: 404 });
      }
      return NextResponse.json({ email: data });
    }

    // List emails with pagination
    const limit = Math.min(
      Math.max(Number(searchParams.get("limit")) || 20, 1),
      100,
    );
    const after = searchParams.get("after") ?? undefined;
    const before = searchParams.get("before") ?? undefined;

    const emails: ResendSentEmail[] = [];
    let hasMore = false;
    let cursor = after;

    for (
      let page = 0;
      emails.length <= limit && page < maxResendListPages;
      page += 1
    ) {
      const listOptions: Record<string, unknown> = {
        limit: resendListPageSize,
      };
      if (cursor) listOptions.after = cursor;
      else if (before && page === 0) listOptions.before = before;

      const response = await resend.emails.list(listOptions);
      const pageEmails = (response.data?.data ?? []).filter(isResendSentEmail);

      emails.push(
        ...pageEmails.filter((email) =>
          matchesSenderDomain(email, senderDomain),
        ),
      );

      hasMore = response.data?.has_more ?? false;
      if (!hasMore) {
        break;
      }

      const lastEmail = pageEmails[pageEmails.length - 1];
      if (!lastEmail) {
        break;
      }
      cursor = lastEmail.id;
    }

    return NextResponse.json({
      emails: emails.slice(0, limit),
      has_more: emails.length > limit || hasMore,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json(
        { error: "Unauthorized: Admin access required" },
        { status: 401 },
      );
    }
    console.error("Resend API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch emails" },
      { status: 500 },
    );
  }
}
