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
  dbMetadata,
  dbMetadataCreate,
  dbMetadataUpdate,
  FormTypes,
  TenantContext,
} from "@konfi/types";
import {
  getIconByFormType,
  MetadataRecord,
  storeMetadataForm,
  StoreMetadataSchema,
  T_STORE_ROUTES,
} from "@konfi/utils";
import { useChannels } from "context/channels";
import { isEqual, isNull, omit } from "es-toolkit";
import { getDocs } from "firebase/firestore";
import type { TFunction } from "i18next";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import useSWR, { KeyedMutator } from "swr";
import { InferType } from "yup";

type Input = InferType<typeof StoreMetadataSchema>;

async function fetchStoreMetadata(key: string) {
  db.collection(firestore, key);
  const metadata = await getDocs(db.collection<dbMetadata>(firestore, key));
  if (metadata.empty) {
    return null;
  } else {
    return metadata.docs.map((doc) => doc.data());
  }
}

export const StoreMetadataForm = ({
  type,
}: {
  type: keyof typeof FormTypes;
}) => {
  const { t, i18n } = useT();
  const { channel } = useChannels();
  const tenantContext = useTenantContext();
  const label = `${t(`FormTypes.${type}`)} Metadata`;
  const SchemaYupResolver = yupResolver(StoreMetadataSchema);
  const {
    data: metadata,
    isLoading,
    mutate,
  } = useSWR(
    channel?.id ? `/channels/${channel.id}/metadata` : null,
    fetchStoreMetadata,
  );

  const formattedStoreMetadata = useMemo(
    () =>
      metadata?.reduce((acc, item) => {
        acc[item.id] = item;
        return acc;
      }, {} as MetadataRecord),
    [metadata],
  );

  const UpdateForm = useForm({
    defaultValues:
      formattedStoreMetadata && initialValues(formattedStoreMetadata),
    resolver: SchemaYupResolver,
    disabled: type === "UPDATE" || isLoading ? false : true,
  });

  useEffect(() => {
    if (formattedStoreMetadata) {
      UpdateForm.reset(initialValues(formattedStoreMetadata));
    }
  }, [UpdateForm, formattedStoreMetadata]);

  if (isNull(channel)) return null;

  if (isLoading) return <Skeleton w={"100%"} h={"100%"} />;

  return (
    <FormController
      methods={type === "UPDATE" ? UpdateForm : undefined}
      buttonLeftIcon={getIconByFormType(type)}
      buttonLabel={label}
      formData={storeMetadataForm(t)}
      update={type === "UPDATE"}
      handleSubmit={async (data: Input) => {
        await handleUpdateStoreMetadata(
          data,
          formattedStoreMetadata,
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

const initialValues = (metadata?: MetadataRecord | null): Input => {
  const values: Record<string, dbMetadataUpdate> = {};

  T_STORE_ROUTES.forEach((route: string) => {
    const metadataValue = metadata?.[route] as dbMetadataUpdate | undefined;
    values[route] = {
      title: metadataValue?.title || "",
      description: metadataValue?.description || "",
      keywords: metadataValue?.keywords || "",
      ogTitle: metadataValue?.ogTitle || "",
      ogDescription: metadataValue?.ogDescription || "",
      ogImage: metadataValue?.ogImage || "",
    };
  });

  return values;
};

async function handleUpdateStoreMetadata(
  data: Input,
  metadata: MetadataRecord | null | undefined,
  channelId: string,
  mutate: KeyedMutator<dbMetadata[] | null>,
  tenantContext: TenantContext,
  t: TFunction,
) {
  console.log("data", data);
  console.log("channelId", channelId);

  for (const key in data) {
    const metadataValue = metadata?.[key as keyof MetadataRecord] as
      | dbMetadata
      | undefined;
    if (!metadataValue) {
      const pageMetadata: dbMetadataCreate = data[key as keyof Input];
      const ref = db.doc(firestore, `/channels/${channelId}/metadata`, key);
      pageMetadata.id = ref.id;
      try {
        await create(
          firestore,
          pageMetadata,
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
          kind: "storeMetadata",
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
            console.error("[StoreMetadataForm] Auto-translation failed", error);
            toaster.warning({
              title: t("translations.managed.toasts.autoWarning", {
                defaultValue: "Created, but auto-translation failed",
              }),
            });
          });
        toaster.success({
          title: "Metadata utworzona.",
          description: `Metadata dla strony ${key} została utworzona.`,
        });

        try {
          await revalidateTagCache(`pageMetadata-${key}`);
        } catch (error) {
          console.error("Failed to revalidate cache:", error);
        }
      } catch (error) {
        console.error("Error creating metadata:", error);
        toaster.error({
          title: "Błąd przy tworzeniu metadata.",
          description: `Metadata dla strony ${key} nie została utworzona.`,
        });
      }
    } else {
      const pageMetadata: dbMetadataUpdate = data[key as keyof Input];
      if (isEqual(pageMetadata, omit(metadataValue, ["id"]))) {
        continue;
      }
      try {
        await update(
          pageMetadata,
          db.doc(firestore, `/channels/${channelId}/metadata`, key),
          tenantContext,
        );
        toaster.success({
          title: "Metadata zaktualizowana.",
          description: `Metadata dla strony ${key} została zaktualizowana.`,
        });

        try {
          await revalidateTagCache(`pageMetadata-${key}`);
        } catch (error) {
          console.error("Failed to revalidate cache:", error);
        }
      } catch (error) {
        console.error("Error updating metadata:", error);
        toaster.error({
          title: "Błąd przy aktualizacji metadata.",
          description: `Metadata dla strony ${key} nie została zaktualizowana.`,
        });
      }
    }
  }

  mutate();
}
