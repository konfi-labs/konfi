"use client";

import { useSocial } from "@/context/social";
import { saveMetaAppCredentials, disconnectMeta } from "@/actions/social";
import { useT } from "@/i18n/client";
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Field,
  HStack,
  Input,
  Skeleton,
  Text,
  VStack,
} from "@chakra-ui/react";
import { AlertDialog, MaterialSymbol, toaster } from "@konfi/components";
import { useEffect, useState } from "react";

function ConnectorSetupSummary({
  requiresByoApp,
}: {
  requiresByoApp: boolean;
}) {
  const { t } = useT();
  return (
    <Card.Root size="sm" variant="subtle">
      <Card.Body>
        <VStack align="stretch" gap={3}>
          <HStack gap={2} flexWrap="wrap">
            <Text fontWeight="semibold">
              {t("social.availableConnectors", {
                defaultValue: "Available connectors",
              })}
            </Text>
            <Badge colorPalette="blue" size="sm">
              Meta
            </Badge>
          </HStack>
          <Text color="fg.muted" fontSize="sm">
            {t("social.metaConnectorDescription", {
              defaultValue:
                "Meta connects Facebook Pages and linked Instagram business accounts for scheduled publishing.",
            })}
          </Text>
          <Text color="fg.muted" fontSize="sm">
            {requiresByoApp
              ? t("social.sharedInstanceSetupLocation", {
                  defaultValue:
                    "For shared Konfi Cloud workspaces, configure the connector here with your Meta developer app credentials.",
                })
              : t("social.dedicatedInstanceSetupLocation", {
                  defaultValue:
                    "For dedicated instances, the connector is configured by the instance operator with META_APP_ID and META_APP_SECRET environment variables.",
                })}
          </Text>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}

export default function ConnectionCard() {
  const { t } = useT();
  const { loading, metaStatus, refresh } = useSocial();

  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);

  // Handle ?connected=1 / ?error=<code> from OAuth redirect
  useEffect(() => {
    if (typeof window === "undefined") return;

    const searchParams = new URLSearchParams(window.location.search);
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");

    if (!connected && !error) return;

    if (connected === "1") {
      toaster.success({
        title: t("social.connectedToast", {
          defaultValue: "Meta account connected",
        }),
      });
    } else if (error) {
      toaster.error({
        title: t("social.errorToast", {
          defaultValue: "Failed to connect Meta account",
        }),
        description: error,
      });
    }

    // Clean the query params without a full navigation
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.hash || ""}`,
    );
  }, [t]);

  const handleSaveCredentials = async () => {
    setSaving(true);
    try {
      await saveMetaAppCredentials({
        appId: appId.trim(),
        appSecret: appSecret.trim(),
      });
      refresh();
    } catch (error) {
      toaster.error({
        title: t("social.errorToast", {
          defaultValue: "Failed to connect Meta account",
        }),
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectMeta();
      refresh();
    } catch (error) {
      toaster.error({
        title: t("social.errorToast", {
          defaultValue: "Failed to connect Meta account",
        }),
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setDisconnecting(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Card.Root maxW="xl">
        <Card.Body>
          <VStack align="stretch" gap={3}>
            <Skeleton height="24px" width="40%" rounded="md" />
            <Skeleton height="16px" width="70%" rounded="md" />
            <Skeleton height="36px" width="160px" rounded="md" />
          </VStack>
        </Card.Body>
      </Card.Root>
    );
  }

  const status = metaStatus;

  // ── BYO app form ─────────────────────────────────────────────────────────
  if (status?.requiresByoApp && !status.appConfigured) {
    return (
      <Card.Root maxW="xl">
        <Card.Body>
          <VStack align="stretch" gap={6} py={4}>
            <Box
              p={4}
              rounded="full"
              bg="primary.50"
              _dark={{ bg: "primary.900/20" }}
              alignSelf="flex-start"
            >
              <Center>
                <MaterialSymbol color="primary.solid">share</MaterialSymbol>
              </Center>
            </Box>
            <VStack align="stretch" gap={2}>
              <Text fontSize="xl" fontWeight="semibold">
                {t("social.byoAppTitle", {
                  defaultValue: "Connect your Meta developer app",
                })}
              </Text>
              <Text color="fg.muted">
                {t("social.byoAppHelp", {
                  defaultValue:
                    "Create a Meta developer app and paste your App ID and App Secret below. Visit",
                })}{" "}
                <a
                  href="https://developers.facebook.com/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "var(--chakra-colors-blue-500)",
                    textDecoration: "underline",
                  }}
                >
                  developers.facebook.com/apps
                </a>
                .
              </Text>
            </VStack>
            <ConnectorSetupSummary requiresByoApp={status.requiresByoApp} />
            <Field.Root>
              <Field.Label>
                {t("social.appId", { defaultValue: "App ID" })}
              </Field.Label>
              <Input
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                placeholder="1234567890"
                autoComplete="off"
              />
            </Field.Root>
            <Field.Root>
              <Field.Label>
                {t("social.appSecret", { defaultValue: "App Secret" })}
              </Field.Label>
              <Input
                type="password"
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                placeholder="••••••••••••••••"
                autoComplete="off"
              />
            </Field.Root>
            <Box>
              <Button
                colorPalette="primary"
                variant="solid"
                size="lg"
                loading={saving}
                disabled={!appId.trim() || !appSecret.trim()}
                onClick={() => void handleSaveCredentials()}
              >
                <MaterialSymbol>save</MaterialSymbol>
                {t("social.save", { defaultValue: "Save" })}
              </Button>
            </Box>
          </VStack>
        </Card.Body>
      </Card.Root>
    );
  }

  // ── Not connected ─────────────────────────────────────────────────────────
  if (status?.appConfigured && !status.connected) {
    return (
      <Card.Root maxW="xl">
        <Card.Body>
          <VStack align="stretch" gap={6} py={4}>
            <Box
              p={4}
              rounded="full"
              bg="primary.50"
              _dark={{ bg: "primary.900/20" }}
              alignSelf="flex-start"
            >
              <Center>
                <MaterialSymbol color="primary.solid">share</MaterialSymbol>
              </Center>
            </Box>
            <VStack gap={2}>
              <Text fontSize="xl" fontWeight="semibold" alignSelf="flex-start">
                {t("social.connectMeta", { defaultValue: "Connect with Meta" })}
              </Text>
            </VStack>
            <ConnectorSetupSummary requiresByoApp={status.requiresByoApp} />
            <Box>
              <Button
                colorPalette="primary"
                variant="solid"
                size="lg"
                onClick={() => {
                  window.location.href = "/api/auth/meta";
                }}
              >
                <MaterialSymbol>login</MaterialSymbol>
                {t("social.connectMeta", { defaultValue: "Connect with Meta" })}
              </Button>
            </Box>
          </VStack>
        </Card.Body>
      </Card.Root>
    );
  }

  // ── Connected ─────────────────────────────────────────────────────────────
  if (status?.connected) {
    return (
      <>
        <Card.Root maxW="xl">
          <Card.Header>
            <HStack justify="space-between" flexWrap="wrap" gap={2}>
              <Text fontWeight="semibold">
                {t("social.connectedPages", {
                  defaultValue: "Connected pages",
                })}
              </Text>
              {status.needsAttention && (
                <Badge colorPalette="orange" size="sm">
                  {t("social.needsAttention", {
                    defaultValue: "Needs attention",
                  })}
                </Badge>
              )}
            </HStack>
          </Card.Header>
          <Card.Body>
            <VStack align="stretch" gap={4}>
              {status.needsAttention && (
                <Alert.Root status="warning">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>
                      {t("social.needsAttention", {
                        defaultValue: "Needs attention",
                      })}
                    </Alert.Title>
                    <Alert.Description>
                      {t("social.needsAttentionDescription", {
                        defaultValue:
                          "Your Meta connection needs to be renewed. Reconnect to restore access.",
                      })}
                    </Alert.Description>
                  </Alert.Content>
                </Alert.Root>
              )}
              <ConnectorSetupSummary requiresByoApp={status.requiresByoApp} />
              {status.pages.length > 0 ? (
                <VStack align="stretch" gap={2}>
                  {status.pages.map((page) => (
                    <Card.Root key={page.id} size="sm">
                      <Card.Body>
                        <HStack gap={2} flexWrap="wrap">
                          <Text fontWeight="medium">{page.name}</Text>
                          <Badge colorPalette="blue" size="sm">
                            Page
                          </Badge>
                          {page.igAccount && (
                            <Badge colorPalette="purple" size="sm">
                              {t("social.instagramAccount", {
                                defaultValue: "Instagram",
                              })}{" "}
                              @{page.igAccount.username}
                            </Badge>
                          )}
                        </HStack>
                      </Card.Body>
                    </Card.Root>
                  ))}
                </VStack>
              ) : (
                <Text color="fg.muted" fontSize="sm">
                  {t("social.connectedPages", {
                    defaultValue: "Connected pages",
                  })}
                  : 0
                </Text>
              )}
              <HStack gap={2} flexWrap="wrap">
                {status.needsAttention && (
                  <Button
                    colorPalette="primary"
                    variant="solid"
                    onClick={() => {
                      window.location.href = "/api/auth/meta";
                    }}
                  >
                    <MaterialSymbol>login</MaterialSymbol>
                    {t("social.reconnect", { defaultValue: "Reconnect" })}
                  </Button>
                )}
                <Button
                  variant="outline"
                  loading={disconnecting}
                  onClick={() => setShowDisconnectDialog(true)}
                >
                  <MaterialSymbol>logout</MaterialSymbol>
                  {t("social.disconnect", { defaultValue: "Disconnect" })}
                </Button>
              </HStack>
            </VStack>
          </Card.Body>
        </Card.Root>
        <AlertDialog
          header={t("social.disconnect", { defaultValue: "Disconnect" })}
          handle={() => void handleDisconnect()}
          open={showDisconnectDialog}
          setOpen={setShowDisconnectDialog}
          t={t}
        >
          <Text>
            {t("social.disconnectConfirm", {
              defaultValue:
                "This will remove the Meta connection. You can reconnect at any time.",
            })}
          </Text>
        </AlertDialog>
      </>
    );
  }

  // ── Connector available, but app setup is missing ───────────────────────
  if (status && !status.appConfigured) {
    return (
      <Card.Root maxW="xl">
        <Card.Body>
          <VStack align="stretch" gap={6} py={4}>
            <Box
              p={4}
              rounded="full"
              bg="primary.50"
              _dark={{ bg: "primary.900/20" }}
              alignSelf="flex-start"
            >
              <Center>
                <MaterialSymbol color="primary.solid">share</MaterialSymbol>
              </Center>
            </Box>
            <VStack align="stretch" gap={2}>
              <Text fontSize="xl" fontWeight="semibold">
                {t("social.connectorSetupRequired", {
                  defaultValue: "Connector setup required",
                })}
              </Text>
              <Text color="fg.muted">
                {t("social.connectorSetupRequiredDescription", {
                  defaultValue:
                    "Meta is available, but this instance needs connector credentials before admins can connect accounts.",
                })}
              </Text>
            </VStack>
            <ConnectorSetupSummary requiresByoApp={status.requiresByoApp} />
          </VStack>
        </Card.Body>
      </Card.Root>
    );
  }

  // ── Fallback (null status after load) ────────────────────────────────────
  return null;
}
