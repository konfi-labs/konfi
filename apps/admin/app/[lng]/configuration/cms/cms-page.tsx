"use client";

import { createStorefrontEditorLaunchUrlAction } from "@/actions/storefront-editor";
import ChannelsSelect from "@/components/layout/ChannelsSelect";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import {
  Box,
  Button,
  Heading,
  HStack,
  SimpleGrid,
  Skeleton,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  ButtonLink,
  CustomHeading,
  Empty,
  MaterialSymbol,
  StoreLandingHero,
  toaster,
} from "@konfi/components";
import { db, getDoc } from "@konfi/firebase";
import { DEFAULT_LOCALE, Hero } from "@konfi/types";
import { ADMIN_BLOG, ADMIN_CHANNELS, ADMIN_CONFIG_STORE } from "@konfi/utils";
import { useChannels } from "context/channels";
import { isUndefined } from "es-toolkit";
import dynamic from "next/dynamic";
import { useState } from "react";
import useSWR from "swr";
const HeroForm = dynamic(
  () => import("@/components/configuration/cms/HeroForm"),
  {
    loading: () => <Skeleton />,
    ssr: false,
  },
);

const CMSPage = () => {
  const { t, i18n } = useT();
  const { channel } = useChannels();
  const { data: hero, isValidating } = useSWR(
    channel ? `/channels/${channel?.id}/cms` : null,
    fetchData,
    {
      revalidateOnFocus: false,
    },
  );
  const [showForm, setShowForm] = useState(false);
  const [openingStorefrontEditor, setOpeningStorefrontEditor] = useState(false);

  async function fetchData(key: string) {
    console.log("fetching data...");
    const result = (await getDoc(db.doc<Hero>(firestore, key, "hero"))) as Hero;
    return result;
  }

  async function handleOpenStorefrontEditor() {
    if (!channel) {
      return;
    }

    setOpeningStorefrontEditor(true);

    try {
      const result = await createStorefrontEditorLaunchUrlAction({
        channelId: channel.id,
        locale: i18n.resolvedLanguage,
      });

      window.open(result.url, "_blank", "noopener,noreferrer")?.focus();
    } catch (error) {
      console.error(error);
      toaster.error({
        title: t("cms.storefront.openEditorFailedTitle", {
          defaultValue: "Could not open storefront editor",
        }),
        description:
          error instanceof Error
            ? error.message
            : t("errors.somethingWentWrong", {
                defaultValue: "Something went wrong",
              }),
        duration: 3000,
      });
    } finally {
      setOpeningStorefrontEditor(false);
    }
  }

  const channelSettingsHref = channel
    ? `${ADMIN_CHANNELS}?edit=${channel.id}`
    : ADMIN_CHANNELS;

  return (
    <>
      <CustomHeading
        heading={t("ROUTES.configCms", "Content management system")}
        mb="8"
        breadcrumb={true}
        channelsSwitch={<ChannelsSelect />}
        goBack={true}
        t={t}
      />
      <Box
        as="section"
        border="1px solid"
        borderColor="border.muted"
        borderRadius="2xl"
        bg="bg.panel"
        mb={6}
        p={[4, 5]}
      >
        <SimpleGrid columns={{ base: 1, lg: 2 }} gap={5} alignItems="center">
          <VStack align="start" gap={2}>
            <HStack gap={2}>
              <MaterialSymbol>storefront</MaterialSymbol>
              <Heading size="md">
                {t("cms.storefront.title", {
                  defaultValue: "Storefront workspace",
                })}
              </Heading>
            </HStack>
            <Text color="fg.muted">
              {t("cms.storefront.description", {
                defaultValue:
                  "Manage hero CMS content here, then jump to visual customization, channel settings, or store settings for the selected channel.",
              })}
            </Text>
          </VStack>
          <HStack
            justify={{ base: "start", lg: "end" }}
            gap={2}
            flexWrap="wrap"
          >
            <Button
              colorPalette="primary"
              disabled={!channel || openingStorefrontEditor}
              loading={openingStorefrontEditor}
              onClick={() => void handleOpenStorefrontEditor()}
              variant="solid"
            >
              <MaterialSymbol>palette</MaterialSymbol>
              {t("cms.storefront.openEditor", {
                defaultValue: "Visual editor",
              })}
            </Button>
            <ButtonLink
              ariaLabel={t("cms.storefront.channelSettings", {
                defaultValue: "Channel settings",
              })}
              href={channelSettingsHref}
              variant="outline"
            >
              <MaterialSymbol>tune</MaterialSymbol>
              {t("cms.storefront.channelSettings", {
                defaultValue: "Channel settings",
              })}
            </ButtonLink>
            <ButtonLink
              ariaLabel={t("cms.storefront.storeSettings", {
                defaultValue: "Store settings",
              })}
              href={ADMIN_CONFIG_STORE}
              variant="outline"
            >
              <MaterialSymbol>settings</MaterialSymbol>
              {t("cms.storefront.storeSettings", {
                defaultValue: "Store settings",
              })}
            </ButtonLink>
          </HStack>
        </SimpleGrid>
      </Box>
      <Tabs.Root lazyMount colorPalette={"primary"} defaultValue={"hero"}>
        <Tabs.List mb={4}>
          <Tabs.Trigger value={"hero"}>
            {t("cms.banner", "Banner")}
          </Tabs.Trigger>
          <Tabs.Trigger value={"ad"} disabled>
            {t("cms.advertisement", "Advertisement")}
          </Tabs.Trigger>
          <Tabs.Trigger
            value={"blog"}
            disabled={process.env.NODE_ENV !== "development"}
          >
            {t("cms.blog", "Blog")}
          </Tabs.Trigger>
          <Tabs.Indicator />
        </Tabs.List>
        <Tabs.Content value={"hero"}>
          <Skeleton loading={isValidating}>
            {isUndefined(hero) ? (
              <Empty
                title={t("cms.hero.empty.title", "No banners yet")}
                description={t(
                  "cms.hero.empty.description",
                  "Create your first banner",
                )}
                icon={"home_max"}
              >
                <Button onClick={() => setShowForm(true)}>
                  <MaterialSymbol>add</MaterialSymbol>
                  {t("common.create", "Create")}
                </Button>
              </Empty>
            ) : (
              <Box
                zIndex={1}
                position={"relative"}
                textAlign={"end"}
                right={0}
                top={5}
              >
                <Button onClick={() => setShowForm(true)}>
                  <MaterialSymbol>edit_square</MaterialSymbol>
                  {t("common.edit", "Edit")}
                </Button>
              </Box>
            )}
            {!isUndefined(hero) && (
              <StoreLandingHero
                heroCards={hero.cards}
                lng={i18n.resolvedLanguage || DEFAULT_LOCALE}
                labels={{
                  fallbackTitle: t("store.home.hero.fallbackTitle", {
                    defaultValue:
                      "Print work that looks premium before it reaches the press",
                  }),
                  fallbackDescription: t(
                    "store.home.hero.fallbackDescription",
                    {
                      defaultValue:
                        "Upload, proof, produce and ship in one clean flow — with real materials, clear pricing and tracked delivery.",
                    },
                  ),
                  primaryCtaLabel: t("navigation.allProducts", {
                    defaultValue: "All products",
                  }),
                  secondaryCtaLabel: t("store.home.hero.secondaryCta", {
                    defaultValue: "Browse all products",
                  }),
                  prevLabel: t("store.home.hero.prev", {
                    defaultValue: "Previous slide",
                  }),
                  nextLabel: t("store.home.hero.next", {
                    defaultValue: "Next slide",
                  }),
                }}
              />
            )}
          </Skeleton>
        </Tabs.Content>
        <Tabs.Content value={"blog"}>
          <ButtonLink
            href={ADMIN_BLOG}
            ariaLabel={t("blog.manage", "Manage")}
            colorPalette={"primary"}
            variant={"solid"}
          >
            <MaterialSymbol>edit_square</MaterialSymbol>
            {t("blog.manage", "Manage")}
          </ButtonLink>
        </Tabs.Content>
      </Tabs.Root>
      <HeroForm hero={hero} open={showForm} setOpen={setShowForm} />
    </>
  );
};

export default CMSPage;
