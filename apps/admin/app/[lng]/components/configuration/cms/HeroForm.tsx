import { revalidateTagCache } from "@/actions";
import { ensureEntityTranslationsAction } from "@/actions/managed-translations";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { CreateToasterReturn } from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import { FormController, toaster } from "@konfi/components";
import { create, db, getHeroTranslations, update } from "@konfi/firebase";
import { Channel, Hero, TenantContext } from "@konfi/types";
import { getIconByFormType, heroForm, HeroSchema } from "@konfi/utils";
import { useChannels } from "context/channels";
import { isNull, isUndefined } from "es-toolkit";
import type { TFunction } from "i18next";
import dynamic from "next/dynamic";
import { Dispatch, SetStateAction, useEffect } from "react";
import { useForm } from "react-hook-form";
import useSWR from "swr";
import { InferType } from "yup";
import { TranslationPanel } from "../../translations/TranslationPanel";
import { HeroTranslationForm } from "./HeroTranslationForm";
const Drawer = dynamic(() => import("../../Drawer"), { ssr: false });

type Input = InferType<typeof HeroSchema>;

const HeroForm = ({
  hero,
  open,
  setOpen,
}: {
  hero?: Hero;
  open?: boolean;
  setOpen?: Dispatch<SetStateAction<boolean>>;
}) => {
  const { t, i18n } = useT();
  const { channel } = useChannels();
  const tenantContext = useTenantContext();
  const formType: "CREATE" | "UPDATE" = hero ? "UPDATE" : "CREATE";
  const label = `${t(`FormTypes.${formType}`)} Baner`;
  const SchemaYupResolver = yupResolver(HeroSchema);

  const { data: translations, mutate: mutateTranslations } = useSWR(
    hero && channel?.id ? [hero, channel.id] : null,
    ([_, channelId]) => getHeroTranslations(firestore, channelId),
  );

  const UpdateForm = useForm({
    defaultValues: initialValues(hero),
    resolver: SchemaYupResolver,
  });

  useEffect(() => {
    if (!open) return;

    UpdateForm.reset(initialValues(hero));
    // Reset only when the drawer opens – not on background SWR revalidation
    // of the `hero` prop, which would discard in-progress edits.
  }, [UpdateForm, open]);

  if (isNull(channel)) return null;

  return (
    <Drawer
      header={label}
      size={"xl"}
      closeOnOverlayClick={false}
      open={open}
      setOpen={setOpen}
    >
      {hero && channel.id && translations && (
        <TranslationPanel
          kind="hero"
          source={hero}
          translationRef={{
            kind: "hero",
            channelId: channel.id,
          }}
          translations={translations}
          onMutate={mutateTranslations}
          renderForm={({ locale, translation, type }) => (
            <HeroTranslationForm
              key={locale}
              channelId={channel.id}
              hero={hero}
              locale={locale}
              type={type}
              translation={translation}
              mutateTranslations={mutateTranslations}
            />
          )}
        />
      )}
      <FormController
        methods={UpdateForm}
        buttonLeftIcon={getIconByFormType(formType)}
        buttonLabel={label}
        formData={heroForm(t, `channels/${channel.id}/cms/hero/`)}
        handleSubmit={async (data) => {
          if (formType === "CREATE") {
            await handleCreateHero(data, channel.id, toaster, tenantContext, t);
          } else {
            await handleUpdateHero(
              data,
              () => {},
              channel.id,
              toaster,
              tenantContext,
            );
          }
        }}
        t={t}
        i18n={i18n}
      />
    </Drawer>
  );
};

const initialValues = (hero?: Hero) => {
  // When creating a new hero, fall back to a new Hero() instance
  if (isUndefined(hero)) return new Hero();
  const values: Input = hero;
  return values;
};

const handleUpdateHero = async (
  data: Input,
  refreshHeros: () => void,
  channelId: Channel["id"],
  toaster: CreateToasterReturn,
  tenantContext: TenantContext,
) => {
  try {
    const hero: Partial<Hero> = {
      cards: data.cards,
    };
    await update(
      hero,
      db.doc(firestore, "/channels/" + channelId + "/cms", "hero"),
      tenantContext,
    );

    try {
      await revalidateTagCache("heroCards");
    } catch (error) {
      console.error("Failed to revalidate cache:", error);
    }

    refreshHeros();
    toaster.success({
      title: "Baner edytowany",
      description: `Pomyślnie edytowano Baner`,
    });
  } catch (error) {
    console.error(error);
    toaster.error({
      title: "Coś poszło nie tak",
      description: `Baner nie został edytowany, kod błędu: ${error}`,
    });
  }
};

const handleCreateHero = async (
  data: Input,
  channelId: Channel["id"],
  toaster: CreateToasterReturn,
  tenantContext: TenantContext,
  t: TFunction,
) => {
  try {
    const hero: Hero = {
      cards: data.cards,
    };
    await create(
      firestore,
      hero,
      db.doc(firestore, "/channels/" + channelId + "/cms", "hero"),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      tenantContext,
    );
    void ensureEntityTranslationsAction({
      kind: "hero",
      channelId,
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
        console.error("[HeroForm] Auto-translation failed", error);
        toaster.warning({
          title: t("translations.managed.toasts.autoWarning", {
            defaultValue: "Created, but auto-translation failed",
          }),
        });
      });

    try {
      await revalidateTagCache("heroCards");
    } catch (error) {
      console.error("Failed to revalidate cache:", error);
    }

    toaster.success({
      title: "Baner utworzony",
      description: `Pomyślnie utworzono Baner`,
    });
  } catch (error) {
    console.error(error);
    toaster.error({
      title: "Coś poszło nie tak",
      description: `Baner nie został utworzony, kod błędu: ${error}`,
    });
  }
};

export default HeroForm;
