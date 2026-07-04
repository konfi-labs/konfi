"use client";

import {
  getAiInstructionSettingsAction,
  saveAiInstructionSettingsAction,
} from "@/actions/ai-instructions";
import ChannelsSelect from "@/components/layout/ChannelsSelect";
import { useT } from "@/i18n/client";
import {
  Badge,
  Button,
  Card,
  HStack,
  Separator,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import {
  CustomHeading,
  Field,
  MaterialSymbol,
  Switch,
  toaster,
} from "@konfi/components";
import type {
  AiInstructionCapability,
  AiInstructionSettings,
} from "@konfi/types";
import {
  AI_INSTRUCTION_CAPABILITIES,
  AI_INSTRUCTION_MAX_LENGTH,
  normalizeAiInstructionSettings,
} from "@konfi/utils";
import { useChannels } from "context/channels";
import { useEffect, useMemo, useState } from "react";

const capabilityIcons: Record<AiInstructionCapability, string> = {
  adminAssistant: "support_agent",
  printMethodResolution: "print",
  storefrontAssistant: "storefront",
  socialPosts: "share",
};

function createEmptySettings(): AiInstructionSettings {
  return normalizeAiInstructionSettings();
}

function serializeSettings(settings: AiInstructionSettings): string {
  return JSON.stringify(normalizeAiInstructionSettings(settings).capabilities);
}

export default function AiInstructionsPage() {
  const { t } = useT();
  const { channel } = useChannels();
  const [settings, setSettings] =
    useState<AiInstructionSettings>(createEmptySettings);
  const [persistedSettings, setPersistedSettings] =
    useState<AiInstructionSettings>(createEmptySettings);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [updatedBy, setUpdatedBy] =
    useState<AiInstructionSettings["updatedBy"]>();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!channel?.id) {
      setSettings(createEmptySettings());
      setPersistedSettings(createEmptySettings());
      setUpdatedAt(null);
      setUpdatedBy(undefined);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    getAiInstructionSettingsAction(channel.id)
      .then((result) => {
        if (cancelled) {
          return;
        }

        if (!result.ok) {
          toaster.error({
            title: t("aiInstructions.loadFailed.title", {
              defaultValue: "AI instructions were not loaded",
            }),
            description: t("aiInstructions.loadFailed.description", {
              defaultValue: "Check your permissions and try again.",
            }),
          });
          return;
        }

        const normalized = normalizeAiInstructionSettings(result.view.settings);
        setSettings(normalized);
        setPersistedSettings(normalized);
        setUpdatedAt(result.view.updatedAt);
        setUpdatedBy(result.view.updatedBy);
      })
      .catch((error) => {
        console.error("Failed to load AI instruction settings:", error);
        toaster.error({
          title: t("aiInstructions.loadFailed.title", {
            defaultValue: "AI instructions were not loaded",
          }),
          description: t("aiInstructions.loadFailed.description", {
            defaultValue: "Check your permissions and try again.",
          }),
        });
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [channel?.id, t]);

  const hasChanges = useMemo(
    () => serializeSettings(settings) !== serializeSettings(persistedSettings),
    [settings, persistedSettings],
  );

  const updateCapability = (
    capability: AiInstructionCapability,
    patch: Partial<
      AiInstructionSettings["capabilities"][AiInstructionCapability]
    >,
  ) => {
    setSettings((current) => {
      const normalized = normalizeAiInstructionSettings(current);
      return normalizeAiInstructionSettings({
        ...normalized,
        capabilities: {
          ...normalized.capabilities,
          [capability]: {
            ...normalized.capabilities[capability],
            ...patch,
          },
        },
      });
    });
  };

  const handleReset = () => {
    setSettings(persistedSettings);
  };

  const handleSave = async () => {
    if (!channel?.id) {
      toaster.error({
        title: t("aiInstructions.channelRequired.title", {
          defaultValue: "Channel is required",
        }),
        description: t("aiInstructions.channelRequired.description", {
          defaultValue: "Select a channel before saving AI instructions.",
        }),
      });
      return;
    }

    setIsSaving(true);
    try {
      const result = await saveAiInstructionSettingsAction({
        channelId: channel.id,
        settings,
      });
      if (!result.ok) {
        toaster.error({
          title: t("aiInstructions.saveFailed.title", {
            defaultValue: "AI instructions were not saved",
          }),
          description: t("aiInstructions.saveFailed.description", {
            defaultValue:
              "Only tenant owners and super admins can manage them.",
          }),
        });
        return;
      }

      const normalized = normalizeAiInstructionSettings(result.view.settings);
      setSettings(normalized);
      setPersistedSettings(normalized);
      setUpdatedAt(result.view.updatedAt);
      setUpdatedBy(result.view.updatedBy);
      toaster.success({
        title: t("aiInstructions.saved.title", {
          defaultValue: "AI instructions saved",
        }),
        description: t("aiInstructions.saved.description", {
          defaultValue: "The selected channel now uses these overlays.",
        }),
      });
    } catch (error) {
      console.error("Failed to save AI instruction settings:", error);
      toaster.error({
        title: t("aiInstructions.saveFailed.title", {
          defaultValue: "AI instructions were not saved",
        }),
        description: t("aiInstructions.saveFailed.description", {
          defaultValue: "Only tenant owners and super admins can manage them.",
        }),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Stack gap={6}>
      <CustomHeading
        heading={t("aiInstructions.title", {
          defaultValue: "AI Instructions",
        })}
        mb={2}
        breadcrumb
        channelsSwitch={<ChannelsSelect />}
        goBack
        t={t}
      />

      <Card.Root variant="outline" borderRadius="lg">
        <Card.Header>
          <HStack justify="space-between" gap={3} flexWrap="wrap">
            <Stack gap={1}>
              <Card.Title>
                {t("aiInstructions.overview.title", {
                  defaultValue: "Channel overlays",
                })}
              </Card.Title>
              <Card.Description>
                {t("aiInstructions.overview.description", {
                  defaultValue:
                    "These instructions guide AI behavior for the selected channel. They never replace platform prompts, permissions, prices, catalog IDs, schemas, or deterministic validation.",
                })}
              </Card.Description>
            </Stack>
            <Badge colorPalette={hasChanges ? "orange" : "success"}>
              {hasChanges
                ? t("aiInstructions.status.unsaved", {
                    defaultValue: "Unsaved changes",
                  })
                : t("aiInstructions.status.saved", {
                    defaultValue: "Saved",
                  })}
            </Badge>
          </HStack>
        </Card.Header>
        <Card.Body>
          <Stack gap={2}>
            <Text color="fg.muted" fontSize="sm">
              {updatedAt
                ? t("aiInstructions.updatedAt", {
                    date: new Date(updatedAt).toLocaleString(),
                    name: updatedBy?.name ?? updatedBy?.id ?? "",
                    defaultValue: "Last updated {{date}} by {{name}}",
                  })
                : t("aiInstructions.notUpdated", {
                    defaultValue: "No saved AI instruction overlays yet.",
                  })}
            </Text>
          </Stack>
        </Card.Body>
      </Card.Root>

      <Stack gap={4}>
        {AI_INSTRUCTION_CAPABILITIES.map((capability) => {
          const overlay = settings.capabilities[capability];
          const remaining =
            AI_INSTRUCTION_MAX_LENGTH - overlay.instructions.length;

          return (
            <Card.Root key={capability} variant="outline" borderRadius="lg">
              <Card.Header>
                <HStack justify="space-between" gap={3} align="start">
                  <Stack gap={1}>
                    <HStack gap={2}>
                      <MaterialSymbol>
                        {capabilityIcons[capability]}
                      </MaterialSymbol>
                      <Card.Title>
                        {t(`aiInstructions.capabilities.${capability}.title`, {
                          defaultValue: capability,
                        })}
                      </Card.Title>
                    </HStack>
                    <Card.Description>
                      {t(
                        `aiInstructions.capabilities.${capability}.description`,
                        {
                          defaultValue:
                            "Add channel-specific guidance for this AI capability.",
                        },
                      )}
                    </Card.Description>
                  </Stack>
                  <Switch
                    checked={overlay.enabled}
                    onCheckedChange={({ checked }) =>
                      updateCapability(capability, { enabled: checked })
                    }
                    disabled={isLoading}
                  >
                    {t("aiInstructions.enabled", {
                      defaultValue: "Enabled",
                    })}
                  </Switch>
                </HStack>
              </Card.Header>
              <Card.Body>
                <Field
                  helperText={t("aiInstructions.instructionsHelper", {
                    remaining,
                    defaultValue:
                      "{{remaining}} characters remaining. Keep these as business guidance, not security or permission rules.",
                  })}
                  label={t("aiInstructions.instructionsLabel", {
                    defaultValue: "Instructions",
                  })}
                >
                  <Textarea
                    value={overlay.instructions}
                    onChange={(event) =>
                      updateCapability(capability, {
                        instructions: event.target.value.slice(
                          0,
                          AI_INSTRUCTION_MAX_LENGTH,
                        ),
                      })
                    }
                    placeholder={t(
                      `aiInstructions.capabilities.${capability}.placeholder`,
                      {
                        defaultValue:
                          "Example: when customers use this phrase, prefer this interpretation.",
                      },
                    )}
                    minH="140px"
                    resize="vertical"
                    disabled={isLoading}
                  />
                </Field>
              </Card.Body>
            </Card.Root>
          );
        })}
      </Stack>

      <Separator />
      <HStack justify="space-between" gap={3} flexWrap="wrap">
        <Text color="fg.muted" fontSize="sm">
          {channel?.name
            ? t("aiInstructions.footer.channel", {
                name: channel.name,
                defaultValue: "Editing overlays for {{name}}",
              })
            : t("aiInstructions.footer.noChannel", {
                defaultValue: "Select a channel to edit overlays.",
              })}
        </Text>
        <HStack gap={2}>
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={!hasChanges || isSaving}
          >
            <MaterialSymbol>restart_alt</MaterialSymbol>
            {t("common.reset", { defaultValue: "Reset" })}
          </Button>
          <Button
            colorPalette="primary"
            loading={isSaving}
            onClick={handleSave}
            disabled={!channel?.id || !hasChanges}
          >
            <MaterialSymbol>save</MaterialSymbol>
            {t("common.save", { defaultValue: "Save" })}
          </Button>
        </HStack>
      </HStack>
    </Stack>
  );
}
