"use client";

import type { EmailOrderImportRecord } from "@/lib/ai/email-order-import";
import { useAuth } from "@/context/auth";
import { useT } from "@/i18n/client";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Clipboard,
  Flex,
  Grid,
  HStack,
  IconButton,
  Separator,
  Skeleton,
  Spacer,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  CustomHeading,
  Empty,
  MaterialSymbol,
  RefreshButton,
  SearchInput,
  toaster,
} from "@konfi/components";
import DOMPurify from "dompurify";
import { useChannels } from "context/channels";
import { useConfiguration } from "context/configuration";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Email, MailFolder } from "@konfi/microsoft";

interface SanitizedEmailContentProps {
  html: string;
}

/**
 * Safely render email HTML content with sanitization
 * Prevents XSS attacks from malicious email content
 */
const SanitizedEmailContent = ({ html }: SanitizedEmailContentProps) => {
  const sanitizedHtml = useMemo(() => {
    return DOMPurify.sanitize(html, {
      // Allow safe HTML tags for email content
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
      // Allow safe attributes
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
      // Force all links to open in new tab
      ADD_ATTR: ["target"],
      // Remove script content
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
      // Ensure all anchor tags open in new tab for safety
      ALLOW_DATA_ATTR: false,
    });
  }, [html]);

  // Add target="_blank" and rel="noopener noreferrer" to all links after sanitization
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

interface MicrosoftAuthStatus {
  connected: boolean;
  user: {
    id: string;
    email: string;
    name: string;
  } | null;
  expiresAt?: number;
  reason?: string;
}

interface EmailsResponse {
  emails: Email[];
  nextLink?: string;
  count: number;
  hasMore: boolean;
}

interface FoldersResponse {
  folders: MailFolder[];
}

type PendingEmailAction = {
  conversationId: string;
  mode: "draft" | "followup";
};

const EmailsPage = () => {
  const { t, i18n } = useT();
  const router = useRouter();
  const { user, userInfo } = useAuth();
  const { channel } = useChannels();
  const { attributes } = useConfiguration();
  const [authStatus, setAuthStatus] = useState<MicrosoftAuthStatus | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [emails, setEmails] = useState<Email[]>([]);
  const [folders, setFolders] = useState<MailFolder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState("inbox");
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingImportId, setLoadingImportId] = useState<string | null>(null);
  const [loadingFollowUpId, setLoadingFollowUpId] = useState<string | null>(
    null,
  );
  const [emailImportState, setEmailImportState] =
    useState<EmailOrderImportRecord | null>(null);
  const [pendingEmailAction, setPendingEmailAction] =
    useState<PendingEmailAction | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    const success = searchParams.get("success");
    const error = searchParams.get("error");

    if (!success && !error) {
      return;
    }

    if (success === "microsoft_connected") {
      toaster.success({
        title: t("emails.connectSuccessTitle", {
          defaultValue: "Microsoft connected",
        }),
        description: t("emails.connectSuccessDescription", {
          defaultValue: "Your Microsoft account is now connected.",
        }),
      });
    } else if (error) {
      const errorDescriptions: Record<
        string,
        { key: string; defaultValue: string }
      > = {
        microsoft_auth_failed: {
          key: "emails.connectErrorAuth",
          defaultValue:
            "Microsoft returned an authorization error. Please try again.",
        },
        invalid_callback: {
          key: "emails.connectErrorCallback",
          defaultValue: "Invalid callback parameters. Please try again.",
        },
        state_mismatch: {
          key: "emails.connectErrorState",
          defaultValue: "Your session expired. Please try connecting again.",
        },
        token_exchange_failed: {
          key: "emails.connectErrorToken",
          defaultValue: "We couldn't complete the Microsoft token exchange.",
        },
      };

      const errorDescriptionConfig = errorDescriptions[error];
      const errorDescription = errorDescriptionConfig
        ? t(errorDescriptionConfig.key, {
            defaultValue: errorDescriptionConfig.defaultValue,
          })
        : t("emails.connectErrorGeneric", {
            defaultValue: "Something went wrong while connecting to Microsoft.",
          });

      toaster.error({
        title: t("emails.connectErrorTitle", {
          defaultValue: "Microsoft connection failed",
        }),
        description: errorDescription,
      });
    }

    const nextUrl = `${window.location.pathname}${window.location.hash || ""}`;
    window.history.replaceState(null, "", nextUrl);
  }, [t]);

  // Check authentication status
  const checkAuthStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/microsoft/status");
      const data: MicrosoftAuthStatus = await response.json();
      setAuthStatus(data);
      return data.connected;
    } catch (error) {
      console.error("Failed to check auth status:", error);
      setAuthStatus({ connected: false, user: null });
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch emails
  const fetchEmails = useCallback(
    async (folderId = "inbox", search?: string) => {
      setLoadingEmails(true);
      try {
        const params = new URLSearchParams({
          folderId,
          top: "25",
        });
        if (search) {
          params.set("search", search);
        }
        const response = await fetch(`/api/microsoft/emails?${params}`);
        if (!response.ok) {
          if (response.status === 401) {
            setAuthStatus({ connected: false, user: null });
            return;
          }
          throw new Error("Failed to fetch emails");
        }
        const data: EmailsResponse = await response.json();
        setEmails(data.emails);
      } catch (error) {
        console.error("Failed to fetch emails:", error);
        toaster.error({
          title: t("emails.fetchError", {
            defaultValue: "Failed to fetch emails",
          }),
        });
      } finally {
        setLoadingEmails(false);
      }
    },
    [t],
  );

  // Fetch folders
  const fetchFolders = useCallback(async () => {
    try {
      const response = await fetch("/api/microsoft/folders");
      if (!response.ok) {
        if (response.status === 401) {
          return;
        }
        throw new Error("Failed to fetch folders");
      }
      const data: FoldersResponse = await response.json();
      setFolders(data.folders);
    } catch (error) {
      console.error("Failed to fetch folders:", error);
    }
  }, []);

  // Get full email content
  const fetchEmailDetails = useCallback(
    async (emailId: string) => {
      try {
        const response = await fetch(
          `/api/microsoft/emails/${emailId}?attachments=true`,
        );
        if (!response.ok) {
          throw new Error("Failed to fetch email");
        }
        const data = await response.json();
        setSelectedEmail(data.email);
      } catch (error) {
        console.error("Failed to fetch email details:", error);
        toaster.error({
          title: t("emails.fetchEmailError", {
            defaultValue: "Failed to fetch email details",
          }),
        });
      }
    },
    [t],
  );

  const fetchEmailImportState = useCallback(async (conversationId: string) => {
    try {
      const response = await fetch(
        `/api/email-order-import/${encodeURIComponent(conversationId)}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        throw new Error("Failed to fetch email import state");
      }

      const data = (await response.json()) as EmailOrderImportRecord | null;
      setEmailImportState(data);
      return data;
    } catch (error) {
      console.error("Failed to fetch email import state:", error);
      setEmailImportState(null);
      return null;
    }
  }, []);

  const startEmailImport = useCallback(
    async (mode: "draft" | "followup") => {
      if (!selectedEmail?.id || !selectedEmail.conversationId) {
        return;
      }

      if (!channel?.id) {
        toaster.error({
          title: t("common.error", { defaultValue: "An error occurred" }),
          description: t("emails.importOrderMissingChannel", {
            defaultValue: "Select a channel before importing this email.",
          }),
        });
        return;
      }

      const createdBy = {
        id: user?.uid ?? "",
        name:
          userInfo?.displayName ??
          user?.displayName ??
          user?.email ??
          "Unknown",
      };

      if (!createdBy.id) {
        toaster.error({
          title: t("common.error", { defaultValue: "An error occurred" }),
          description: t("emails.importOrderMissingUser", {
            defaultValue: "Unable to resolve the current admin user.",
          }),
        });
        return;
      }

      if (mode === "followup") {
        setLoadingFollowUpId(selectedEmail.id);
      } else {
        setLoadingImportId(selectedEmail.id);
      }

      try {
        const response = await fetch("/api/email-order-import/start", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            emailId: selectedEmail.id,
            mailLink: selectedEmail.webLink ?? "",
            channelId: channel.id,
            createdBy,
            attributes: attributes ?? [],
            mode,
          }),
        });

        if (!response.ok) {
          const error = (await response.json()) as { error?: string };
          throw new Error(error.error ?? "Failed to import email as order");
        }

        const data = (await response.json()) as { conversationId: string };
        setPendingEmailAction({ conversationId: data.conversationId, mode });
        await fetchEmailImportState(data.conversationId);

        toaster.info({
          title:
            mode === "followup"
              ? t("emails.generateFollowUpStartedTitle", {
                  defaultValue: "Follow-up generation started",
                })
              : t("emails.importOrderStartedTitle", {
                  defaultValue: "Import started",
                }),
          description:
            mode === "followup"
              ? t("emails.generateFollowUpStartedDescription", {
                  defaultValue:
                    "The AI is analyzing the conversation and preparing a follow-up email draft.",
                })
              : t("emails.importOrderStartedDescription", {
                  defaultValue:
                    "The AI is analyzing the email conversation and preparing an order draft.",
                }),
        });
      } catch (error) {
        console.error("Failed to start email import action:", error);
        toaster.error({
          title:
            mode === "followup"
              ? t("emails.generateFollowUpFailedTitle", {
                  defaultValue: "Follow-up generation failed",
                })
              : t("emails.importOrderFailedTitle", {
                  defaultValue: "Import failed",
                }),
          description:
            error instanceof Error
              ? error.message
              : mode === "followup"
                ? t("emails.generateFollowUpFailedDescription", {
                    defaultValue:
                      "We couldn't prepare a follow-up email for this conversation.",
                  })
                : t("emails.importOrderFailedDescription", {
                    defaultValue:
                      "We couldn't analyze this email conversation.",
                  }),
        });
      } finally {
        if (mode === "followup") {
          setLoadingFollowUpId(null);
        } else {
          setLoadingImportId(null);
        }
      }
    },
    [
      attributes,
      channel?.id,
      fetchEmailImportState,
      selectedEmail?.conversationId,
      selectedEmail?.id,
      selectedEmail?.webLink,
      t,
      user?.displayName,
      user?.email,
      user?.uid,
      userInfo?.displayName,
    ],
  );

  // Disconnect from Microsoft (auth/session management)
  // NOTE: This does not modify mailbox content; it only clears the stored connection.
  const disconnect = useCallback(async () => {
    try {
      await fetch("/api/auth/microsoft/status", { method: "DELETE" });
      setAuthStatus({ connected: false, user: null });
      setEmails([]);
      setFolders([]);
      setSelectedEmail(null);
      toaster.success({
        title: t("emails.disconnected", {
          defaultValue: "Disconnected from Microsoft",
        }),
      });
    } catch (error) {
      console.error("Failed to disconnect:", error);
      toaster.error({
        title: t("emails.disconnectError", {
          defaultValue: "Failed to disconnect",
        }),
      });
    }
  }, [t]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      const isConnected = await checkAuthStatus();
      if (isConnected) {
        await Promise.all([fetchEmails(), fetchFolders()]);
      }
    };
    init();
  }, [checkAuthStatus, fetchEmails, fetchFolders]);

  useEffect(() => {
    if (!selectedEmail?.conversationId) {
      setEmailImportState(null);
      return;
    }

    void fetchEmailImportState(selectedEmail.conversationId);
  }, [fetchEmailImportState, selectedEmail?.conversationId]);

  useEffect(() => {
    if (
      emailImportState?.status !== "processing" ||
      !emailImportState.conversationId
    ) {
      return;
    }

    const interval = setInterval(() => {
      void fetchEmailImportState(emailImportState.conversationId);
    }, 2500);

    return () => clearInterval(interval);
  }, [
    emailImportState?.conversationId,
    emailImportState?.status,
    fetchEmailImportState,
  ]);

  useEffect(() => {
    if (
      !pendingEmailAction ||
      !emailImportState ||
      emailImportState.conversationId !== pendingEmailAction.conversationId
    ) {
      return;
    }

    if (emailImportState.status === "draft-ready") {
      if (pendingEmailAction.mode === "draft") {
        toaster.success({
          title: t("emails.importOrderDraftReadyTitle", {
            defaultValue: "Order draft ready",
          }),
          description: t("emails.importOrderDraftReadyDescription", {
            defaultValue:
              "The email was converted into a draft order and the form will open now.",
          }),
        });
        router.push(
          `/${i18n.resolvedLanguage}/orders/create?emailImportId=${encodeURIComponent(emailImportState.conversationId)}`,
        );
      }

      setPendingEmailAction(null);
      return;
    }

    if (emailImportState.status === "followup-required") {
      setPendingEmailAction(null);
      toaster.warning({
        title: t("emails.importOrderFollowupNeededTitle", {
          defaultValue: "Follow-up email prepared",
        }),
        description: t("emails.importOrderFollowupNeededDescription", {
          defaultValue:
            "The AI needs more information, so it drafted a follow-up email below.",
        }),
      });
      return;
    }

    if (emailImportState.status === "failed") {
      setPendingEmailAction(null);
      toaster.error({
        title: t("emails.importOrderFailedTitle", {
          defaultValue: "Import failed",
        }),
        description:
          emailImportState.error ||
          t("emails.importOrderFailedDescription", {
            defaultValue: "We couldn't analyze this email conversation.",
          }),
      });
    }
  }, [emailImportState, i18n.resolvedLanguage, pendingEmailAction, router, t]);

  // Handle folder change
  const handleFolderChange = useCallback(
    (folderId: string) => {
      setSelectedFolder(folderId);
      setSelectedEmail(null);
      fetchEmails(folderId, searchQuery || undefined);
    },
    [fetchEmails, searchQuery],
  );

  // Handle search
  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      fetchEmails(selectedFolder, query || undefined);
    },
    [fetchEmails, selectedFolder],
  );

  // Handle refresh
  const handleRefresh = useCallback(() => {
    fetchEmails(selectedFolder, searchQuery || undefined);
  }, [fetchEmails, selectedFolder, searchQuery]);

  const canOpenImportedDraft =
    !!selectedEmail?.conversationId &&
    emailImportState?.conversationId === selectedEmail.conversationId &&
    emailImportState.status === "draft-ready";
  const isGeneratingFollowUp = loadingFollowUpId === selectedEmail?.id;

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString(i18n.resolvedLanguage, {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return date.toLocaleDateString(i18n.resolvedLanguage, {
      month: "short",
      day: "numeric",
    });
  };

  // Loading state
  if (loading) {
    return (
      <Box>
        <CustomHeading
          heading={t("emails.title", { defaultValue: "Emails" })}
          mb="8"
          breadcrumb
          goBack
          t={t}
        />
        <VStack gap={4} align="stretch">
          <Skeleton height="60px" rounded="xl" />
          <Skeleton height="400px" rounded="xl" />
        </VStack>
      </Box>
    );
  }

  // Not authenticated
  if (!authStatus?.connected) {
    return (
      <Box>
        <CustomHeading
          heading={t("emails.title", { defaultValue: "Emails" })}
          mb="8"
          breadcrumb
          goBack
          t={t}
        />
        <Card.Root maxW="lg" mx="auto" mt="12">
          <Card.Body>
            <VStack gap={6} py={4}>
              <Box
                p={4}
                rounded="full"
                bg="primary.50"
                _dark={{ bg: "primary.900/20" }}
              >
                <Center>
                  <MaterialSymbol color="primary.solid">mail</MaterialSymbol>
                </Center>
              </Box>
              <VStack gap={2}>
                <Text fontSize="xl" fontWeight="semibold">
                  {t("emails.connectTitle", {
                    defaultValue: "Connect to Microsoft Outlook",
                  })}
                </Text>
                <Text color="fg.muted" textAlign="center">
                  {t("emails.connectDescription", {
                    defaultValue:
                      "Sign in with your Microsoft account to view and manage your emails.",
                  })}
                </Text>
              </VStack>
              <Button
                colorPalette="primary"
                size="lg"
                onClick={() => (window.location.href = "/api/auth/microsoft")}
              >
                <MaterialSymbol>login</MaterialSymbol>
                {t("emails.signInMicrosoft", {
                  defaultValue: "Sign in with Microsoft",
                })}
              </Button>
            </VStack>
          </Card.Body>
        </Card.Root>
      </Box>
    );
  }

  return (
    <Box h="80vh" mb="48">
      <CustomHeading
        heading={t("emails.title", { defaultValue: "Emails" })}
        mb="8"
        breadcrumb
        goBack
        t={t}
      />

      {/* User info and actions */}
      <Flex mb={4} gap={4} align="center" flexWrap="wrap">
        <HStack gap={2}>
          <MaterialSymbol color="primary.solid">account_circle</MaterialSymbol>
          <Text fontWeight="medium">{authStatus.user?.name}</Text>
          <Text color="fg.muted" fontSize="sm">
            ({authStatus.user?.email})
          </Text>
        </HStack>
        <SearchInput
          placeholder={t("emails.searchPlaceholder", {
            defaultValue: "Search emails...",
          })}
          searchFn={handleSearch}
          cleanFn={() => handleSearch("")}
          searchResults={emails.length > 0 ? emails : undefined}
          loading={loadingEmails}
          t={t}
        />
        <Spacer />
        <HStack gap={2}>
          <Button
            size="sm"
            variant="outline"
            disabled={!selectedEmail?.conversationId}
            loading={isGeneratingFollowUp}
            onClick={() => {
              void startEmailImport("followup");
            }}
          >
            <MaterialSymbol>mail</MaterialSymbol>
            {t("emails.generateFollowUp", {
              defaultValue: "Generate follow-up",
            })}
          </Button>
          <Button
            size="sm"
            colorPalette="primary"
            variant={canOpenImportedDraft ? "subtle" : "solid"}
            disabled={!selectedEmail?.conversationId}
            loading={loadingImportId === selectedEmail?.id}
            onClick={() => {
              if (canOpenImportedDraft && selectedEmail?.conversationId) {
                router.push(
                  `/${i18n.resolvedLanguage}/orders/create?emailImportId=${encodeURIComponent(selectedEmail.conversationId)}`,
                );
                return;
              }

              void startEmailImport("draft");
            }}
          >
            <MaterialSymbol>
              {canOpenImportedDraft ? "open_in_new" : "auto_awesome"}
            </MaterialSymbol>
            {canOpenImportedDraft
              ? t("emails.openImportedOrderDraft", {
                  defaultValue: "Open imported draft",
                })
              : t("emails.importAsOrder", {
                  defaultValue: "Import as order",
                })}
          </Button>
          <RefreshButton
            label={t("emails.refresh", { defaultValue: "Refresh" })}
            refreshFunction={handleRefresh}
          />
          <Button variant="outline" size="sm" onClick={disconnect}>
            <MaterialSymbol>logout</MaterialSymbol>
            {t("emails.disconnect", { defaultValue: "Disconnect" })}
          </Button>
        </HStack>
      </Flex>

      <Separator mb={4} />

      {/* Main content */}
      <Grid
        templateColumns={{
          base: "1fr",
          md: "200px 1fr",
          lg: "200px .66fr 1fr",
        }}
        gap={4}
        h="100%"
        overflow="hidden"
      >
        {/* Folders sidebar */}
        <Box display={{ base: "none", md: "block" }} overflow="hidden">
          <VStack align="stretch" gap={1}>
            <Button
              variant={selectedFolder === "inbox" ? "subtle" : "ghost"}
              justifyContent="flex-start"
              onClick={() => handleFolderChange("inbox")}
            >
              <MaterialSymbol>inbox</MaterialSymbol>
              {t("emails.inbox", { defaultValue: "Inbox" })}
            </Button>
            <Button
              variant={selectedFolder === "sentitems" ? "subtle" : "ghost"}
              justifyContent="flex-start"
              onClick={() => handleFolderChange("sentitems")}
            >
              <MaterialSymbol>send</MaterialSymbol>
              {t("emails.sent", { defaultValue: "Sent" })}
            </Button>
            <Button
              variant={selectedFolder === "drafts" ? "subtle" : "ghost"}
              justifyContent="flex-start"
              onClick={() => handleFolderChange("drafts")}
            >
              <MaterialSymbol>draft</MaterialSymbol>
              {t("emails.drafts", { defaultValue: "Drafts" })}
            </Button>
            <Button
              variant={selectedFolder === "deleteditems" ? "subtle" : "ghost"}
              justifyContent="flex-start"
              onClick={() => handleFolderChange("deleteditems")}
            >
              <MaterialSymbol>delete</MaterialSymbol>
              {t("emails.trash", { defaultValue: "Trash" })}
            </Button>
            {folders
              .filter(
                (f) =>
                  ![
                    "inbox",
                    "sentitems",
                    "drafts",
                    "deleteditems",
                    "junkemail",
                    "outbox",
                  ].includes(f.displayName.toLowerCase().replace(/\s/g, "")),
              )
              .map((folder) => (
                <Button
                  key={folder.id}
                  variant={selectedFolder === folder.id ? "subtle" : "ghost"}
                  justifyContent="flex-start"
                  onClick={() => handleFolderChange(folder.id)}
                >
                  <MaterialSymbol>folder</MaterialSymbol>
                  {folder.displayName}
                </Button>
              ))}
          </VStack>
        </Box>

        {/* Email list */}
        <Box borderWidth="1px" rounded="xl" overflow="hidden">
          <Box maxH="550px" overflowY="auto">
            {loadingEmails ? (
              <VStack p={4} gap={3}>
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} height="70px" width="100%" rounded="lg" />
                ))}
              </VStack>
            ) : emails.length === 0 ? (
              <Empty
                title={t("emails.noEmails", { defaultValue: "No emails" })}
                description={t("emails.noEmailsDescription", {
                  defaultValue: "No emails found in this folder.",
                })}
                icon="mail"
              />
            ) : (
              <VStack align="stretch" gap={0}>
                {emails.map((email) => (
                  <Box
                    key={email.id}
                    p={3}
                    cursor="pointer"
                    bg={selectedEmail?.id === email.id ? "bg.muted" : undefined}
                    _hover={{ bg: "bg.muted" }}
                    borderBottomWidth="1px"
                    onClick={() => fetchEmailDetails(email.id)}
                  >
                    <Flex justify="space-between" align="start" gap={2}>
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
                            truncate
                            fontSize="sm"
                          >
                            {email.from?.emailAddress?.name ||
                              email.from?.emailAddress?.address ||
                              "Unknown"}
                          </Text>
                        </Flex>
                        <Text
                          fontWeight={email.isRead ? "normal" : "medium"}
                          truncate
                          fontSize="sm"
                          mt={1}
                        >
                          {email.subject ||
                            t("emails.noSubject", {
                              defaultValue: "(No subject)",
                            })}
                        </Text>
                        <Text color="fg.muted" truncate fontSize="xs" mt={1}>
                          {email.bodyPreview}
                        </Text>
                      </Box>
                      <VStack gap={1} align="end" flexShrink={0}>
                        <Text fontSize="xs" color="fg.muted">
                          {formatDate(email.receivedDateTime)}
                        </Text>
                        {email.hasAttachments && (
                          <MaterialSymbol color="fg.muted">
                            attach_file
                          </MaterialSymbol>
                        )}
                      </VStack>
                    </Flex>
                  </Box>
                ))}
              </VStack>
            )}
          </Box>
        </Box>

        {/* Email detail */}
        <Box
          minW={0}
          borderWidth="1px"
          rounded="xl"
          overflow="hidden"
          display={{ base: "none", lg: "block" }}
        >
          {selectedEmail ? (
            <VStack h="100%" align="stretch" gap={0} overflow="hidden">
              <Box p={4} borderBottomWidth="1px" flexShrink={0}>
                <Flex justify="space-between" align="start" gap={4}>
                  <Box flex={1}>
                    <Text fontSize="lg" fontWeight="semibold">
                      {selectedEmail.subject ||
                        t("emails.noSubject", { defaultValue: "(No subject)" })}
                    </Text>
                    <HStack gap={2} mt={2} flexWrap="wrap">
                      <Text fontSize="sm" fontWeight="medium">
                        {selectedEmail.from?.emailAddress?.name}
                      </Text>
                      <Text fontSize="sm" color="fg.muted">
                        &lt;{selectedEmail.from?.emailAddress?.address}&gt;
                      </Text>
                    </HStack>
                    <Text fontSize="xs" color="fg.muted" mt={1}>
                      {new Date(selectedEmail.receivedDateTime).toLocaleString(
                        i18n.resolvedLanguage,
                      )}
                    </Text>
                  </Box>
                  <HStack gap={1}>
                    {selectedEmail.webLink && (
                      <IconButton
                        variant="ghost"
                        size="sm"
                        aria-label={t("emails.openInOutlook", {
                          defaultValue: "Open in Outlook",
                        })}
                        onClick={() =>
                          window.open(selectedEmail.webLink, "_blank")
                        }
                      >
                        <MaterialSymbol>open_in_new</MaterialSymbol>
                      </IconButton>
                    )}
                  </HStack>
                </Flex>
                {selectedEmail.toRecipients &&
                  selectedEmail.toRecipients.length > 0 && (
                    <HStack gap={1} mt={2} flexWrap="wrap">
                      <Text fontSize="xs" color="fg.muted">
                        {t("emails.to", { defaultValue: "To:" })}
                      </Text>
                      {selectedEmail.toRecipients.map((recipient, idx) => (
                        <Badge key={idx} size="sm" variant="outline">
                          {recipient.emailAddress?.name ||
                            recipient.emailAddress?.address}
                        </Badge>
                      ))}
                    </HStack>
                  )}
                {selectedEmail.hasAttachments && selectedEmail.attachments && (
                  <HStack gap={2} mt={3} flexWrap="wrap">
                    <MaterialSymbol fontSize="16px" color="fg.muted">
                      attach_file
                    </MaterialSymbol>
                    {selectedEmail.attachments.map((attachment) => (
                      <Badge key={attachment.id} variant="subtle">
                        {attachment.name}
                      </Badge>
                    ))}
                  </HStack>
                )}
              </Box>
              {selectedEmail.conversationId &&
                emailImportState?.conversationId ===
                  selectedEmail.conversationId && (
                  <Box p={4} borderBottomWidth="1px" flexShrink={0}>
                    {emailImportState.status === "processing" && (
                      <Alert.Root status="info">
                        <Alert.Indicator />
                        <Alert.Content>
                          <Alert.Title>
                            {emailImportState.requestedMode === "followup"
                              ? t("emails.generateFollowUpProcessingTitle", {
                                  defaultValue: "Preparing follow-up email",
                                })
                              : t("emails.importOrderProcessingTitle", {
                                  defaultValue: "Preparing order draft",
                                })}
                          </Alert.Title>
                          <Alert.Description>
                            {emailImportState.requestedMode === "followup"
                              ? t(
                                  "emails.generateFollowUpProcessingDescription",
                                  {
                                    defaultValue:
                                      "The AI is reviewing the conversation and drafting a follow-up email.",
                                  },
                                )
                              : t("emails.importOrderProcessingDescription", {
                                  defaultValue:
                                    "The AI is checking customer matches and product suggestions for this conversation.",
                                })}
                          </Alert.Description>
                        </Alert.Content>
                      </Alert.Root>
                    )}

                    {emailImportState.status === "draft-ready" &&
                      emailImportState.orderDraft && (
                        <Alert.Root status="success">
                          <Alert.Indicator />
                          <Alert.Content>
                            <Alert.Title>
                              {t("emails.importOrderDraftReadyTitle", {
                                defaultValue: "Order draft ready",
                              })}
                            </Alert.Title>
                            <Alert.Description>
                              {t("emails.importOrderDraftReadyDescription", {
                                defaultValue:
                                  "The email was converted into a draft order and can be opened in the order form.",
                              })}
                            </Alert.Description>
                          </Alert.Content>
                        </Alert.Root>
                      )}

                    {emailImportState.status === "followup-required" &&
                      emailImportState.followUpEmail && (
                        <Card.Root>
                          <Card.Header>
                            <Flex justify="space-between" gap={3} align="start">
                              <VStack align="start" gap={1} flex={1} minW={0}>
                                <Text fontWeight="semibold">
                                  {t("emails.importOrderFollowupNeededTitle", {
                                    defaultValue: "Follow-up email prepared",
                                  })}
                                </Text>
                                <Text fontSize="sm" color="fg.muted">
                                  {emailImportState.followUpEmail.subject}
                                </Text>
                              </VStack>
                              <Clipboard.Root
                                value={`${emailImportState.followUpEmail.subject}\n\n${emailImportState.followUpEmail.body}`}
                              >
                                <Clipboard.Trigger asChild>
                                  <Button size="xs" variant="subtle">
                                    <Clipboard.Indicator
                                      copied={
                                        <MaterialSymbol>check</MaterialSymbol>
                                      }
                                    >
                                      <MaterialSymbol>
                                        content_copy
                                      </MaterialSymbol>
                                    </Clipboard.Indicator>
                                    {t("actions.copy", {
                                      defaultValue: "Copy",
                                    })}
                                  </Button>
                                </Clipboard.Trigger>
                              </Clipboard.Root>
                            </Flex>
                          </Card.Header>
                          <Card.Body>
                            {emailImportState.followUpEmail.missingInformation
                              .length > 0 && (
                              <HStack gap={2} mb={4} flexWrap="wrap">
                                {emailImportState.followUpEmail.missingInformation.map(
                                  (missingInfo) => (
                                    <Badge key={missingInfo} variant="subtle">
                                      {missingInfo}
                                    </Badge>
                                  ),
                                )}
                              </HStack>
                            )}
                            <Text whiteSpace="pre-wrap" fontSize="sm">
                              {emailImportState.followUpEmail.body}
                            </Text>
                          </Card.Body>
                        </Card.Root>
                      )}

                    {emailImportState.status === "failed" && (
                      <Alert.Root status="error">
                        <Alert.Indicator />
                        <Alert.Content>
                          <Alert.Title>
                            {t("emails.importOrderFailedTitle", {
                              defaultValue: "Import failed",
                            })}
                          </Alert.Title>
                          <Alert.Description>
                            {emailImportState.error ||
                              t("emails.importOrderFailedDescription", {
                                defaultValue:
                                  "We couldn't analyze this email conversation.",
                              })}
                          </Alert.Description>
                        </Alert.Content>
                      </Alert.Root>
                    )}
                  </Box>
                )}
              <Box p={4} flex={1} minW={0} overflow="auto" bg="white">
                {selectedEmail.body?.contentType === "html" ? (
                  <SanitizedEmailContent html={selectedEmail.body.content} />
                ) : (
                  <Text whiteSpace="pre-wrap" wordBreak="break-word">
                    {selectedEmail.body?.content}
                  </Text>
                )}
              </Box>
            </VStack>
          ) : (
            <Flex h="100%" align="center" justify="center">
              <VStack gap={2} color="fg.muted">
                <MaterialSymbol>mail</MaterialSymbol>
                <Text>
                  {t("emails.selectEmail", {
                    defaultValue: "Select an email to read",
                  })}
                </Text>
              </VStack>
            </Flex>
          )}
        </Box>
      </Grid>
    </Box>
  );
};

export default EmailsPage;
