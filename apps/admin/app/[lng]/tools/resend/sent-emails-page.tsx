"use client";

import { useT } from "@/i18n/client";
import {
  Badge,
  Box,
  Flex,
  HStack,
  Skeleton,
  Spacer,
  Table,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  CursorPagination,
  CustomHeading,
  Empty,
  RefreshButton,
} from "@konfi/components";
import { ADMIN_TOOLS_RESEND_EMAIL } from "@konfi/utils";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface ResendEmail {
  id: string;
  from: string;
  to: string[];
  subject: string;
  created_at: string;
  last_event:
    | "bounced"
    | "canceled"
    | "clicked"
    | "complained"
    | "delivered"
    | "delivery_delayed"
    | "failed"
    | "opened"
    | "queued"
    | "scheduled"
    | "sent";
  bcc: string[] | null;
  cc: string[] | null;
  reply_to: string[] | null;
  scheduled_at: string | null;
}

const EVENT_COLOR_MAP: Record<string, string> = {
  delivered: "success",
  sent: "blue",
  opened: "teal",
  clicked: "cyan",
  bounced: "red",
  complained: "orange",
  failed: "red",
  canceled: "gray",
  queued: "yellow",
  scheduled: "purple",
  delivery_delayed: "orange",
};

const EVENT_LABEL_MAP: Record<ResendEmail["last_event"], string> = {
  bounced: "Bounced",
  canceled: "Canceled",
  clicked: "Clicked",
  complained: "Complained",
  delivered: "Delivered",
  delivery_delayed: "Delivery delayed",
  failed: "Failed",
  opened: "Opened",
  queued: "Queued",
  scheduled: "Scheduled",
  sent: "Sent",
};

const PAGE_SIZE = 20;

const SentEmailsPage = () => {
  const { t, i18n } = useT();
  const router = useRouter();
  const [emails, setEmails] = useState<ResendEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const fetchEmails = useCallback(async (after?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", PAGE_SIZE.toString());
      if (after) params.set("after", after);
      const response = await fetch(`/api/resend/emails?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch emails");
      }
      const data: { emails: ResendEmail[]; has_more: boolean } =
        await response.json();
      setEmails(data.emails);
      setHasMore(data.has_more);
    } catch (error) {
      console.error("Failed to fetch sent emails:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  const handleNextPage = () => {
    const lastEmail = emails[emails.length - 1];
    if (!lastEmail) return;
    setCursorStack((prev) => [...prev, lastEmail.id]);
    fetchEmails(lastEmail.id);
  };

  const handlePreviousPage = () => {
    setCursorStack((prev) => {
      const next = prev.slice(0, -1);
      const cursor = next[next.length - 1];
      fetchEmails(cursor);
      return next;
    });
  };

  const handleRefresh = () => {
    setCursorStack([]);
    fetchEmails();
  };

  const handleFirstPage = () => {
    setCursorStack([]);
    fetchEmails();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString(i18n.resolvedLanguage, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatEventLabel = (event: ResendEmail["last_event"]) => {
    return t(`resend.statuses.${event}`, {
      defaultValue: EVENT_LABEL_MAP[event] ?? event.replace(/_/g, " "),
    });
  };

  return (
    <Box>
      <CustomHeading
        heading={t("resend.title", { defaultValue: "Sent Emails" })}
        mb="8"
        breadcrumb
        goBack
        t={t}
      />
      <Flex mb={4} gap={4} align="center">
        <Text color="fg.muted" fontSize="sm">
          {t("resend.description", {
            defaultValue: "Transactional emails sent via Resend.",
          })}
        </Text>
        <Spacer />
        <RefreshButton
          label={t("common.refresh", { defaultValue: "Refresh" })}
          refreshFunction={handleRefresh}
        />
      </Flex>

      {loading ? (
        <VStack gap={3} align="stretch">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height="48px" rounded="lg" />
          ))}
        </VStack>
      ) : emails.length === 0 ? (
        <Empty
          title={t("resend.empty", { defaultValue: "No emails sent yet" })}
          description={t("resend.emptyDescription", {
            defaultValue:
              "Transactional emails will appear here once they are sent.",
          })}
          icon="forward_to_inbox"
        />
      ) : (
        <>
          <Table.Root
            variant="outline"
            rounded="xl"
            size="sm"
            overflow="hidden"
          >
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>
                  {t("resend.to", { defaultValue: "To" })}
                </Table.ColumnHeader>
                <Table.ColumnHeader>
                  {t("resend.subject", { defaultValue: "Subject" })}
                </Table.ColumnHeader>
                <Table.ColumnHeader>
                  {t("resend.status", { defaultValue: "Status" })}
                </Table.ColumnHeader>
                <Table.ColumnHeader>
                  {t("resend.date", { defaultValue: "Date" })}
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {emails.map((email) => (
                <Table.Row
                  key={email.id}
                  cursor="pointer"
                  _hover={{ bg: "bg.muted" }}
                  onClick={() =>
                    router.push(ADMIN_TOOLS_RESEND_EMAIL(email.id))
                  }
                >
                  <Table.Cell maxW="200px">
                    <Text truncate fontSize="sm">
                      {email.to.join(", ")}
                    </Text>
                  </Table.Cell>
                  <Table.Cell maxW="300px">
                    <Text truncate fontSize="sm">
                      {email.subject}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge
                      size="sm"
                      colorPalette={EVENT_COLOR_MAP[email.last_event] ?? "gray"}
                      textTransform="capitalize"
                    >
                      {formatEventLabel(email.last_event)}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Text fontSize="xs" color="fg.muted" whiteSpace="nowrap">
                      {formatDate(email.created_at)}
                    </Text>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>

          <HStack mt="6" justifyContent="space-between">
            <CursorPagination
              t={t}
              page={cursorStack.length}
              hasMore={hasMore}
              itemsCount={emails.length}
              pageSize={PAGE_SIZE}
              loading={loading}
              onFirst={handleFirstPage}
              onPrevious={handlePreviousPage}
              onNext={handleNextPage}
            />
          </HStack>
        </>
      )}
    </Box>
  );
};

export default SentEmailsPage;
