"use client";

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
import { Skeleton } from "@chakra-ui/react";
import {
  getAttributeTranslations,
  getBlogCategoryTranslations,
  getBlogPostTranslations,
  getBlogTagTranslations,
  getCategoryTranslations,
  getProductTranslations,
} from "@konfi/firebase";
import type {
  Attribute,
  BlogCategory,
  BlogPost,
  BlogTag,
  Category,
  Product,
} from "@konfi/types";
import { useChannels } from "context/channels";
import { useMemo } from "react";
import useSWR from "swr";
import { ManagedTranslationStatusBadge } from "./TranslationPanel";

type ManagedTranslationStatusIndicatorProps =
  | {
      kind: "product";
      source: Product;
      channelId?: string;
    }
  | {
      kind: "category";
      source: Category;
      channelId?: string;
    }
  | {
      kind: "attribute";
      source: Attribute;
    }
  | {
      kind: "blogPost";
      source: BlogPost;
    }
  | {
      kind: "blogCategory";
      source: BlogCategory;
    }
  | {
      kind: "blogTag";
      source: BlogTag;
    };

function asManagedDocuments(
  translations: unknown[],
): ManagedTranslationDocument[] {
  return translations.filter(isRecord) as ManagedTranslationDocument[];
}

async function loadTranslations(
  props: ManagedTranslationStatusIndicatorProps,
  fallbackChannelId?: string,
): Promise<ManagedTranslationDocument[]> {
  switch (props.kind) {
    case "product": {
      const channelId =
        props.channelId ?? props.source.channelId ?? fallbackChannelId;
      if (!channelId) return [];
      return asManagedDocuments(
        await getProductTranslations(firestore, channelId, props.source.id),
      );
    }
    case "category": {
      const channelId = props.channelId ?? fallbackChannelId;
      if (!channelId) return [];
      return asManagedDocuments(
        await getCategoryTranslations(firestore, channelId, props.source.id),
      );
    }
    case "attribute":
      return asManagedDocuments(
        await getAttributeTranslations(firestore, props.source.id),
      );
    case "blogPost":
      return asManagedDocuments(
        await getBlogPostTranslations(firestore, props.source.id),
      );
    case "blogCategory":
      return asManagedDocuments(
        await getBlogCategoryTranslations(firestore, props.source.id),
      );
    case "blogTag":
      return asManagedDocuments(
        await getBlogTagTranslations(firestore, props.source.id),
      );
  }
}

export function ManagedTranslationStatusIndicator(
  props: ManagedTranslationStatusIndicatorProps,
) {
  const { channel } = useChannels();
  const fallbackChannelId = channel?.id;
  const key = [
    "managed-translation-status",
    props.kind,
    props.source.id,
    "channelId" in props ? props.channelId : undefined,
    fallbackChannelId,
  ];
  const { data: translations, isLoading } = useSWR(key, () =>
    loadTranslations(props, fallbackChannelId),
  );
  const status = useMemo(() => {
    const sourceRecord = isRecord(props.source) ? props.source : {};
    const descriptor = createManagedTranslationDescriptor(
      props.kind,
      sourceRecord,
    );
    const statuses = MANAGED_TRANSLATION_TARGET_LOCALES.map((locale) => {
      const translation = translations?.find((item) => item.locale === locale);
      return getManagedTranslationHealth({
        descriptor,
        source: sourceRecord,
        translation: translation
          ? normalizeManagedTranslation(descriptor, translation)
          : null,
      }).status;
    });

    return getManagedTranslationAggregateStatus(statuses);
  }, [props.kind, props.source, translations]);

  if (isLoading) {
    return <Skeleton h="5" w="24" />;
  }

  return <ManagedTranslationStatusBadge status={status} />;
}
