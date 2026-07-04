"use client";

import { firestore } from "@/lib/firebase/clientApp";
import { useT } from "@/i18n/client";
import { Box, Skeleton } from "@chakra-ui/react";
import {
  getCategoryTranslations,
  getProductTranslations,
} from "@konfi/firebase";
import type {
  Category,
  CategoryTranslation,
  Product,
  ProductTranslation,
} from "@konfi/types";
import { useChannels } from "context/channels";
import useSWR from "swr";
import { TranslationPanel } from "../translations/TranslationPanel";
import { CategoryTranslationForm } from "./CategoryTranslationForm";
import { ProductTranslationForm } from "./ProductTranslationForm";

type CatalogTranslationManagerProps =
  | {
      kind: "product";
      source: Product;
    }
  | {
      kind: "category";
      source: Category;
    };

export function CatalogTranslationManager(
  props: CatalogTranslationManagerProps,
) {
  const { t } = useT();
  const { channel } = useChannels();
  const channelId =
    props.kind === "product"
      ? (props.source.channelId ?? channel?.id)
      : channel?.id;
  const swrKey = channelId
    ? ["catalog-translations", props.kind, channelId, props.source.id]
    : null;
  const { data: translations, mutate: mutateTranslations } = useSWR(
    swrKey,
    () => {
      if (!channelId) return [];

      return props.kind === "product"
        ? getProductTranslations(firestore, channelId, props.source.id)
        : getCategoryTranslations(firestore, channelId, props.source.id);
    },
  );

  if (!channelId || !translations) {
    return <Skeleton h="8" w="36" />;
  }

  return (
    <Box
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {props.kind === "product" ? (
        <TranslationPanel<ProductTranslation>
          kind="product"
          source={props.source}
          title={t("translations.managed.manageButton", {
            defaultValue: "Manage",
          })}
          triggerWidth="auto"
          translationRef={{
            kind: "product",
            channelId,
            entityId: props.source.id,
          }}
          translations={translations as ProductTranslation[]}
          onMutate={mutateTranslations}
          renderForm={({ locale, translation, type }) => (
            <ProductTranslationForm
              key={locale}
              channelId={channelId}
              product={props.source}
              locale={locale}
              type={type}
              translation={translation}
              mutateTranslations={mutateTranslations}
            />
          )}
        />
      ) : (
        <TranslationPanel<CategoryTranslation>
          kind="category"
          source={props.source}
          title={t("translations.managed.manageButton", {
            defaultValue: "Manage",
          })}
          triggerWidth="auto"
          translationRef={{
            kind: "category",
            channelId,
            entityId: props.source.id,
          }}
          translations={translations as CategoryTranslation[]}
          onMutate={mutateTranslations}
          renderForm={({ locale, translation, type }) => (
            <CategoryTranslationForm
              key={locale}
              channelId={channelId}
              category={props.source}
              locale={locale}
              type={type}
              translation={translation}
              mutateTranslations={mutateTranslations}
            />
          )}
        />
      )}
    </Box>
  );
}
