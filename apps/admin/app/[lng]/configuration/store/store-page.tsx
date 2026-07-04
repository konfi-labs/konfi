"use client";

import ChannelsSelect from "@/components/layout/ChannelsSelect";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { isSharedSaasTenantRuntime } from "@/lib/tenant-runtime";
import { Flex, Tabs } from "@chakra-ui/react";
import { CustomHeading, RefreshButton } from "@konfi/components";
import { useConfiguration } from "context/configuration";
import dynamic from "next/dynamic";

const StoreShippingSettingsForm = dynamic(
  () =>
    import("@/components/configuration/StoreShippingSettingsForm").then(
      (mod) => mod.StoreShippingSettingsForm,
    ),
  { ssr: false },
);

const StoreMetadataForm = dynamic(
  () =>
    import("@/components/configuration/StoreMetadataForm").then(
      (mod) => mod.StoreMetadataForm,
    ),
  { ssr: false },
);

const StoreMetadataTranslationPanels = dynamic(
  () =>
    import("@/components/translations/StoreManagedTranslationPanels").then(
      (mod) => mod.StoreMetadataTranslationPanels,
    ),
  { ssr: false },
);

const StorePageContentForm = dynamic(
  () =>
    import("@/components/configuration/StorePageContent").then(
      (mod) => mod.StorePageContentForm,
    ),
  { ssr: false },
);

const StorePageContentTranslationPanels = dynamic(
  () =>
    import("@/components/translations/StoreManagedTranslationPanels").then(
      (mod) => mod.StorePageContentTranslationPanels,
    ),
  { ssr: false },
);

const AgentCustomProductSettings = dynamic(
  () =>
    import("@/components/configuration/AgentCustomProductSettings").then(
      (mod) => mod.AgentCustomProductSettings,
    ),
  { ssr: false },
);

const StorePage = () => {
  const { t } = useT();
  const tenantContext = useTenantContext();
  const { storeSettings, refreshStoreSettings } = useConfiguration();
  const isSharedSaasRuntime = isSharedSaasTenantRuntime(tenantContext);

  return (
    <>
      <CustomHeading
        heading={t("store.settings", "Settings")}
        mb={"8"}
        breadcrumb={true}
        channelsSwitch={<ChannelsSelect />}
        goBack={true}
        t={t}
      />
      <Tabs.Root defaultValue={"store-shipping"}>
        <Tabs.List>
          <Tabs.Trigger value="store-shipping">
            {t("store.tabs.shopping", "Shopping")}
          </Tabs.Trigger>
          {!isSharedSaasRuntime && (
            <>
              <Tabs.Trigger value="metadata">
                {t("store.tabs.metadata", "Metadata")}
              </Tabs.Trigger>
              <Tabs.Trigger value="page-content">
                {t("store.tabs.content", "Content")}
              </Tabs.Trigger>
            </>
          )}
          <Tabs.Indicator />
        </Tabs.List>
        <Tabs.Content value="store-shipping">
          <Flex>
            <RefreshButton
              label={t("store.refreshStoreSettings", "Refresh Store Settings")}
              refreshFunction={refreshStoreSettings}
            />
          </Flex>
          <StoreShippingSettingsForm
            type={"UPDATE"}
            storeSettings={storeSettings}
          />
          <AgentCustomProductSettings />
        </Tabs.Content>
        {!isSharedSaasRuntime && (
          <>
            <Tabs.Content value="metadata">
              <StoreMetadataTranslationPanels />
              <StoreMetadataForm type={"UPDATE"} />
            </Tabs.Content>
            <Tabs.Content value="page-content">
              <StorePageContentTranslationPanels />
              <StorePageContentForm type={"UPDATE"} />
            </Tabs.Content>
          </>
        )}
      </Tabs.Root>
    </>
  );
};

export default StorePage;
