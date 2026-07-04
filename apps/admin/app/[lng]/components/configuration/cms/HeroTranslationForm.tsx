import { revalidateTagCache } from "@/actions";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { createManualTranslationMeta } from "@/lib/translations";
import { yupResolver } from "@hookform/resolvers/yup";
import { FormController, toaster } from "@konfi/components";
import {
  createHeroTranslation,
  getHeroTranslation,
  updateHeroTranslation,
} from "@konfi/firebase";
import {
  FormTypes,
  Hero,
  HeroTranslation,
  HeroTranslationCreate,
  HeroTranslationUpdate,
  Locale,
} from "@konfi/types";
import {
  getIconByFormType,
  HeroTranslationCreateSchema,
  heroTranslationForm,
  HeroTranslationUpdateSchema,
} from "@konfi/utils";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import useSWR, { KeyedMutator } from "swr";
import { InferType } from "yup";
import { By } from "../../form/field-controllers/By";
import Generate from "../../form/field-controllers/Generate";
import { getTranslationFormVersion } from "../../translations/translation-form-version";

type CreateInput = InferType<typeof HeroTranslationCreateSchema>;
type UpdateInput = InferType<typeof HeroTranslationUpdateSchema>;

interface HeroTranslationFormProps {
  locale: Locale;
  hero: Hero;
  type: keyof typeof FormTypes;
  channelId: string;
  translation?: HeroTranslation;
  mutateTranslations?: KeyedMutator<HeroTranslation[]>;
}

export function HeroTranslationForm({
  hero,
  type,
  channelId,
  locale,
  translation: initialTranslation,
  mutateTranslations,
}: HeroTranslationFormProps) {
  const { t, i18n } = useT();
  const tenantContext = useTenantContext();
  const { data: fetchedTranslation, mutate } = useSWR(
    `/channels/${channelId}/cms/hero/translations/${locale}`,
    () => getHeroTranslation(firestore, channelId, locale),
  );
  const translation = initialTranslation ?? fetchedTranslation;
  const translationVersion = getTranslationFormVersion(translation);
  const label =
    `${t(`FormTypes.${type}`)} ` +
    t(`forms.labels.translation`, {
      defaultValue: "Translation",
    });
  const CreateSchemaYupResolver = yupResolver(HeroTranslationCreateSchema);
  const UpdateSchemaYupResolver = yupResolver(HeroTranslationUpdateSchema);

  const CreateForm = useForm({
    defaultValues: hero && initialValuesCreate(locale, hero),
    resolver: CreateSchemaYupResolver,
    disabled: type !== "CREATE",
  });

  const UpdateForm = useForm({
    defaultValues:
      hero && translation && initialValuesUpdate(locale, hero, translation),
    resolver: UpdateSchemaYupResolver,
    disabled: type !== "UPDATE",
  });

  const onSubmit = async (data: Partial<HeroTranslation>) => {
    try {
      const payload: Partial<HeroTranslation> = {
        ...data,
        translationMeta: createManualTranslationMeta({
          kind: "hero",
          source: hero,
        }),
      };

      if (translation?.id) {
        // Update existing translation
        await updateHeroTranslation(
          firestore,
          channelId,
          translation.id,
          payload as HeroTranslationUpdate,
          tenantContext,
        );
      } else {
        // Create new translation
        await createHeroTranslation(
          firestore,
          channelId,
          payload as HeroTranslationCreate,
          tenantContext,
        );
        await revalidateTagCache("heroCards");
      }

      toaster.success({
        title: t("translationSaved", { defaultValue: "Tłumaczenie zapisane" }),
        description: t("translationSavedDescription", {
          defaultValue: "Tłumaczenie zostało pomyślnie zapisane.",
        }),
      });

      mutate();
      mutateTranslations?.();
    } catch (error) {
      toaster.error({
        title: t("translationError", { defaultValue: "Błąd tłumaczenia" }),
        description: t("translationErrorDescription", {
          defaultValue: "Wystąpił błąd podczas zapisywania tłumaczenia.",
        }),
      });
    }
  };

  // Refs to ensure we only initialize form values when switching entity/locale/type
  const prevChannelIdRef = useRef<string | undefined>(undefined);
  const prevLocaleRef = useRef<Locale | undefined>(undefined);
  const prevTypeRef = useRef<string | undefined>(undefined);
  const initializedCreateRef = useRef(false);
  const initializedUpdateTranslationVersionRef = useRef<string | undefined>(
    undefined,
  );

  useEffect(() => {
    const channelChanged = prevChannelIdRef.current !== channelId;
    const localeChanged = prevLocaleRef.current !== locale;
    const typeChanged = prevTypeRef.current !== type;

    // Reset guards when core dependencies change
    if (channelChanged || localeChanged || typeChanged) {
      initializedCreateRef.current = false;
      initializedUpdateTranslationVersionRef.current = undefined;
    }

    if (type === "CREATE" && hero && !initializedCreateRef.current) {
      CreateForm.reset(initialValuesCreate(locale, hero));
      initializedCreateRef.current = true;
    }

    if (
      type === "UPDATE" &&
      hero &&
      translation &&
      translationVersion &&
      initializedUpdateTranslationVersionRef.current !== translationVersion
    ) {
      UpdateForm.reset(initialValuesUpdate(locale, hero, translation));
      initializedUpdateTranslationVersionRef.current = translationVersion;
    }

    prevChannelIdRef.current = channelId;
    prevLocaleRef.current = locale;
    prevTypeRef.current = type;
  }, [
    type,
    hero,
    locale,
    translation,
    translationVersion,
    CreateForm,
    UpdateForm,
    channelId,
  ]);

  if (type === "CREATE" && CreateForm.formState.disabled) return null;
  if (type === "UPDATE" && UpdateForm.formState.disabled) return null;

  return (
    <FormController
      methods={type === "CREATE" ? CreateForm : UpdateForm}
      buttonLeftIcon={getIconByFormType(type)}
      buttonLabel={label}
      formData={heroTranslationForm(t)}
      update={type === "UPDATE"}
      handleSubmit={async (data) => await onSubmit(data)}
      By={<By update={type === "UPDATE"} />}
      t={t}
      i18n={i18n}
      Generate={Generate}
    />
  );
}

const initialValuesCreate = (locale: Locale, hero: Hero): CreateInput => {
  const values: CreateInput = {
    locale: locale,
    cards: hero.cards.map((card) => ({
      title: card.title,
      subtitle: card.subtitle,
      buttonUrl: card.buttonUrl,
      buttonLabel: card.buttonLabel,
    })),
    createdBy: {
      id: "",
      name: "",
    },
    active: true,
  };
  return values;
};

const initialValuesUpdate = (
  locale: Locale,
  hero: Hero,
  translation?: HeroTranslation,
): UpdateInput => {
  const values: UpdateInput = {
    locale: locale,
    cards:
      translation?.cards.map((card) => ({
        title: card.title,
        subtitle: card.subtitle,
        buttonUrl: card.buttonUrl,
        buttonLabel: card.buttonLabel,
      })) ||
      hero.cards.map((card) => ({
        title: card.title,
        subtitle: card.subtitle,
        buttonUrl: card.buttonUrl,
        buttonLabel: card.buttonLabel,
      })),
    active: translation?.active ?? true,
    updatedBy: {
      id: "",
      name: "",
    },
  };
  return values;
};
