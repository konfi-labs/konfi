"use client";

import { useT } from "@/i18n/client";
import {
  createManagedTranslationDescriptor,
  getManagedTranslationAggregateStatus,
  getManagedTranslationHealth,
  getPathValue,
  isRecord,
  MANAGED_TRANSLATION_TARGET_LOCALES,
  normalizeManagedTranslation,
  type ManagedTranslationDisplayStatus,
  type ManagedTranslationDocument,
  type ManagedTranslationKind,
  type ManagedTranslationMeta,
} from "@/lib/translations";
import {
  Accordion,
  Badge,
  Box,
  Button,
  Dialog,
  HStack,
  Portal,
  Span,
  Text,
  VStack,
} from "@chakra-ui/react";
import { CloseButton, MaterialSymbol, toaster } from "@konfi/components";
import { DEFAULT_LOCALE, Locale } from "@konfi/types";
import { ReactNode, useMemo, useState } from "react";

export type TranslationPanelFormType = "CREATE" | "UPDATE";
export type TranslationPanelGenerationMode = "missing" | "stale";

export interface TranslationPanelTranslation {
  active?: boolean;
  locale?: Locale;
  translationMeta?: ManagedTranslationMeta;
}

export interface TranslationPanelViewProps<
  TTranslation extends TranslationPanelTranslation,
> {
  kind: ManagedTranslationKind;
  source: unknown;
  translations?: TTranslation[];
  title?: string;
  triggerWidth?: string | number;
  defaultOpen?: boolean;
  onMutate?: () => unknown | Promise<unknown>;
  onGenerateTranslation: (params: {
    locale: Locale;
    mode: TranslationPanelGenerationMode;
  }) => Promise<unknown>;
  onMarkReviewed: (params: { locale: Locale }) => Promise<unknown>;
  renderForm: (params: {
    locale: Locale;
    translation?: TTranslation;
    type: TranslationPanelFormType;
  }) => ReactNode;
}

function statusColorPalette(status: ManagedTranslationDisplayStatus) {
  switch (status) {
    case "missing":
      return "gray";
    case "incomplete":
      return "orange";
    case "stale":
      return "yellow";
    case "aiDraft":
      return "purple";
    case "reviewed":
      return "success";
    case "complete":
      return "blue";
  }
}

function getStatusLabelKey(status: ManagedTranslationDisplayStatus) {
  return `translations.managed.status.${status}`;
}

export function ManagedTranslationStatusBadge({
  status,
  variant = "subtle",
}: {
  status: ManagedTranslationDisplayStatus;
  variant?: "solid" | "subtle" | "outline";
}) {
  const { t } = useT();

  return (
    <Badge colorPalette={statusColorPalette(status)} variant={variant}>
      {t(getStatusLabelKey(status), {
        defaultValue: status,
      })}
    </Badge>
  );
}

export function TranslationPanelView<
  TTranslation extends TranslationPanelTranslation,
>({
  kind,
  source,
  translations = [],
  title,
  triggerWidth = "100%",
  defaultOpen,
  onMutate,
  onGenerateTranslation,
  onMarkReviewed,
  renderForm,
}: TranslationPanelViewProps<TTranslation>) {
  const { t } = useT();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const sourceRecord = isRecord(source) ? source : {};
  const descriptor = useMemo(
    () => createManagedTranslationDescriptor(kind, sourceRecord),
    [kind, sourceRecord],
  );
  const locales = [...MANAGED_TRANSLATION_TARGET_LOCALES];
  const translationByLocale = new Map(
    translations.map((translation) => [translation.locale, translation]),
  );
  const healthByLocale = new Map(
    locales.map((locale) => {
      const translation = translationByLocale.get(locale);
      return [
        locale,
        getManagedTranslationHealth({
          descriptor,
          source: sourceRecord,
          translation: translation
            ? normalizeManagedTranslation(
                descriptor,
                translation as unknown as ManagedTranslationDocument,
              )
            : null,
        }),
      ];
    }),
  );
  const issueCount = [...healthByLocale.values()].filter(
    (health) => health.status !== "complete" && health.status !== "reviewed",
  ).length;
  const panelStatus = getManagedTranslationAggregateStatus(
    [...healthByLocale.values()].map((health) => health.status),
  );
  const panelTitle =
    title ??
    t("forms.buttons.translations", {
      defaultValue: "Translations",
    });

  async function runAction(actionKey: string, action: () => Promise<unknown>) {
    try {
      setPendingAction(actionKey);
      await action();
      await onMutate?.();
      toaster.success({
        title: t("translations.managed.toasts.saved", {
          defaultValue: "Translations updated",
        }),
      });
    } catch (error) {
      console.error("[TranslationPanel] Action failed", error);
      toaster.error({
        title: t("translations.managed.toasts.error", {
          defaultValue: "Translation action failed",
        }),
      });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <Dialog.Root size={"xl"} defaultOpen={defaultOpen}>
      <Dialog.Trigger asChild>
        <Button w={triggerWidth} colorPalette={"primary"}>
          <MaterialSymbol>translate</MaterialSymbol>
          {panelTitle}
          <ManagedTranslationStatusBadge status={panelStatus} />
          {issueCount > 0 && (
            <Badge colorPalette="orange" variant="solid">
              {issueCount}
            </Badge>
          )}
        </Button>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>{panelTitle}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <VStack gap={4} align="stretch">
                <Box
                  border="1px solid"
                  borderColor="border.muted"
                  borderRadius="md"
                  p={4}
                  maxH="240px"
                  overflowY="auto"
                >
                  <Text fontWeight="medium" mb={3}>
                    {t("translations.managed.sourceLocale", {
                      defaultValue: "Source content",
                    })}{" "}
                    ({DEFAULT_LOCALE.toUpperCase()})
                  </Text>
                  <VStack gap={2} align="stretch">
                    {descriptor.fields
                      .filter((field) => field.translatable !== false)
                      .map((field) => {
                        const value = getPathValue(
                          sourceRecord,
                          field.sourcePath,
                        );
                        if (typeof value !== "string" || !value.trim()) {
                          return null;
                        }

                        return (
                          <Box key={field.key}>
                            <Text
                              color="fg.muted"
                              fontSize="xs"
                              fontWeight="medium"
                            >
                              {field.label ?? field.key}
                            </Text>
                            <Text whiteSpace="pre-wrap">{value}</Text>
                          </Box>
                        );
                      })}
                  </VStack>
                </Box>

                <Accordion.Root size={"lg"} collapsible>
                  {locales.map((locale) => {
                    const translation = translationByLocale.get(locale);
                    const health = healthByLocale.get(locale);
                    const status = health?.status ?? "missing";
                    const actionPrefix = `${locale}-${status}`;

                    return (
                      <Accordion.Item key={locale} value={locale}>
                        <Accordion.ItemTrigger>
                          <HStack flex="1" justify="space-between" gap={3}>
                            <Span>{locale.toLocaleUpperCase()}</Span>
                            <HStack gap={2}>
                              <ManagedTranslationStatusBadge status={status} />
                              {!!health?.missingFieldKeys.length && (
                                <Badge colorPalette="orange" variant="outline">
                                  {t("translations.managed.missingCount", {
                                    count: health.missingFieldKeys.length,
                                    defaultValue: "{{count}} missing",
                                  })}
                                </Badge>
                              )}
                              {!!health?.staleFieldCount && (
                                <Badge colorPalette="yellow" variant="outline">
                                  {t("translations.managed.staleCount", {
                                    count: health.staleFieldCount,
                                    defaultValue: "{{count}} stale",
                                  })}
                                </Badge>
                              )}
                            </HStack>
                          </HStack>
                          <Accordion.ItemIndicator />
                        </Accordion.ItemTrigger>
                        <Accordion.ItemContent>
                          <Accordion.ItemBody>
                            <VStack gap={4} align="stretch">
                              <HStack gap={2} wrap="wrap">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    runAction(`${actionPrefix}-missing`, () =>
                                      onGenerateTranslation({
                                        locale,
                                        mode: "missing",
                                      }),
                                    )
                                  }
                                  disabled={pendingAction !== null}
                                >
                                  <MaterialSymbol>auto_fix_high</MaterialSymbol>
                                  {t(
                                    "translations.managed.actions.generateMissing",
                                    {
                                      defaultValue: "Generate missing",
                                    },
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    runAction(`${actionPrefix}-stale`, () =>
                                      onGenerateTranslation({
                                        locale,
                                        mode: "stale",
                                      }),
                                    )
                                  }
                                  disabled={pendingAction !== null}
                                >
                                  <MaterialSymbol>sync</MaterialSymbol>
                                  {t(
                                    "translations.managed.actions.regenerateStale",
                                    {
                                      defaultValue: "Regenerate stale",
                                    },
                                  )}
                                </Button>
                                {translation && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      runAction(`${actionPrefix}-review`, () =>
                                        onMarkReviewed({ locale }),
                                      )
                                    }
                                    disabled={pendingAction !== null}
                                  >
                                    <MaterialSymbol>
                                      check_circle
                                    </MaterialSymbol>
                                    {t(
                                      "translations.managed.actions.markReviewed",
                                      {
                                        defaultValue: "Mark reviewed",
                                      },
                                    )}
                                  </Button>
                                )}
                              </HStack>
                              {renderForm({
                                locale,
                                translation,
                                type: translation ? "UPDATE" : "CREATE",
                              })}
                            </VStack>
                          </Accordion.ItemBody>
                        </Accordion.ItemContent>
                      </Accordion.Item>
                    );
                  })}
                </Accordion.Root>
              </VStack>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </Dialog.CloseTrigger>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
