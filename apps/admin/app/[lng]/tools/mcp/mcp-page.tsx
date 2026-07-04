"use client";

import { useT } from "@/i18n/client";
import {
  Badge,
  Box,
  Card,
  Clipboard,
  Code,
  HStack,
  IconButton,
  List,
  SimpleGrid,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ButtonLink, CustomHeading, MaterialSymbol } from "@konfi/components";
import { useEffect, useMemo, useState } from "react";

type ClientSetup = {
  value: string;
  label: string;
  steps: string[];
  copyValue: string;
  copyLabel: string;
  note?: string;
};

type InfoSection = {
  icon: string;
  title: string;
  description: string;
};

function CopyBlock({
  value,
  label,
  multiline = false,
}: {
  value: string;
  label: string;
  multiline?: boolean;
}) {
  return (
    <Clipboard.Root value={value} w={"100%"}>
      <HStack alignItems={"stretch"} gap={3} w={"100%"}>
        <Code
          as={"pre"}
          flex={1}
          minH={multiline ? "120px" : "44px"}
          overflowX={"auto"}
          px={4}
          py={3}
          rounded={"xl"}
          whiteSpace={"pre"}
          borderWidth={"1px"}
          borderColor={"border.muted"}
          bg={"bg.muted"}
        >
          {value}
        </Code>
        <Clipboard.Trigger asChild>
          <IconButton
            aria-label={label}
            title={label}
            variant={"surface"}
            h={"44px"}
            minW={"44px"}
            flexShrink={0}
          >
            <Clipboard.Indicator
              copied={<MaterialSymbol>check</MaterialSymbol>}
            >
              <MaterialSymbol>content_copy</MaterialSymbol>
            </Clipboard.Indicator>
          </IconButton>
        </Clipboard.Trigger>
      </HStack>
    </Clipboard.Root>
  );
}

function InfoCard({ section }: { section: InfoSection }) {
  return (
    <Card.Root
      h={"100%"}
      variant={"outline"}
      rounded={"2xl"}
      borderWidth={"1px"}
      borderColor={"border.muted"}
    >
      <Card.Body>
        <HStack gap={3} alignItems={"flex-start"}>
          <Box
            color={"primary.fg"}
            bg={"primary.subtle"}
            rounded={"xl"}
            p={2}
            lineHeight={1}
            flexShrink={0}
          >
            <MaterialSymbol>{section.icon}</MaterialSymbol>
          </Box>
          <VStack alignItems={"flex-start"} gap={1} minW={0}>
            <Card.Title fontSize={"md"}>{section.title}</Card.Title>
            <Card.Description>{section.description}</Card.Description>
          </VStack>
        </HStack>
      </Card.Body>
    </Card.Root>
  );
}

export default function McpPage() {
  const { t } = useT();
  const [mcpUrl, setMcpUrl] = useState("https://admin.example.com/mcp");

  useEffect(() => {
    setMcpUrl(new URL("/mcp", window.location.origin).href);
  }, []);

  const clientSetups: ClientSetup[] = useMemo(
    () => [
      {
        value: "chatgpt",
        label: t("mcpPage.clients.chatgpt", { defaultValue: "ChatGPT" }),
        steps: [
          t("mcpPage.clientSteps.chatgpt.open", {
            defaultValue: "Open Settings -> Connectors -> Create.",
          }),
          t("mcpPage.clientSteps.chatgpt.paste", {
            defaultValue: "Paste the MCP server URL below.",
          }),
          t("mcpPage.clientSteps.chatgpt.authorize", {
            defaultValue: "Authorize Konfi and start creating.",
          }),
        ],
        copyValue: mcpUrl,
        copyLabel: t("mcpPage.copy.endpoint", {
          defaultValue: "Copy MCP server URL",
        }),
      },
      {
        value: "claude-desktop",
        label: t("mcpPage.clients.claudeDesktop", {
          defaultValue: "Claude Desktop",
        }),
        steps: [
          t("mcpPage.clientSteps.claudeDesktop.open", {
            defaultValue: "Open Settings -> Connectors.",
          }),
          t("mcpPage.clientSteps.claudeDesktop.add", {
            defaultValue: "Click Add connector and paste the Konfi URL.",
          }),
          t("mcpPage.clientSteps.claudeDesktop.connect", {
            defaultValue: "Select the MCP server and click Connect.",
          }),
        ],
        copyValue: mcpUrl,
        copyLabel: t("mcpPage.copy.endpoint", {
          defaultValue: "Copy MCP server URL",
        }),
      },
      {
        value: "claude-code",
        label: t("mcpPage.clients.claudeCode", {
          defaultValue: "Claude Code",
        }),
        steps: [
          t("mcpPage.clientSteps.command.run", {
            defaultValue: "Run the command in your terminal.",
          }),
          t("mcpPage.clientSteps.command.approve", {
            defaultValue: "Approve the browser sign-in when prompted.",
          }),
          t("mcpPage.clientSteps.command.create", {
            defaultValue: "Start creating with Konfi data.",
          }),
        ],
        copyValue: `claude mcp add --transport http konfi ${mcpUrl}`,
        copyLabel: t("mcpPage.copy.command", {
          defaultValue: "Copy setup command",
        }),
      },
      {
        value: "codex",
        label: t("mcpPage.clients.codex", { defaultValue: "Codex" }),
        steps: [
          t("mcpPage.clientSteps.command.run", {
            defaultValue: "Run the command in your terminal.",
          }),
          t("mcpPage.clientSteps.command.approve", {
            defaultValue: "Approve the browser sign-in when prompted.",
          }),
          t("mcpPage.clientSteps.command.create", {
            defaultValue: "Start creating with Konfi data.",
          }),
        ],
        copyValue: `codex mcp add --transport http konfi ${mcpUrl}`,
        copyLabel: t("mcpPage.copy.command", {
          defaultValue: "Copy setup command",
        }),
      },
      {
        value: "cursor",
        label: t("mcpPage.clients.cursor", { defaultValue: "Cursor" }),
        steps: [
          t("mcpPage.clientSteps.config.open", {
            defaultValue: "Open MCP settings in the client.",
          }),
          t("mcpPage.clientSteps.config.add", {
            defaultValue: "Add Konfi as a remote HTTP server.",
          }),
          t("mcpPage.clientSteps.config.authorize", {
            defaultValue:
              "Save, authenticate, and approve the requested scopes.",
          }),
        ],
        copyValue: JSON.stringify(
          {
            mcpServers: {
              konfi: {
                url: mcpUrl,
              },
            },
          },
          null,
          2,
        ),
        copyLabel: t("mcpPage.copy.config", {
          defaultValue: "Copy MCP config",
        }),
        note: t("mcpPage.clientNotes.config", {
          defaultValue:
            "Use this JSON in clients that accept an MCP server configuration file.",
        }),
      },
      {
        value: "vs-code",
        label: t("mcpPage.clients.vsCode", { defaultValue: "VS Code" }),
        steps: [
          t("mcpPage.clientSteps.config.open", {
            defaultValue: "Open MCP settings in the client.",
          }),
          t("mcpPage.clientSteps.config.add", {
            defaultValue: "Add Konfi as a remote HTTP server.",
          }),
          t("mcpPage.clientSteps.config.authorize", {
            defaultValue:
              "Save, authenticate, and approve the requested scopes.",
          }),
        ],
        copyValue: JSON.stringify(
          {
            servers: {
              konfi: {
                type: "http",
                url: mcpUrl,
              },
            },
          },
          null,
          2,
        ),
        copyLabel: t("mcpPage.copy.config", {
          defaultValue: "Copy MCP config",
        }),
        note: t("mcpPage.clientNotes.config", {
          defaultValue:
            "Use this JSON in clients that accept an MCP server configuration file.",
        }),
      },
      {
        value: "gemini",
        label: t("mcpPage.clients.gemini", { defaultValue: "Gemini" }),
        steps: [
          t("mcpPage.clientSteps.endpoint.open", {
            defaultValue: "Open the client's MCP connector settings.",
          }),
          t("mcpPage.clientSteps.endpoint.paste", {
            defaultValue: "Paste the Konfi MCP server URL.",
          }),
          t("mcpPage.clientSteps.endpoint.authorize", {
            defaultValue: "Authenticate in Konfi and approve access.",
          }),
        ],
        copyValue: mcpUrl,
        copyLabel: t("mcpPage.copy.endpoint", {
          defaultValue: "Copy MCP server URL",
        }),
      },
      {
        value: "hermes",
        label: t("mcpPage.clients.hermes", { defaultValue: "Hermes" }),
        steps: [
          t("mcpPage.clientSteps.endpoint.open", {
            defaultValue: "Open the client's MCP connector settings.",
          }),
          t("mcpPage.clientSteps.endpoint.paste", {
            defaultValue: "Paste the Konfi MCP server URL.",
          }),
          t("mcpPage.clientSteps.endpoint.authorize", {
            defaultValue: "Authenticate in Konfi and approve access.",
          }),
        ],
        copyValue: mcpUrl,
        copyLabel: t("mcpPage.copy.endpoint", {
          defaultValue: "Copy MCP server URL",
        }),
      },
    ],
    [mcpUrl, t],
  );

  const infoSections: InfoSection[] = [
    {
      icon: "verified_user",
      title: t("mcpPage.info.permissions.title", {
        defaultValue: "Permission aware",
      }),
      description: t("mcpPage.info.permissions.description", {
        defaultValue:
          "Tools are filtered by the signed-in user's role, channel access, and approved OAuth scopes.",
      }),
    },
    {
      icon: "lock",
      title: t("mcpPage.info.auth.title", {
        defaultValue: "OAuth sign-in",
      }),
      description: t("mcpPage.info.auth.description", {
        defaultValue:
          "Konfi never asks you to paste a static bearer token into an external client.",
      }),
    },
    {
      icon: "draft",
      title: t("mcpPage.info.drafts.title", {
        defaultValue: "Reviewed changes",
      }),
      description: t("mcpPage.info.drafts.description", {
        defaultValue:
          "Write-capable tools create controlled drafts that an admin can review before using.",
      }),
    },
  ];

  return (
    <>
      <CustomHeading
        heading={t("tools.mcpServer", { defaultValue: "MCP Server" })}
        mb={"8"}
        breadcrumb={true}
        goBack={true}
        t={t}
      />

      <VStack alignItems={"stretch"} gap={6}>
        <Card.Root
          variant={"outline"}
          rounded={"2xl"}
          borderWidth={"1px"}
          borderColor={"border.muted"}
        >
          <Card.Body p={{ base: 4, md: 6 }}>
            <VStack alignItems={"flex-start"} gap={3} maxW={"5xl"}>
              <Badge colorPalette={"primary"} variant={"subtle"}>
                {t("mcpPage.overview.badge", {
                  defaultValue: "AI integration",
                })}
              </Badge>
              <Text fontSize={{ base: "xl", md: "2xl" }} fontWeight={"bold"}>
                {t("mcpPage.overview.title", {
                  defaultValue:
                    "Connect Konfi's approved tools to your AI client.",
                })}
              </Text>
              <Text color={"fg.muted"}>
                {t("mcpPage.overview.description", {
                  defaultValue:
                    "Use Konfi products, orders, quotes, customers, invoices, and draft actions directly in clients that support MCP. Access follows your Konfi account permissions.",
                })}
              </Text>
            </VStack>
          </Card.Body>
        </Card.Root>

        <Card.Root
          variant={"outline"}
          rounded={"2xl"}
          borderWidth={"1px"}
          borderColor={"border.muted"}
        >
          <Card.Body>
            <Tabs.Root defaultValue={"chatgpt"} variant={"subtle"}>
              <Tabs.List
                gap={2}
                flexWrap={"wrap"}
                h={"auto"}
                justifyContent={"flex-start"}
                bg={"transparent"}
              >
                {clientSetups.map((client) => (
                  <Tabs.Trigger
                    key={client.value}
                    value={client.value}
                    rounded={"full"}
                    whiteSpace={"nowrap"}
                  >
                    {client.label}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>

              {clientSetups.map((client) => (
                <Tabs.Content key={client.value} value={client.value} pt={8}>
                  <VStack alignItems={"stretch"} gap={5}>
                    <List.Root
                      as={"ol"}
                      ps={5}
                      gap={2}
                      listStyleType={"decimal"}
                    >
                      {client.steps.map((step) => (
                        <List.Item
                          key={step}
                          color={"fg"}
                          fontSize={{ base: "sm", md: "md" }}
                          fontWeight={"medium"}
                        >
                          {step}
                        </List.Item>
                      ))}
                    </List.Root>

                    <CopyBlock
                      value={client.copyValue}
                      label={client.copyLabel}
                      multiline={client.copyValue.includes("\n")}
                    />

                    {client.note && (
                      <Text color={"fg.muted"} fontSize={"sm"}>
                        {client.note}
                      </Text>
                    )}

                    <HStack gap={3} flexWrap={"wrap"}>
                      <ButtonLink
                        href={"https://modelcontextprotocol.io/docs"}
                        isExternal
                        ariaLabel={t("mcpPage.links.setupDocs", {
                          defaultValue: "Read MCP setup docs",
                        })}
                        size={"sm"}
                        variant={"ghost"}
                      >
                        {t("mcpPage.links.setupDocs", {
                          defaultValue: "Read setup docs",
                        })}
                        <MaterialSymbol>open_in_new</MaterialSymbol>
                      </ButtonLink>
                      <ButtonLink
                        href={"https://modelcontextprotocol.io/introduction"}
                        isExternal
                        ariaLabel={t("mcpPage.links.documentation", {
                          defaultValue: "Open MCP documentation",
                        })}
                        size={"sm"}
                        variant={"ghost"}
                      >
                        {t("mcpPage.links.documentation", {
                          defaultValue: "MCP documentation",
                        })}
                        <MaterialSymbol>open_in_new</MaterialSymbol>
                      </ButtonLink>
                    </HStack>
                  </VStack>
                </Tabs.Content>
              ))}
            </Tabs.Root>
          </Card.Body>
        </Card.Root>

        <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
          {infoSections.map((section) => (
            <InfoCard key={section.title} section={section} />
          ))}
        </SimpleGrid>

        <Card.Root
          variant={"outline"}
          rounded={"2xl"}
          borderWidth={"1px"}
          borderColor={"border.muted"}
        >
          <Card.Header>
            <Card.Title>
              {t("mcpPage.scopes.title", {
                defaultValue: "Available access levels",
              })}
            </Card.Title>
            <Card.Description>
              {t("mcpPage.scopes.description", {
                defaultValue:
                  "The client only receives tools for the level your Konfi account can approve.",
              })}
            </Card.Description>
          </Card.Header>
          <Card.Body pt={0}>
            <HStack gap={2} flexWrap={"wrap"}>
              <Badge variant={"subtle"} colorPalette={"green"}>
                {t("mcpPage.scopeCards.store.title", {
                  defaultValue: "Store user",
                })}
              </Badge>
              <Badge variant={"subtle"} colorPalette={"blue"}>
                {t("mcpPage.scopeCards.admin.title", {
                  defaultValue: "Admin",
                })}
              </Badge>
              <Badge variant={"subtle"} colorPalette={"purple"}>
                {t("mcpPage.scopeCards.superAdmin.title", {
                  defaultValue: "Super admin",
                })}
              </Badge>
            </HStack>
          </Card.Body>
        </Card.Root>
      </VStack>
    </>
  );
}
