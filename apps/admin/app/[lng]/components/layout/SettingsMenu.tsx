import { useFeaturePreview } from "@/context/featurePreview";
import { useWhatsNew } from "@/context/whatsNew";
import { useT } from "@/i18n/client";
import { IconButton } from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components/shared/MaterialSymbol";
import { MenuItemLink } from "@konfi/components/shared/Link";
import {
  MenuContent,
  MenuItem,
  MenuItemGroup,
  MenuRoot,
  MenuTrigger,
} from "@konfi/components/ui/menu";
import { ADMIN_CATALOG, ADMIN_CONFIG } from "@konfi/utils/routes";
import {
  VISUAL_ONBOARDING_RESTART_EVENT,
  VISUAL_ONBOARDING_TARGETS,
} from "../onboarding/visual-onboarding-targets";

export default function SettingsMenu() {
  const { t, i18n } = useT();
  const { openDialog } = useWhatsNew();
  const { openDialog: openFeaturePreviewDialog } = useFeaturePreview();
  const handleShowVisualOnboarding = () => {
    window.dispatchEvent(new Event(VISUAL_ONBOARDING_RESTART_EVENT));
  };

  return (
    <MenuRoot lazyMount positioning={{ placement: "bottom-end" }}>
      <MenuTrigger
        title={t("common.settings", { defaultValue: "Settings" })}
        asChild
      >
        <IconButton
          variant={"ghost"}
          aria-label={t("common.settings", { defaultValue: "Settings" })}
          data-onboarding-id={VISUAL_ONBOARDING_TARGETS.settingsTrigger}
        >
          <MaterialSymbol>settings</MaterialSymbol>
        </IconButton>
      </MenuTrigger>
      <MenuContent>
        <MenuItemGroup>
          <MenuItemLink
            lng={i18n.resolvedLanguage}
            href={ADMIN_CATALOG}
            value={"catalog"}
            data-onboarding-id={VISUAL_ONBOARDING_TARGETS.settingsCatalog}
          >
            <MaterialSymbol>inventory_2</MaterialSymbol>
            {t("ROUTES.catalog", { defaultValue: "Catalog" })}
          </MenuItemLink>
          <MenuItem
            value={"feature-preview"}
            onClick={openFeaturePreviewDialog}
          >
            <MaterialSymbol>flask_conical</MaterialSymbol>
            {t("featurePreview.title", { defaultValue: "Feature Preview" })}
          </MenuItem>
          <MenuItemLink
            lng={i18n.resolvedLanguage}
            href={ADMIN_CONFIG}
            value={"configuration"}
            data-onboarding-id={VISUAL_ONBOARDING_TARGETS.settingsConfiguration}
          >
            <MaterialSymbol>toggle_on</MaterialSymbol>
            {t("ROUTES.config", { defaultValue: "Configuration" })}
          </MenuItemLink>
          <MenuItem
            value={"show-visual-onboarding"}
            onClick={handleShowVisualOnboarding}
          >
            <MaterialSymbol>explore</MaterialSymbol>
            {t("visualOnboarding.actions.show", {
              defaultValue: "Show onboarding",
            })}
          </MenuItem>
          <MenuItem value={"whats-new"} onClick={openDialog}>
            <MaterialSymbol>info</MaterialSymbol>
            {t("whatsNew.title", { defaultValue: "What's New" })}
          </MenuItem>
        </MenuItemGroup>
      </MenuContent>
    </MenuRoot>
  );
}
