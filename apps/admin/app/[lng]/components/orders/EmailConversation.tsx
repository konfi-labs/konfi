"use client";

import { useT } from "@/i18n/client";
import {
  Accordion,
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Skeleton,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import type { Email } from "@konfi/microsoft";
import { extractEmailIdFromMailLink } from "@konfi/microsoft/utils";
import DOMPurify from "dompurify";
import { useMemo } from "react";
import useSWR from "swr";

interface SanitizedEmailContentProps {
  html: string;
}

/**
 * Safely render email HTML content with sanitization
 */
const SanitizedEmailContent = ({ html }: SanitizedEmailContentProps) => {
  const sanitizedHtml = useMemo(() => {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        "p",
        "br",
        "span",
        "div",
        "a",
        "b",
        "i",
        "u",
        "strong",
        "em",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "ul",
        "ol",
        "li",
        "blockquote",
        "table",
        "thead",
        "tbody",
        "tr",
        "td",
        "th",
        "img",
        "hr",
        "pre",
        "code",
      ],
      ALLOWED_ATTR: [
        "href",
        "src",
        "alt",
        "title",
        "style",
        "class",
        "id",
        "width",
        "height",
        "border",
        "cellpadding",
        "cellspacing",
        "align",
        "valign",
      ],
      ADD_ATTR: ["target"],
      FORBID_TAGS: [
        "script",
        "style",
        "iframe",
        "object",
        "embed",
        "form",
        "input",
        "button",
      ],
      ALLOW_DATA_ATTR: false,
    });
  }, [html]);

  const processedHtml = useMemo(() => {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = sanitizedHtml;

    const links = tempDiv.querySelectorAll("a");
    links.forEach((link) => {
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    });

    return tempDiv.innerHTML;
  }, [sanitizedHtml]);

  return (
    <Box
      dangerouslySetInnerHTML={{ __html: processedHtml }}
      overflow="hidden"
      wordBreak="break-word"
      css={{
        "& img": { maxWidth: "100%", height: "auto" },
        "& a": {
          color: "var(--chakra-colors-primary-500)",
          wordBreak: "break-all",
        },
        "& table": { maxWidth: "100%", tableLayout: "fixed" },
        "& pre, & code": {
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          overflowWrap: "break-word",
        },
        "& *": { maxWidth: "100%" },
      }}
    />
  );
};

interface ConversationResponse {
  emails: Email[];
  conversationId: string;
  count: number;
}

interface MicrosoftAuthStatus {
  connected: boolean;
  user: {
    id: string;
    email: string;
    name: string;
  } | null;
}

interface FetchError extends Error {
  status?: number;
}

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) {
      const error: FetchError = new Error("Failed to fetch");
      error.status = res.status;
      throw error;
    }
    return res.json();
  });

interface EmailConversationProps {
  mailLink: string;
}

export const EmailConversation = ({ mailLink }: EmailConversationProps) => {
  const { t, i18n } = useT();

  // Check Microsoft auth status
  const { data: authStatus, isLoading: authLoading } =
    useSWR<MicrosoftAuthStatus>("/api/auth/microsoft/status", fetcher, {
      revalidateOnFocus: false,
    });

  // Extract email ID from mailLink
  const emailId = useMemo(
    () => extractEmailIdFromMailLink(mailLink),
    [mailLink],
  );

  // Fetch conversation only if authenticated and we have an email ID
  const {
    data: conversation,
    isLoading: conversationLoading,
    error,
  } = useSWR<ConversationResponse>(
    authStatus?.connected && emailId
      ? `/api/microsoft/emails/conversation/${encodeURIComponent(emailId)}`
      : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  // Loading auth status
  if (authLoading) {
    return (
      <Box p={4} borderWidth="1px" rounded="xl">
        <Skeleton height="100px" rounded="lg" />
      </Box>
    );
  }

  // Not connected to Microsoft - show fallback link
  if (!authStatus?.connected) {
    return (
      <Box p={4} borderWidth="1px" rounded="3xl">
        <Flex align="center" justify="space-between" gap={4}>
          <HStack gap={3}>
            <MaterialSymbol color="fg.muted">mail</MaterialSymbol>
            <VStack align="start" gap={0}>
              <Text fontWeight="medium">
                {t("emails.conversation.linkedEmail", {
                  defaultValue: "Linked Email",
                })}
              </Text>
              <Text fontSize="sm" color="fg.muted">
                {t("emails.conversation.connectToView", {
                  defaultValue: "Connect to Microsoft to view the conversation",
                })}
              </Text>
            </VStack>
          </HStack>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(mailLink, "_blank")}
          >
            <MaterialSymbol>open_in_new</MaterialSymbol>
            {t("emails.conversation.openInOutlook", {
              defaultValue: "Open in Outlook",
            })}
          </Button>
        </Flex>
      </Box>
    );
  }

  // Could not extract email ID
  if (!emailId) {
    return (
      <Box p={4} borderWidth="1px" rounded="3xl">
        <Flex align="center" justify="space-between" gap={4}>
          <HStack gap={3}>
            <MaterialSymbol color="fg.muted">mail</MaterialSymbol>
            <Text color="fg.muted">
              {t("emails.conversation.invalidLink", {
                defaultValue: "Could not parse email link",
              })}
            </Text>
          </HStack>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(mailLink, "_blank")}
          >
            <MaterialSymbol>open_in_new</MaterialSymbol>
            {t("emails.conversation.openInOutlook", {
              defaultValue: "Open in Outlook",
            })}
          </Button>
        </Flex>
      </Box>
    );
  }

  // Loading conversation
  if (conversationLoading) {
    return (
      <Box p={4} borderWidth="1px" rounded="xl">
        <Flex align="center" gap={3}>
          <Spinner size="sm" />
          <Text color="fg.muted">
            {t("emails.conversation.loading", {
              defaultValue: "Loading email conversation...",
            })}
          </Text>
        </Flex>
      </Box>
    );
  }

  // Error fetching conversation
  if (error) {
    return (
      <Box p={4} borderWidth="1px" rounded="xl">
        <Flex align="center" justify="space-between" gap={4}>
          <HStack gap={3}>
            <MaterialSymbol color="red.500">error</MaterialSymbol>
            <Text color="fg.muted">
              {t("emails.conversation.error", {
                defaultValue: "Failed to load email conversation",
              })}
            </Text>
          </HStack>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(mailLink, "_blank")}
          >
            <MaterialSymbol>open_in_new</MaterialSymbol>
            {t("emails.conversation.openInOutlook", {
              defaultValue: "Open in Outlook",
            })}
          </Button>
        </Flex>
      </Box>
    );
  }

  // No conversation data
  if (!conversation || conversation.emails.length === 0) {
    return (
      <Box p={4} borderWidth="1px" rounded="xl">
        <Flex align="center" justify="space-between" gap={4}>
          <HStack gap={3}>
            <MaterialSymbol color="fg.muted">mail</MaterialSymbol>
            <Text color="fg.muted">
              {t("emails.conversation.noEmails", {
                defaultValue: "No emails found in conversation",
              })}
            </Text>
          </HStack>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(mailLink, "_blank")}
          >
            <MaterialSymbol>open_in_new</MaterialSymbol>
            {t("emails.conversation.openInOutlook", {
              defaultValue: "Open in Outlook",
            })}
          </Button>
        </Flex>
      </Box>
    );
  }

  return (
    <Box borderWidth="1px" rounded="xl" overflow="hidden">
      {/* Header */}
      <Flex
        p={4}
        borderBottomWidth="1px"
        align="center"
        justify="space-between"
      >
        <HStack gap={3}>
          <MaterialSymbol>forum</MaterialSymbol>
          <Text fontWeight="medium">
            {t("emails.conversation.title", {
              defaultValue: "Email Conversation",
            })}
          </Text>
          <Badge variant="subtle" size="sm">
            {conversation.emails.length}{" "}
            {t("emails.conversation.messages", { defaultValue: "messages" })}
          </Badge>
        </HStack>
        <IconButton
          variant="ghost"
          size="sm"
          aria-label={t("emails.conversation.openInOutlook", {
            defaultValue: "Open in Outlook",
          })}
          onClick={() => window.open(mailLink, "_blank")}
        >
          <MaterialSymbol>open_in_new</MaterialSymbol>
        </IconButton>
      </Flex>

      {/* Email thread */}
      <Box maxH="500px" overflowY="auto">
        <Accordion.Root
          multiple
          defaultValue={[
            conversation.emails[conversation.emails.length - 1]?.id,
          ]}
        >
          {conversation.emails.map((email, index) => (
            <Accordion.Item key={email.id} value={email.id}>
              <Accordion.ItemTrigger
                p={4}
                borderBottomWidth={
                  index < conversation.emails.length - 1 ? "1px" : 0
                }
              >
                <Flex flex={1} align="center" gap={3}>
                  <Box flex={1} minW={0}>
                    <Flex align="center" gap={2}>
                      {!email.isRead && (
                        <Box
                          w={2}
                          h={2}
                          rounded="full"
                          bg="primary.solid"
                          flexShrink={0}
                        />
                      )}
                      <Text
                        fontWeight={email.isRead ? "normal" : "semibold"}
                        fontSize="sm"
                        truncate
                      >
                        {email.from?.emailAddress?.name ||
                          email.from?.emailAddress?.address}
                      </Text>
                    </Flex>
                    <Text fontSize="xs" color="fg.muted" truncate mt={1}>
                      {email.subject ||
                        t("emails.noSubject", { defaultValue: "(No subject)" })}
                    </Text>
                  </Box>
                  <Text fontSize="xs" color="fg.muted" flexShrink={0}>
                    {new Date(email.receivedDateTime).toLocaleString(
                      i18n.resolvedLanguage,
                      {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      },
                    )}
                  </Text>
                </Flex>
                <Accordion.ItemIndicator>
                  <MaterialSymbol>expand_more</MaterialSymbol>
                </Accordion.ItemIndicator>
              </Accordion.ItemTrigger>
              <Accordion.ItemContent>
                <Box p={4} bg="bg.muted">
                  {/* Email header details */}
                  <VStack align="stretch" gap={2} mb={4}>
                    <HStack gap={2} flexWrap="wrap">
                      <Text fontSize="xs" color="fg.muted" fontWeight="medium">
                        {t("emails.conversation.from", {
                          defaultValue: "From:",
                        })}
                      </Text>
                      <Text fontSize="xs">
                        {email.from?.emailAddress?.name} &lt;
                        {email.from?.emailAddress?.address}&gt;
                      </Text>
                    </HStack>
                    {email.toRecipients && email.toRecipients.length > 0 && (
                      <HStack gap={2} flexWrap="wrap">
                        <Text
                          fontSize="xs"
                          color="fg.muted"
                          fontWeight="medium"
                        >
                          {t("emails.to", { defaultValue: "To:" })}
                        </Text>
                        {email.toRecipients.map((recipient, idx) => (
                          <Badge key={idx} size="sm" variant="outline">
                            {recipient.emailAddress?.name ||
                              recipient.emailAddress?.address}
                          </Badge>
                        ))}
                      </HStack>
                    )}
                    {email.hasAttachments &&
                      email.attachments &&
                      email.attachments.length > 0 && (
                        <HStack gap={2} flexWrap="wrap">
                          <MaterialSymbol color="fg.muted">
                            attach_file
                          </MaterialSymbol>
                          {email.attachments.map((attachment) => (
                            <Badge
                              key={attachment.id}
                              variant="subtle"
                              size="sm"
                            >
                              {attachment.name}
                            </Badge>
                          ))}
                        </HStack>
                      )}
                  </VStack>

                  {/* Email body */}
                  <Box bg="bg" p={4} rounded="lg" borderWidth="1px">
                    {email.body?.contentType === "html" ? (
                      <SanitizedEmailContent html={email.body.content} />
                    ) : (
                      <Text
                        whiteSpace="pre-wrap"
                        wordBreak="break-word"
                        fontSize="sm"
                      >
                        {email.body?.content || email.bodyPreview}
                      </Text>
                    )}
                  </Box>
                </Box>
              </Accordion.ItemContent>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      </Box>
    </Box>
  );
};

export default EmailConversation;
