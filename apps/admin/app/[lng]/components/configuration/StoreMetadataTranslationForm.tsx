import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { createManualTranslationMeta } from "@/lib/translations";
import { Skeleton } from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import { FormController, toaster } from "@konfi/components";
import {
  createStoreMetadataTranslation,
  db,
  getStoreMetadataTranslation,
  updateStoreMetadataTranslation,
} from "@konfi/firebase";
import {
  dbMetadata,
  FormTypes,
  Locale,
  StoreMetadataTranslation,
  StoreMetadataTranslationCreate,
  StoreMetadataTranslationUpdate,
  StoreMetadataTranslationUpdateForm,
  TenantContext,
} from "@konfi/types";
import {
  getIconByFormType,
  MetadataRecord,
  storeMetadataTranslationForm,
  StoreMetadataTranslationSchema,
  T_STORE_ROUTES,
} from "@konfi/utils";
import { useChannels } from "context/channels";
import { isEqual, isNull } from "es-toolkit";
import { getDocs, Timestamp } from "firebase/firestore";
import type { TFunction } from "i18next";
import { useEffect, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import useSWR, { KeyedMutator } from "swr";
import useSWRImmutable from "swr/immutable";
import { InferType } from "yup";
import Generate from "../form/field-controllers/Generate";

type Input = InferType<typeof StoreMetadataTranslationSchema>;

async function fetchStoreMetadata(key: string) {
  db.collection(firestore, key);
  const metadata = await getDocs(db.collection<dbMetadata>(firestore, key));
  if (metadata.empty) {
    return null;
  } else {
    return metadata.docs.map((doc) => doc.data());
  }
}

export const StoreMetadataTranslationForm = ({
  locale,
  type,
  metadataId,
  sourceMetadata,
  onSaved,
}: {
  locale: Locale;
  type: keyof typeof FormTypes;
  metadataId?: string;
  sourceMetadata?: dbMetadata;
  onSaved?: () => unknown | Promise<unknown>;
}) => {
  const { t, i18n } = useT();
  const tenantContext = useTenantContext();
  const { channel } = useChannels();
  const label =
    `${t(`FormTypes.${type}`)} ` +
    t("translations.managed.forms.storeMetadata", {
      defaultValue: "Metadata translation",
    });
  const SchemaYupResolver = yupResolver(StoreMetadataTranslationSchema);
  const { data: fetchedMetadata, isLoading } = useSWRImmutable(
    channel && !sourceMetadata ? `/channels/${channel.id}/metadata` : null,
    fetchStoreMetadata,
  );

  const metadata = useMemo(
    () => (sourceMetadata ? [sourceMetadata] : fetchedMetadata),
    [fetchedMetadata, sourceMetadata],
  );

  const routeIds = useMemo(() => {
    if (metadataId) {
      return [metadataId];
    }

    return metadata?.map((item) => item.id) ?? T_STORE_ROUTES;
  }, [metadata, metadataId]);

  const { data: translation, mutate: mutateTranslation } = useSWR(
    channel && metadata
      ? ["/store-metadata-translations", channel.id, locale, routeIds.join("|")]
      : null,
    () =>
      channel &&
      metadata &&
      getStoreMetadataTranslation(firestore, channel.id, routeIds, locale),
  );

  const formattedStoreMetadataTranslation = useMemo(() => {
    if (!metadata) return null;

    return metadata.reduce(
      (acc, item) => {
        const existingTranslation = translation?.get(item.id);
        acc[item.id] = {
          locale: locale as Locale,
          title: existingTranslation?.title || item.title || "",
          description:
            existingTranslation?.description || item.description || "",
          keywords: existingTranslation?.keywords || item.keywords || "",
          ogTitle: existingTranslation?.ogTitle || item.ogTitle || "",
          ogDescription:
            existingTranslation?.ogDescription || item.ogDescription || "",
          ogImage: existingTranslation?.ogImage || item.ogImage || "",
          active: existingTranslation?.active ?? true,
        };
        return acc;
      },
      {} as Record<string, StoreMetadataTranslationUpdateForm>,
    );
  }, [metadata, translation, locale]);

  const UpdateForm = useForm({
    defaultValues: formattedStoreMetadataTranslation
      ? initialValues(locale, formattedStoreMetadataTranslation, routeIds)
      : {},
    resolver: SchemaYupResolver,
    disabled: isLoading,
  });

  // Refs to ensure we only initialize form values when switching locale/channel
  const prevLocaleRef = useRef<Locale | undefined>(undefined);
  const prevChannelIdRef = useRef<string | undefined>(undefined);
  const prevRouteKeyRef = useRef<string | undefined>(undefined);
  const initializedRef = useRef(false);
  const routeKey = routeIds.join("|");

  useEffect(() => {
    const localeChanged = prevLocaleRef.current !== locale;
    const channelChanged = prevChannelIdRef.current !== channel?.id;
    const routesChanged = prevRouteKeyRef.current !== routeKey;

    // Reset guard when core dependencies change
    if (localeChanged || channelChanged || routesChanged) {
      initializedRef.current = false;
    }

    if (formattedStoreMetadataTranslation && !initializedRef.current) {
      UpdateForm.reset(
        initialValues(locale, formattedStoreMetadataTranslation, routeIds),
      );
      initializedRef.current = true;
    }

    prevLocaleRef.current = locale;
    prevChannelIdRef.current = channel?.id;
    prevRouteKeyRef.current = routeKey;
  }, [
    UpdateForm,
    formattedStoreMetadataTranslation,
    locale,
    channel?.id,
    routeIds,
    routeKey,
  ]);

  if (isNull(channel)) return null;

  if (isLoading) return <Skeleton w={"100%"} h={"100%"} />;

  return (
    <FormController
      methods={UpdateForm}
      buttonLeftIcon={getIconByFormType(type)}
      buttonLabel={label}
      formData={storeMetadataTranslationForm(t, routeIds)}
      update={true}
      handleSubmit={async (data: Input) => {
        await handleUpdateStoreMetadataTranslation(
          data,
          formattedStoreMetadataTranslation,
          channel.id,
          translation,
          mutateTranslation,
          tenantContext,
          metadata,
          t,
          onSaved,
        );
      }}
      t={t}
      i18n={i18n}
      Generate={Generate}
    />
  );
};

const initialValues = (
  locale?: string,
  metadata?: MetadataRecord | null,
  routeIds: string[] = T_STORE_ROUTES,
): Input => {
  if (!locale || !metadata) {
    return {} as Input;
  }

  const values: Record<string, StoreMetadataTranslationUpdateForm> = {};

  routeIds.forEach((route: string) => {
    const metadataValue = metadata?.[route] as
      | StoreMetadataTranslationUpdateForm
      | undefined;
    values[route] = {
      locale: locale as Locale,
      title: metadataValue?.title || "",
      description: metadataValue?.description || "",
      keywords: metadataValue?.keywords || "",
      ogTitle: metadataValue?.ogTitle || "",
      ogDescription: metadataValue?.ogDescription || "",
      ogImage: metadataValue?.ogImage || "",
      active: metadataValue?.active ?? true,
    };
  });

  return values as Input;
};

async function handleUpdateStoreMetadataTranslation(
  data: Input,
  metadata: MetadataRecord | null | undefined,
  channelId: string,
  existingTranslations:
    | Map<string, StoreMetadataTranslation>
    | null
    | undefined,
  mutate: KeyedMutator<
    Map<string, StoreMetadataTranslation> | null | undefined
  >,
  tenantContext: TenantContext,
  sourceMetadata: dbMetadata[] | null | undefined,
  t: TFunction,
  onSaved?: () => unknown | Promise<unknown>,
) {
  for (const key in data) {
    const metadataValue = metadata?.[key as keyof MetadataRecord] as
      | StoreMetadataTranslationUpdateForm
      | undefined;
    const translationData = data[
      key as keyof Input
    ] as StoreMetadataTranslationUpdateForm;

    if (!metadataValue) {
      // Skip if no metadata exists - we need metadata to create translations for
      console.warn(`No metadata found for key: ${key}`);
      continue;
    }

    try {
      const source = sourceMetadata?.find((item) => item.id === key) ?? {
        id: key,
        ...translationData,
      };
      const translationDataWithMeta = {
        ...translationData,
        translationMeta: createManualTranslationMeta({
          kind: "storeMetadata",
          source,
        }),
      };

      // Check if translation already exists
      const existingTranslation = existingTranslations?.get(key);
      if (!existingTranslation) {
        // Create new translation
        const translationCreate: StoreMetadataTranslationCreate = {
          ...translationDataWithMeta,
          id: translationData.locale,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        };

        await createStoreMetadataTranslation(
          firestore,
          channelId,
          key,
          translationCreate,
          tenantContext,
        );

        toaster.success({
          title: t("translations.managed.toasts.created", {
            defaultValue: "Translation created",
          }),
          description: t("translations.managed.toasts.storeMetadataCreated", {
            route: key,
            defaultValue: "Metadata translation for {{route}} was created.",
          }),
        });
      } else {
        // Update existing translation
        const translationUpdate: StoreMetadataTranslationUpdate = {
          ...translationDataWithMeta,
          updatedAt: Timestamp.now(),
        }; // Check if content has actually changed
        if (
          isEqual(translationUpdate.title, existingTranslation.title) &&
          isEqual(
            translationUpdate.description,
            existingTranslation.description,
          ) &&
          isEqual(translationUpdate.keywords, existingTranslation.keywords) &&
          isEqual(translationUpdate.ogTitle, existingTranslation.ogTitle) &&
          isEqual(
            translationUpdate.ogDescription,
            existingTranslation.ogDescription,
          ) &&
          isEqual(translationUpdate.ogImage, existingTranslation.ogImage) &&
          translationUpdate.active === existingTranslation.active &&
          isEqual(
            translationUpdate.translationMeta,
            existingTranslation.translationMeta,
          )
        ) {
          continue;
        }

        await updateStoreMetadataTranslation(
          firestore,
          channelId,
          key,
          translationData.locale,
          translationUpdate,
          tenantContext,
        );

        toaster.success({
          title: t("translations.managed.toasts.updated", {
            defaultValue: "Translation updated",
          }),
          description: t("translations.managed.toasts.storeMetadataUpdated", {
            route: key,
            defaultValue: "Metadata translation for {{route}} was updated.",
          }),
        });
      }
    } catch (error) {
      console.error(`Error processing metadata translation for ${key}:`, error);
      toaster.error({
        title: t("translations.managed.toasts.processingError", {
          defaultValue: "Translation could not be processed",
        }),
        description: t(
          "translations.managed.toasts.storeMetadataProcessingError",
          {
            route: key,
            defaultValue:
              "Metadata translation for {{route}} was not processed.",
          },
        ),
      });
    }
  }

  await mutate();
  await onSaved?.();
  return true;
}
