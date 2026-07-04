"use client";

import { StoreMetadataTranslationForm } from "@/components/configuration/StoreMetadataTranslationForm";
import { StorePageContentTranslationForm } from "@/components/configuration/StorePageContentTranslationForm";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import {
  createManagedTranslationDescriptor,
  getManagedTranslationAggregateStatus,
  getManagedTranslationHealth,
  isRecord,
  MANAGED_TRANSLATION_TARGET_LOCALES,
  normalizeManagedTranslation,
  type ManagedTranslationDocument,
} from "@/lib/translations";
import { Box, HStack, Skeleton, Text, VStack } from "@chakra-ui/react";
import {
  db,
  getStoreMetadataTranslation,
  getStorePageContentTranslation,
} from "@konfi/firebase";
import {
  dbMetadata,
  dbPageContent,
  StoreMetadataTranslation,
  StorePageContentTranslation,
} from "@konfi/types";
import { useChannels } from "context/channels";
import { getDocs } from "firebase/firestore";
import useSWR from "swr";
import {
  ManagedTranslationStatusBadge,
  TranslationPanel,
} from "./TranslationPanel";

type StoreTranslationsByEntity<TTranslation> = Map<string, TTranslation[]>;

async function fetchStoreMetadata(key: string) {
  const metadata = await getDocs(db.collection<dbMetadata>(firestore, key));
  return metadata.empty ? [] : metadata.docs.map((doc) => doc.data());
}

async function fetchStorePageContent(key: string) {
  const pageContent = await getDocs(
    db.collection<dbPageContent>(firestore, key),
  );
  return pageContent.empty ? [] : pageContent.docs.map((doc) => doc.data());
}

function routeLabel(route: string) {
  return route.replaceAll("_", "/");
}

function getSourceStatus(
  kind: "storeMetadata" | "storePageContent",
  source: dbMetadata | dbPageContent,
  translations: Array<StoreMetadataTranslation | StorePageContentTranslation>,
) {
  const sourceRecord = isRecord(source) ? source : {};
  const descriptor = createManagedTranslationDescriptor(kind, sourceRecord);
  const statuses = MANAGED_TRANSLATION_TARGET_LOCALES.map((locale) => {
    const translation = translations.find((item) => item.locale === locale);

    return getManagedTranslationHealth({
      descriptor,
      source: sourceRecord,
      translation: translation
        ? normalizeManagedTranslation(
            descriptor,
            translation as unknown as ManagedTranslationDocument,
          )
        : null,
    }).status;
  });

  return getManagedTranslationAggregateStatus(statuses);
}

function appendTranslation<TTranslation extends { locale?: string }>(
  byEntity: StoreTranslationsByEntity<TTranslation>,
  entityId: string,
  translation?: TTranslation,
) {
  if (!translation) {
    return;
  }

  const existing = byEntity.get(entityId) ?? [];
  byEntity.set(entityId, [...existing, translation]);
}

export function StoreMetadataTranslationPanels() {
  const { t } = useT();
  const { channel } = useChannels();
  const { data: metadata, isLoading } = useSWR(
    channel?.id ? `/channels/${channel.id}/metadata` : null,
    fetchStoreMetadata,
  );
  const { data: translationsByEntity, mutate: mutateTranslations } = useSWR(
    channel?.id && metadata
      ? [
          "/store-metadata-managed-translations",
          channel.id,
          metadata.map((item) => item.id).join("|"),
        ]
      : null,
    async () => {
      if (!channel?.id || !metadata) {
        return new Map<string, StoreMetadataTranslation[]>();
      }

      const byEntity: StoreTranslationsByEntity<StoreMetadataTranslation> =
        new Map();
      const entityIds = metadata.map((item) => item.id);
      const localeTranslations = await Promise.all(
        MANAGED_TRANSLATION_TARGET_LOCALES.map((locale) =>
          getStoreMetadataTranslation(firestore, channel.id, entityIds, locale),
        ),
      );

      for (const translations of localeTranslations) {
        for (const entityId of entityIds) {
          appendTranslation(byEntity, entityId, translations?.get(entityId));
        }
      }

      return byEntity;
    },
  );

  async function refreshTranslations() {
    await mutateTranslations();
  }

  if (isLoading) {
    return <Skeleton h="56px" w="100%" />;
  }

  if (!channel?.id || !metadata?.length) {
    return null;
  }

  return (
    <VStack align="stretch" gap={3} mb={4}>
      <Text fontWeight="medium">
        {t("translations.managed.storeMetadataHeading", {
          defaultValue: "Metadata translations",
        })}
      </Text>
      {metadata.map((item) => {
        const translations = translationsByEntity?.get(item.id) ?? [];
        const status = getSourceStatus("storeMetadata", item, translations);

        return (
          <Box
            key={item.id}
            border="1px solid"
            borderColor="border.muted"
            borderRadius="md"
            p={3}
          >
            <HStack gap={3} justify="space-between" align="center">
              <Text fontWeight="medium" flex="1">
                {routeLabel(item.id)}
              </Text>
              <ManagedTranslationStatusBadge status={status} />
              <TranslationPanel
                kind="storeMetadata"
                source={item}
                title={t("translations.managed.routeTranslations", {
                  route: routeLabel(item.id),
                  defaultValue: "Translations: {{route}}",
                })}
                triggerWidth="auto"
                translationRef={{
                  kind: "storeMetadata",
                  channelId: channel.id,
                  entityId: item.id,
                }}
                translations={translations}
                onMutate={refreshTranslations}
                renderForm={({ locale, type }) => (
                  <StoreMetadataTranslationForm
                    key={locale}
                    locale={locale}
                    type={type}
                    metadataId={item.id}
                    sourceMetadata={item}
                    onSaved={refreshTranslations}
                  />
                )}
              />
            </HStack>
          </Box>
        );
      })}
    </VStack>
  );
}

export function StorePageContentTranslationPanels() {
  const { t } = useT();
  const { channel } = useChannels();
  const { data: pageContent, isLoading } = useSWR(
    channel?.id ? `/channels/${channel.id}/pages` : null,
    fetchStorePageContent,
  );
  const { data: translationsByEntity, mutate: mutateTranslations } = useSWR(
    channel?.id && pageContent
      ? [
          "/store-page-content-managed-translations",
          channel.id,
          pageContent.map((item) => item.id).join("|"),
        ]
      : null,
    async () => {
      if (!channel?.id || !pageContent) {
        return new Map<string, StorePageContentTranslation[]>();
      }

      const byEntity: StoreTranslationsByEntity<StorePageContentTranslation> =
        new Map();
      const entityIds = pageContent.map((item) => item.id);
      const localeTranslations = await Promise.all(
        MANAGED_TRANSLATION_TARGET_LOCALES.map((locale) =>
          getStorePageContentTranslation(
            firestore,
            channel.id,
            entityIds,
            locale,
          ),
        ),
      );

      for (const translations of localeTranslations) {
        for (const entityId of entityIds) {
          appendTranslation(byEntity, entityId, translations?.get(entityId));
        }
      }

      return byEntity;
    },
  );

  async function refreshTranslations() {
    await mutateTranslations();
  }

  if (isLoading) {
    return <Skeleton h="56px" w="100%" />;
  }

  if (!channel?.id || !pageContent?.length) {
    return null;
  }

  return (
    <VStack align="stretch" gap={3} mb={4}>
      <Text fontWeight="medium">
        {t("translations.managed.storePageContentHeading", {
          defaultValue: "Page content translations",
        })}
      </Text>
      {pageContent.map((item) => {
        const translations = translationsByEntity?.get(item.id) ?? [];
        const status = getSourceStatus("storePageContent", item, translations);

        return (
          <Box
            key={item.id}
            border="1px solid"
            borderColor="border.muted"
            borderRadius="md"
            p={3}
          >
            <HStack gap={3} justify="space-between" align="center">
              <Text fontWeight="medium" flex="1">
                {routeLabel(item.id)}
              </Text>
              <ManagedTranslationStatusBadge status={status} />
              <TranslationPanel
                kind="storePageContent"
                source={item}
                title={t("translations.managed.routeTranslations", {
                  route: routeLabel(item.id),
                  defaultValue: "Translations: {{route}}",
                })}
                triggerWidth="auto"
                translationRef={{
                  kind: "storePageContent",
                  channelId: channel.id,
                  entityId: item.id,
                }}
                translations={translations}
                onMutate={refreshTranslations}
                renderForm={({ locale, type }) => (
                  <StorePageContentTranslationForm
                    key={locale}
                    locale={locale}
                    type={type}
                    pageId={item.id}
                    sourcePageContent={item}
                    onSaved={refreshTranslations}
                  />
                )}
              />
            </HStack>
          </Box>
        );
      })}
    </VStack>
  );
}
