"use client";

import ImposeForm from "@/components/impose/ImposeForm";
import { SpotColorAuthoringForm } from "@/components/impose/spot-colors/SpotColorAuthoringForm";
import { StickerImposeForm } from "@/components/impose/stickers/StickerImposeForm";
import { useFeaturePreview } from "@/context/featurePreview";
import { useTenantModuleAccess } from "@/hooks/useTenantModuleAccess";
import { useT } from "@/i18n/client";
import { Alert, Badge, Tabs } from "@chakra-ui/react";
import { CustomHeading } from "@konfi/components";

export default function ImposePage() {
  const { t } = useT(["impose", "translation"]);
  const { isEnabled } = useFeaturePreview();
  const isSpotColorAuthoringEnabled = isEnabled("spotColorAuthoring");
  const isStickersEnabled = isEnabled("stickersImposition");
  const { isAllowed: canUseImposition, isChecking: isCheckingPlanAccess } =
    useTenantModuleAccess("imposition");

  return (
    <>
      <CustomHeading
        heading={t("tools.imposition", { defaultValue: "Imposition" })}
        mb={"8"}
        breadcrumb={true}
        goBack={true}
        t={t}
      />
      {isCheckingPlanAccess && (
        <Alert.Root status="info" mb={4}>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              {t("impose.checkingPlanAccess", {
                defaultValue: "Checking plan access…",
              })}
            </Alert.Title>
            <Alert.Description>
              {t("impose.checkingPlanAccessDescription", {
                defaultValue:
                  "We are verifying whether this workspace can use imposition tools.",
              })}
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}
      {!isCheckingPlanAccess && !canUseImposition && (
        <Alert.Root status="warning" mb={4}>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              {t("impose.planDisabledTitle", {
                defaultValue: "Imposition is not available on this plan",
              })}
            </Alert.Title>
            <Alert.Description>
              {t("impose.planDisabledDescription", {
                defaultValue:
                  "Imposition is available from the Starter plan. Upgrade the workspace plan to use browser imposition tools.",
              })}
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}
      {!isCheckingPlanAccess && canUseImposition && (
        <Tabs.Root lazyMount colorPalette="primary" defaultValue="classic">
          <Tabs.List mb={4}>
            <Tabs.Trigger value="classic">
              {t("impose.tabs.classic", {
                defaultValue: "Classical Imposition",
              })}
            </Tabs.Trigger>
            {isStickersEnabled && (
              <Tabs.Trigger value="stickers">
                {t("impose.tabs.stickers", {
                  defaultValue: "Sticker Imposition",
                })}
                <Badge ml={1} colorPalette="yellow">
                  {t("featurePreview.betaBadge", { defaultValue: "Beta" })}
                </Badge>
              </Tabs.Trigger>
            )}
            {isSpotColorAuthoringEnabled && (
              <Tabs.Trigger value="spot-colors">
                {t("impose.tabs.spotColors", {
                  defaultValue: "Spot Colors",
                })}
                <Badge ml={1} colorPalette="yellow">
                  {t("featurePreview.betaBadge", { defaultValue: "Beta" })}
                </Badge>
              </Tabs.Trigger>
            )}
            <Tabs.Indicator />
          </Tabs.List>
          <Tabs.Content value="classic">
            <ImposeForm />
          </Tabs.Content>
          {isStickersEnabled && (
            <Tabs.Content value="stickers">
              <StickerImposeForm />
            </Tabs.Content>
          )}
          {isSpotColorAuthoringEnabled && (
            <Tabs.Content value="spot-colors">
              <SpotColorAuthoringForm />
            </Tabs.Content>
          )}
        </Tabs.Root>
      )}
    </>
  );
}
