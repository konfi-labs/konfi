"use client";

import { useT } from "@/i18n/client";
import {
  Badge,
  Box,
  Flex,
  HStack,
  Separator,
  Skeleton,
  Text,
  VStack,
} from "@chakra-ui/react";
import { CustomHeading, MaterialSymbol } from "@konfi/components";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

interface ResendEmailDetail {
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
  html: string | null;
  text: string | null;
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

const EVENT_LABEL_MAP: Record<ResendEmailDetail["last_event"], string> = {
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

function EmailHtmlPreview({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(400);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      try {
        const doc = iframe.contentDocument;
        if (doc) {
          const body = doc.body;
          if (body) {
            setHeight(body.scrollHeight + 16);
          }
        }
      } catch {
        // cross-origin fallback — keep default height
      }
    };

    iframe.addEventListener("load", handleLoad);
    return () => iframe.removeEventListener("load", handleLoad);
  }, [html]);

  const srcdoc = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; word-break: break-word; overflow-wrap: break-word; }
  img { max-width: 100%; height: auto; }
  a { color: #3182ce; word-break: break-all; }
  table { max-width: 100%; table-layout: fixed; }
  * { max-width: 100%; box-sizing: border-box; }
</style></head><body>${html}</body></html>`;

  return (
    <Box overflow="hidden" rounded="md">
      <iframe
        ref={iframeRef}
        srcDoc={srcdoc}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        title="Email preview"
        style={{
          width: "100%",
          height: `${height}px`,
          border: "none",
          display: "block",
        }}
      />
    </Box>
  );
}

export default function SentEmailDetailPage() {
  const { t, i18n } = useT();
  const params = useParams<{ emailId: string }>();
  const [email, setEmail] = useState<ResendEmailDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchEmail = useCallback(async () => {
    if (!params?.emailId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/resend/emails?id=${params.emailId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch email detail");
      }
      const data: { email: ResendEmailDetail } = await response.json();
      setEmail(data.email);
    } catch (error) {
      console.error("Failed to fetch email detail:", error);
    } finally {
      setLoading(false);
    }
  }, [params?.emailId]);

  useEffect(() => {
    fetchEmail();
  }, [fetchEmail]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString(i18n.resolvedLanguage, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatEventLabel = (event: ResendEmailDetail["last_event"]) => {
    return t(`resend.statuses.${event}`, {
      defaultValue: EVENT_LABEL_MAP[event] ?? event.replace(/_/g, " "),
    });
  };

  if (loading) {
    return (
      <Box>
        <CustomHeading
          heading={t("resend.detail.title", {
            defaultValue: "Email Details",
          })}
          mb="8"
          breadcrumb
          goBack
          t={t}
        />
        <VStack gap={4} align="stretch">
          <Skeleton height="32px" width="60%" rounded="lg" />
          <Skeleton height="20px" width="40%" rounded="lg" />
          <Skeleton height="20px" width="50%" rounded="lg" />
          <Separator />
          <Skeleton height="300px" rounded="lg" />
        </VStack>
      </Box>
    );
  }

  if (!email) {
    return (
      <Box>
        <CustomHeading
          heading={t("resend.detail.title", {
            defaultValue: "Email Details",
          })}
          mb="8"
          breadcrumb
          goBack
          t={t}
        />
        <Flex align="center" justify="center" py={16}>
          <VStack gap={2} color="fg.muted">
            <MaterialSymbol>mail</MaterialSymbol>
            <Text fontSize="md">
              {t("resend.detail.notFound", {
                defaultValue: "Email not found",
              })}
            </Text>
          </VStack>
        </Flex>
      </Box>
    );
  }

  return (
    <Box>
      <CustomHeading
        heading={t("resend.detail.title", {
          defaultValue: "Email Details",
        })}
        mb="8"
        breadcrumb
        goBack
        t={t}
      />

      <VStack align="stretch" gap={6}>
        {/* Header info */}
        <Box borderWidth="1px" rounded="xl" overflow="hidden">
          <VStack align="stretch" gap={0}>
            <Box p={5}>
              <Text fontSize="lg" fontWeight="semibold" mb={3}>
                {email.subject}
              </Text>

              <VStack align="stretch" gap={2}>
                <HStack gap={2}>
                  <Text
                    fontSize="sm"
                    color="fg.muted"
                    fontWeight="medium"
                    minW="50px"
                  >
                    {t("resend.from", { defaultValue: "From" })}:
                  </Text>
                  <Text fontSize="sm">{email.from}</Text>
                </HStack>

                <HStack gap={2}>
                  <Text
                    fontSize="sm"
                    color="fg.muted"
                    fontWeight="medium"
                    minW="50px"
                  >
                    {t("resend.to", { defaultValue: "To" })}:
                  </Text>
                  <Text fontSize="sm">{email.to.join(", ")}</Text>
                </HStack>

                {email.cc && email.cc.length > 0 && (
                  <HStack gap={2}>
                    <Text
                      fontSize="sm"
                      color="fg.muted"
                      fontWeight="medium"
                      minW="50px"
                    >
                      {t("resend.cc", { defaultValue: "CC" })}:
                    </Text>
                    <Text fontSize="sm">{email.cc.join(", ")}</Text>
                  </HStack>
                )}

                {email.bcc && email.bcc.length > 0 && (
                  <HStack gap={2}>
                    <Text
                      fontSize="sm"
                      color="fg.muted"
                      fontWeight="medium"
                      minW="50px"
                    >
                      {t("resend.bcc", { defaultValue: "BCC" })}:
                    </Text>
                    <Text fontSize="sm">{email.bcc.join(", ")}</Text>
                  </HStack>
                )}

                {email.reply_to && email.reply_to.length > 0 && (
                  <HStack gap={2}>
                    <Text
                      fontSize="sm"
                      color="fg.muted"
                      fontWeight="medium"
                      minW="50px"
                    >
                      {t("resend.replyTo", {
                        defaultValue: "Reply-To",
                      })}
                      :
                    </Text>
                    <Text fontSize="sm">{email.reply_to.join(", ")}</Text>
                  </HStack>
                )}
              </VStack>

              <HStack gap={3} mt={4}>
                <Badge
                  size="sm"
                  colorPalette={EVENT_COLOR_MAP[email.last_event] ?? "gray"}
                  textTransform="capitalize"
                >
                  {formatEventLabel(email.last_event)}
                </Badge>
                <Text fontSize="sm" color="fg.muted">
                  {formatDate(email.created_at)}
                </Text>
              </HStack>
            </Box>
          </VStack>
        </Box>

        {/* Email body */}
        <Box borderWidth="1px" rounded="xl" overflow="hidden">
          <Box p={4} borderBottomWidth="1px" bg="bg.subtle">
            <Text fontSize="sm" fontWeight="medium">
              {t("resend.detail.content", {
                defaultValue: "Email Content",
              })}
            </Text>
          </Box>
          <Box p={5}>
            {email.html ? (
              <EmailHtmlPreview html={email.html} />
            ) : email.text ? (
              <Text fontSize="sm" whiteSpace="pre-wrap" wordBreak="break-word">
                {email.text}
              </Text>
            ) : (
              <Flex align="center" justify="center" py={8}>
                <VStack gap={2} color="fg.muted">
                  <MaterialSymbol fontSize="32px">mail</MaterialSymbol>
                  <Text fontSize="sm">
                    {t("resend.noContent", {
                      defaultValue: "No content available",
                    })}
                  </Text>
                </VStack>
              </Flex>
            )}
          </Box>
        </Box>
      </VStack>
    </Box>
  );
}
