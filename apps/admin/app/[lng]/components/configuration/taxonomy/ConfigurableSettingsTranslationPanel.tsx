"use client";

import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import {
  loadConfigurableSettingsTranslations,
  saveConfigurableSettingsTranslation,
  type ConfigurableSettingsTranslationKind,
} from "@/lib/configuration-taxonomy-translations.client";
import {
  createManagedTranslationDescriptor,
  createManualTranslationMeta,
  getPathValue,
  isRecord,
  normalizeManagedTranslation,
  setPathValue,
  type ManagedTranslationDocument,
} from "@/lib/translations";
import { Button, Input, Stack, Text } from "@chakra-ui/react";
import { Field, MaterialSymbol, toaster } from "@konfi/components";
import { Locale } from "@konfi/types";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { TranslationPanel } from "../../translations/TranslationPanel";

interface ConfigurableSettingsTranslationPanelProps {
  channelId?: string;
  kind: ConfigurableSettingsTranslationKind;
  source: unknown;
  title?: string;
  onMutate?: () => unknown | Promise<unknown>;
}

interface ConfigurableSettingsTranslationFormProps {
  channelId: string;
  kind: ConfigurableSettingsTranslationKind;
  locale: Locale;
  source: Record<string, unknown>;
  translation?: ManagedTranslationDocument;
  onMutate?: () => unknown | Promise<unknown>;
}

function ConfigurableSettingsTranslationForm({
  channelId,
  kind,
  locale,
  source,
  translation,
  onMutate,
}: ConfigurableSettingsTranslationFormProps) {
  const { t } = useT();
  const tenantContext = useTenantContext();
  const descriptor = useMemo(
    () => createManagedTranslationDescriptor(kind, source),
    [kind, source],
  );
  const normalizedTranslation = useMemo(
    () =>
      translation
        ? normalizeManagedTranslation(descriptor, translation)
        : undefined,
    [descriptor, translation],
  );
  const fields = useMemo(
    () =>
      descriptor.fields.filter((field) => field.translatable !== false),
    [descriptor],
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const nextValues: Record<string, string> = {};
    for (const field of fields) {
      const existingValue = normalizedTranslation
        ? getPathValue(normalizedTranslation, field.targetPath)
        : undefined;
      nextValues[field.key] =
        typeof existingValue === "string" ? existingValue : "";
    }
    setValues(nextValues);
  }, [fields, normalizedTranslation]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload: ManagedTranslationDocument = {};

      for (const field of descriptor.fields) {
        if (field.translatable === false) {
          const sourceValue = getPathValue(source, field.sourcePath);
          if (sourceValue !== undefined) {
            setPathValue(payload, field.targetPath, sourceValue);
          }
          continue;
        }

        setPathValue(payload, field.targetPath, values[field.key] ?? "");
      }

      payload.translationMeta = createManualTranslationMeta({ kind, source });

      await saveConfigurableSettingsTranslation({
        channelId,
        kind,
        locale,
        tenantContext,
        translation: payload,
      });
      await onMutate?.();
      toaster.success({
        title: t("translationSaved", { defaultValue: "Tłumaczenie zapisane" }),
        description: t("translationSavedDescription", {
          defaultValue: "Tłumaczenie zostało pomyślnie zapisane.",
        }),
      });
    } catch (error) {
      console.error("Failed to save configurable settings translation:", error);
      toaster.error({
        title: t("translationError", { defaultValue: "Błąd tłumaczenia" }),
        description: t("translationErrorDescription", {
          defaultValue: "Wystąpił błąd podczas zapisywania tłumaczenia.",
        }),
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (fields.length === 0) {
    return (
      <Text color="fg.muted" fontSize="sm">
        {t("configurableSettingsTranslations.empty", {
          defaultValue: "There are no names to translate yet.",
        })}
      </Text>
    );
  }

  return (
    <Stack gap={3}>
      {fields.map((field) => (
        <Field key={field.key} label={field.label ?? field.key}>
          <Input
            autoComplete="off"
            value={values[field.key] ?? ""}
            placeholder={
              typeof getPathValue(source, field.sourcePath) === "string"
                ? (getPathValue(source, field.sourcePath) as string)
                : undefined
            }
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                [field.key]: event.target.value,
              }))
            }
          />
        </Field>
      ))}
      <Button
        alignSelf="end"
        colorPalette="primary"
        loading={isSaving}
        onClick={handleSave}
      >
        <MaterialSymbol>save</MaterialSymbol>
        {t("forms.buttons.save", { defaultValue: "Save" })}
      </Button>
    </Stack>
  );
}

export function ConfigurableSettingsTranslationPanel({
  channelId,
  kind,
  source,
  title,
  onMutate,
}: ConfigurableSettingsTranslationPanelProps) {
  const { data, mutate } = useSWR(
    channelId ? ["configurable-settings-translations", channelId, kind] : null,
    ([, currentChannelId, currentKind]) =>
      loadConfigurableSettingsTranslations(currentChannelId, currentKind),
  );
  const sourceRecord = isRecord(source) ? source : {};

  if (!channelId) {
    return null;
  }

  const refresh = async () => {
    await mutate();
    await onMutate?.();
  };

  return (
    <TranslationPanel
      kind={kind}
      source={sourceRecord}
      title={title}
      triggerWidth="auto"
      translationRef={{ kind, channelId }}
      translations={data ?? []}
      onMutate={refresh}
      renderForm={({ locale, translation }) => (
        <ConfigurableSettingsTranslationForm
          channelId={channelId}
          kind={kind}
          locale={locale}
          source={sourceRecord}
          translation={translation}
          onMutate={refresh}
        />
      )}
    />
  );
}
