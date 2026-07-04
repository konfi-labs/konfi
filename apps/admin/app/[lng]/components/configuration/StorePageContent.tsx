import { revalidateTagCache } from "@/actions";
import { ensureEntityTranslationsAction } from "@/actions/managed-translations";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { Skeleton } from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import { FormController, toaster } from "@konfi/components";
import { create, db, update } from "@konfi/firebase";
import {
  dbPageContent,
  dbPageContentCreate,
  dbPageContentUpdate,
  FormTypes,
  TenantContext,
} from "@konfi/types";
import {
  getIconByFormType,
  PageContentRecord,
  storePageContentForm,
  StorePageContentSchema,
  T_STORE_MDX_ROUTES,
} from "@konfi/utils";
import { useChannels } from "context/channels";
import { isEqual, isNull, omit } from "es-toolkit";
import { getDocs } from "firebase/firestore";
import type { TFunction } from "i18next";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import useSWR, { KeyedMutator } from "swr";
import { InferType } from "yup";

type Input = InferType<typeof StorePageContentSchema>;

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

export const StorePageContentForm = ({
  type,
}: {
  type: keyof typeof FormTypes;
}) => {
  const { t, i18n } = useT();
  const { channel } = useChannels();
  const tenantContext = useTenantContext();
  const label = `${t(`FormTypes.${type}`)} Kontent`;
  const SchemaYupResolver = yupResolver(StorePageContentSchema);
  const {
    data: pageContent,
    isLoading,
    mutate,
  } = useSWR(
    channel ? `/channels/${channel.id}/pages` : null,
    fetchStorePageContent,
  );

  const formattedStorePageContent = useMemo(
    () =>
      pageContent?.reduce((acc, item) => {
        acc[item.id] = item;
        return acc;
      }, {} as PageContentRecord),
    [pageContent],
  );

  const UpdateForm = useForm({
    defaultValues:
      formattedStorePageContent && initialValues(formattedStorePageContent),
    resolver: SchemaYupResolver,
    disabled: type === "UPDATE" || isLoading ? false : true,
  });

  useEffect(() => {
    if (formattedStorePageContent) {
      UpdateForm.reset(initialValues(formattedStorePageContent));
    }
  }, [UpdateForm, formattedStorePageContent]);

  if (isNull(channel)) return null;

  if (isLoading) return <Skeleton w={"100%"} h={"100%"} />;

  return (
    <FormController
      methods={type === "UPDATE" ? UpdateForm : undefined}
      buttonLeftIcon={getIconByFormType(type)}
      buttonLabel={label}
      formData={storePageContentForm(t)}
      update={type === "UPDATE"}
      handleSubmit={async (data: Input) => {
        await handleUpdateStorePageContent(
          data,
          formattedStorePageContent,
          channel.id,
          mutate,
          tenantContext,
          t,
        );
      }}
      t={t}
      i18n={i18n}
    />
  );
};

const initialValues = (pageContent?: PageContentRecord | null): Input => {
  const values: Record<string, dbPageContentUpdate> = {};

  T_STORE_MDX_ROUTES.forEach((route: string) => {
    const pageContentValue = pageContent?.[route] as
      | dbPageContentUpdate
      | undefined;
    values[route] = {
      content: pageContentValue?.content || [{ value: "" }],
    };
  });

  return values;
};

async function handleUpdateStorePageContent(
  data: Input,
  pageContent: PageContentRecord | null | undefined,
  channelId: string,
  mutate: KeyedMutator<dbPageContent[] | null>,
  tenantContext: TenantContext,
  t: TFunction,
) {
  for (const key in data) {
    const pageContentValue = pageContent?.[key as keyof PageContentRecord] as
      | dbPageContent
      | undefined;
    if (!pageContentValue) {
      const pageContent: dbPageContentCreate = data[key as keyof Input];
      console.log(pageContent);
      const ref = db.doc<dbPageContentCreate>(
        firestore,
        `/channels/${channelId}/pages`,
        key,
      );
      pageContent.id = ref.id;
      try {
        await create<dbPageContentCreate>(
          firestore,
          pageContent,
          ref,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          tenantContext,
        );
        void ensureEntityTranslationsAction({
          kind: "storePageContent",
          channelId,
          entityId: key,
        })
          .then((result) => {
            if (!result.ok) {
              toaster.warning({
                title: t("translations.managed.toasts.autoWarning", {
                  defaultValue: "Created, but auto-translation failed",
                }),
              });
            }
          })
          .catch((error) => {
            console.error(
              "[StorePageContentForm] Auto-translation failed",
              error,
            );
            toaster.warning({
              title: t("translations.managed.toasts.autoWarning", {
                defaultValue: "Created, but auto-translation failed",
              }),
            });
          });
        toaster.success({
          title: "Kontent utworzony.",
          description: `Kontent dla strony ${key} został utworzony.`,
        });

        try {
          await revalidateTagCache(`pageContent-${key}`);
        } catch (error) {
          console.error("Failed to revalidate cache:", error);
        }
      } catch (error) {
        console.error("Error creating content:", error);
        toaster.error({
          title: "Błąd przy tworzeniu kontentu.",
          description: `Kontent dla strony ${key} nie został utworzony.`,
        });
      }
    } else {
      const pageContent: dbPageContentUpdate = data[key as keyof Input];
      console.log(pageContent);
      if (isEqual(pageContent, omit(pageContentValue, ["id"]))) {
        continue;
      }
      try {
        await update(
          pageContent,
          db.doc(firestore, `/channels/${channelId}/pages`, key),
          tenantContext,
        );
        toaster.success({
          title: "Kontent zaktualizowany.",
          description: `Kontent dla strony ${key} został zaktualizowany.`,
        });

        try {
          await revalidateTagCache(`pageContent-${key}`);
        } catch (error) {
          console.error("Failed to revalidate cache:", error);
        }
      } catch (error) {
        console.error("Error updating content:", error);
        toaster.error({
          title: "Błąd przy aktualizacji kontentu.",
          description: `Kontent dla strony ${key} nie został zaktualizowany.`,
        });
      }
    }
  }

  mutate();
  return true;
}
