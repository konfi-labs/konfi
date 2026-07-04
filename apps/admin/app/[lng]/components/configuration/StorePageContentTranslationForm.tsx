import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { createManualTranslationMeta } from "@/lib/translations";
import { Skeleton } from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import { FormController, toaster } from "@konfi/components";
import {
  createStorePageContentTranslation,
  db,
  getStorePageContentTranslation,
  updateStorePageContentTranslation,
} from "@konfi/firebase";
import {
  dbPageContent,
  FormTypes,
  Locale,
  StorePageContentTranslation,
  StorePageContentTranslationCreate,
  StorePageContentTranslationUpdate,
  StorePageContentTranslationUpdateForm,
  TenantContext,
} from "@konfi/types";
import {
  getIconByFormType,
  PageContentRecord,
  storePageContentTranslationForm,
  StorePageContentTranslationSchema,
  T_STORE_MDX_ROUTES,
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

type Input = InferType<typeof StorePageContentTranslationSchema>;

async function fetchStorePageContent(key: string) {
  db.collection(firestore, key);
  const pageContent = await getDocs(
    db.collection<dbPageContent>(firestore, key),
  );
  if (pageContent.empty) {
    return null;
  } else {
    return pageContent.docs.map((doc) => doc.data());
  }
}

export const StorePageContentTranslationForm = ({
  locale,
  type,
  pageId,
  sourcePageContent,
  onSaved,
}: {
  locale: Locale;
  type: keyof typeof FormTypes;
  pageId?: string;
  sourcePageContent?: dbPageContent;
  onSaved?: () => unknown | Promise<unknown>;
}) => {
  const { t, i18n } = useT();
  const tenantContext = useTenantContext();
  const { channel } = useChannels();
  const label =
    `${t(`FormTypes.${type}`)} ` +
    t("translations.managed.forms.storePageContent", {
      defaultValue: "Page content translation",
    });
  const SchemaYupResolver = yupResolver(StorePageContentTranslationSchema);
  const { data: fetchedPageContent, isLoading } = useSWRImmutable(
    channel && !sourcePageContent ? `/channels/${channel.id}/pages` : null,
    fetchStorePageContent,
  );

  const pageContent = useMemo(
    () => (sourcePageContent ? [sourcePageContent] : fetchedPageContent),
    [fetchedPageContent, sourcePageContent],
  );

  const routeIds = useMemo(() => {
    if (pageId) {
      return [pageId];
    }

    return pageContent?.map((item) => item.id) ?? T_STORE_MDX_ROUTES;
  }, [pageContent, pageId]);

  const { data: translation, mutate: mutateTranslation } = useSWR(
    channel && pageContent
      ? [
          "/store-page-content-translations",
          channel.id,
          locale,
          routeIds.join("|"),
        ]
      : null,
    () =>
      channel &&
      pageContent &&
      getStorePageContentTranslation(firestore, channel.id, routeIds, locale),
  );

  const formattedStorePageContentTranslation = useMemo(() => {
    if (!pageContent) return null;

    return pageContent.reduce(
      (acc, item) => {
        const existingTranslation = translation?.get(item.id);
        acc[item.id] = {
          locale: locale as Locale,
          content: existingTranslation?.content ||
            item.content || [{ value: "" }],
          active: existingTranslation?.active ?? true,
        };
        return acc;
      },
      {} as Record<string, StorePageContentTranslationUpdateForm>,
    );
  }, [pageContent, translation, locale]);

  const UpdateForm = useForm({
    defaultValues: formattedStorePageContentTranslation
      ? initialValues(locale, formattedStorePageContentTranslation, routeIds)
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

    if (formattedStorePageContentTranslation && !initializedRef.current) {
      UpdateForm.reset(
        initialValues(locale, formattedStorePageContentTranslation, routeIds),
      );
      initializedRef.current = true;
    }

    prevLocaleRef.current = locale;
    prevChannelIdRef.current = channel?.id;
    prevRouteKeyRef.current = routeKey;
  }, [
    UpdateForm,
    formattedStorePageContentTranslation,
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
      formData={storePageContentTranslationForm(t, routeIds)}
      update={true}
      handleSubmit={async (data: Input) => {
        await handleUpdateStorePageContentTranslation(
          data,
          formattedStorePageContentTranslation,
          channel.id,
          translation,
          mutateTranslation,
          tenantContext,
          pageContent,
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
  pageContent?: PageContentRecord | null,
  routeIds: string[] = T_STORE_MDX_ROUTES,
): Input => {
  if (!locale || !pageContent) {
    return {} as Input;
  }

  const values: Record<string, StorePageContentTranslationUpdateForm> = {};

  routeIds.forEach((route: string) => {
    const pageContentValue = pageContent?.[route] as
      | StorePageContentTranslationUpdateForm
      | undefined;
    values[route] = {
      locale: locale as Locale,
      content: pageContentValue?.content || [{ value: "" }],
      active: pageContentValue?.active ?? true,
    };
  });

  return values as Input;
};

async function handleUpdateStorePageContentTranslation(
  data: Input,
  pageContent: PageContentRecord | null | undefined,
  channelId: string,
  existingTranslations:
    | Map<string, StorePageContentTranslation>
    | null
    | undefined,
  mutate: KeyedMutator<
    Map<string, StorePageContentTranslation> | null | undefined
  >,
  tenantContext: TenantContext,
  sourcePageContent: dbPageContent[] | null | undefined,
  t: TFunction,
  onSaved?: () => unknown | Promise<unknown>,
) {
  for (const key in data) {
    const pageContentValue = pageContent?.[key as keyof PageContentRecord] as
      | StorePageContentTranslationUpdateForm
      | undefined;
    const translationData = data[
      key as keyof Input
    ] as StorePageContentTranslationUpdateForm;

    if (!pageContentValue) {
      // Skip if no page content exists - we need a page to create translations for
      console.warn(`No page content found for key: ${key}`);
      continue;
    }

    try {
      const source = sourcePageContent?.find((item) => item.id === key) ?? {
        id: key,
        ...translationData,
      };
      const translationDataWithMeta = {
        ...translationData,
        translationMeta: createManualTranslationMeta({
          kind: "storePageContent",
          source,
        }),
      };

      // Check if translation already exists
      const existingTranslation = existingTranslations?.get(key);
      if (!existingTranslation) {
        // Create new translation
        const translationCreate: StorePageContentTranslationCreate = {
          ...translationDataWithMeta,
          id: translationData.locale,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        };

        await createStorePageContentTranslation(
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
          description: t(
            "translations.managed.toasts.storePageContentCreated",
            {
              route: key,
              defaultValue:
                "Page content translation for {{route}} was created.",
            },
          ),
        });
      } else {
        // Update existing translation
        const translationUpdate: StorePageContentTranslationUpdate = {
          ...translationDataWithMeta,
          updatedAt: Timestamp.now(),
        };

        // Check if content has actually changed
        if (
          isEqual(translationUpdate.content, existingTranslation.content) &&
          translationUpdate.active === existingTranslation.active &&
          isEqual(
            translationUpdate.translationMeta,
            existingTranslation.translationMeta,
          )
        ) {
          continue;
        }

        await updateStorePageContentTranslation(
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
          description: t(
            "translations.managed.toasts.storePageContentUpdated",
            {
              route: key,
              defaultValue:
                "Page content translation for {{route}} was updated.",
            },
          ),
        });
      }
    } catch (error) {
      console.error(`Error processing translation for ${key}:`, error);
      toaster.error({
        title: t("translations.managed.toasts.processingError", {
          defaultValue: "Translation could not be processed",
        }),
        description: t(
          "translations.managed.toasts.storePageContentProcessingError",
          {
            route: key,
            defaultValue:
              "Page content translation for {{route}} was not processed.",
          },
        ),
      });
    }
  }

  await mutate();
  await onSaved?.();
  return true;
}
