"use client";

import { useT } from "@/i18n/client";
import {
  STOREFRONT_THEME_PRESETS,
  applyStorefrontThemePreset,
  storefrontThemePresetIsActive,
  type StorefrontThemePreset,
} from "@/lib/storefront-editor/theme-presets";
import {
  Box,
  Button,
  HStack,
  SimpleGrid,
  Stack,
  Text,
  parseColor,
} from "@chakra-ui/react";
import {
  ColorPickerArea,
  ColorPickerContent,
  ColorPickerControl,
  ColorPickerEyeDropper,
  ColorPickerInput,
  ColorPickerLabel,
  ColorPickerRoot,
  ColorPickerSliders,
  ColorPickerTrigger,
  ColorPickerValueSwatch,
  Switch,
} from "@konfi/components";
import {
  type StorefrontButtonStyle,
  type StorefrontSharingSettings,
  type StorefrontThemeRadius,
  type StorefrontThemeSettings,
} from "@konfi/types";
import {
  StorefrontEditorImageField,
  uploadStorefrontImage,
} from "./StorefrontEditorImageField";

const radiusOptions: Array<StorefrontThemeRadius | undefined> = [
  undefined,
  "none",
  "md",
  "xl",
  "3xl",
];
const radiusLabels: Record<string, { key: string; label: string }> = {
  "3xl": {
    key: "store.editor.theme.radiusOptions.3xl",
    label: "Extra round",
  },
  default: {
    key: "store.editor.theme.radiusOptions.default",
    label: "Default",
  },
  md: { key: "store.editor.theme.radiusOptions.md", label: "Soft" },
  none: { key: "store.editor.theme.radiusOptions.none", label: "Square" },
  xl: { key: "store.editor.theme.radiusOptions.xl", label: "Round" },
};
const buttonStyleOptions: StorefrontButtonStyle[] = [
  "solid",
  "subtle",
  "outline",
];
const buttonStyleLabelKeys: Record<StorefrontButtonStyle, string> = {
  outline: "store.editor.theme.buttonStyleOptions.outline",
  solid: "store.editor.theme.buttonStyleOptions.solid",
  subtle: "store.editor.theme.buttonStyleOptions.subtle",
};
const buttonStyleLabels: Record<StorefrontButtonStyle, string> = {
  outline: "Outline",
  solid: "Solid",
  subtle: "Subtle",
};
const maxLogoFileSizeBytes = 2 * 1024 * 1024;
const maxFaviconFileSizeBytes = 1024 * 1024;
const maxOpenGraphFileSizeBytes = 5 * 1024 * 1024;
const logoFileTypes = [
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "image/webp",
];
const faviconFileTypes = [
  "image/png",
  "image/svg+xml",
  "image/vnd.microsoft.icon",
  "image/x-icon",
];
const openGraphFileTypes = ["image/png", "image/jpeg"];
const defaultPrimaryColor = "#1f2937";
const defaultAccentColor = "#0f766e";

const getColorPickerValue = (value: string | undefined, fallback: string) => {
  const normalizedValue =
    typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : fallback;

  try {
    return parseColor(normalizedValue);
  } catch (error) {
    console.error("Invalid storefront color value:", value, error);
    return parseColor(fallback);
  }
};

const ThemeColorPicker = ({
  fallback,
  id,
  label,
  onChange,
  value,
}: {
  fallback: string;
  id: string;
  label: string;
  onChange: (value: string) => void;
  value?: string;
}) => {
  const { t } = useT();

  return (
    <ColorPickerRoot
      name={id}
      onValueChange={(details) => onChange(details.valueAsString)}
      positioning={{ strategy: "fixed", hideWhenDetached: true }}
      size="sm"
      value={getColorPickerValue(value, fallback)}
    >
      <ColorPickerLabel>{label}</ColorPickerLabel>
      <ColorPickerControl>
        <ColorPickerInput borderRadius="xl" />
        <ColorPickerTrigger borderRadius="xl">
          <ColorPickerValueSwatch borderRadius="lg" />
        </ColorPickerTrigger>
      </ColorPickerControl>
      <ColorPickerContent portalled={false} zIndex="popover">
        <ColorPickerArea />
        <HStack>
          <ColorPickerEyeDropper
            aria-label={t("store.editor.theme.pickColorFromPage", {
              defaultValue: "Pick color from page",
            })}
          />
          <ColorPickerSliders />
        </HStack>
      </ColorPickerContent>
    </ColorPickerRoot>
  );
};

const ThemePresetSwatch = ({ preset }: { preset: StorefrontThemePreset }) => {
  const primary = preset.values.primaryColor ?? defaultPrimaryColor;
  const accent = preset.values.accentColor ?? defaultAccentColor;

  return (
    <Box
      borderColor="border.emphasized"
      borderRadius="full"
      borderWidth="1px"
      flexShrink={0}
      h="5"
      style={{
        background: preset.values.gradientEnabled
          ? `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)`
          : `linear-gradient(90deg, ${primary} 0%, ${primary} 50%, ${accent} 50%, ${accent} 100%)`,
      }}
      w="5"
    />
  );
};

export const StorefrontEditorThemeSection = ({
  onChangeTheme,
  theme,
}: {
  onChangeTheme: (theme: StorefrontThemeSettings) => void;
  theme: StorefrontThemeSettings;
}) => {
  const { t } = useT();
  const gradientLabel = t("store.editor.theme.gradient", {
    defaultValue: "Gradient (Main → Accent)",
  });
  const hasBothColors = Boolean(theme.primaryColor && theme.accentColor);

  return (
    <Stack gap={4}>
      <Stack gap={2}>
        <Text fontSize="sm" fontWeight="medium">
          {t("store.editor.theme.presets", {
            defaultValue: "Style Presets",
          })}
        </Text>
        <SimpleGrid columns={2} gap={1}>
          {STOREFRONT_THEME_PRESETS.map((preset) => {
            const isActive = storefrontThemePresetIsActive(theme, preset);

            return (
              <Button
                key={preset.key}
                justifyContent="flex-start"
                size="xs"
                variant={isActive ? "solid" : "outline"}
                onClick={() =>
                  onChangeTheme(applyStorefrontThemePreset(theme, preset))
                }
              >
                <ThemePresetSwatch preset={preset} />
                {t(`store.editor.theme.presetOptions.${preset.key}`, {
                  defaultValue: preset.name,
                })}
              </Button>
            );
          })}
        </SimpleGrid>
      </Stack>
      <StorefrontEditorImageField
        accept={logoFileTypes}
        description={t("store.editor.theme.logoDropzoneDescription", {
          defaultValue: "PNG, JPG, SVG, or WebP under 2 MB.",
        })}
        id="storefront-editor-logo"
        label={t("store.editor.theme.logo", {
          defaultValue: "Logo",
        })}
        maxFileSize={maxLogoFileSizeBytes}
        previewRatio={2}
        upload={(file) =>
          uploadStorefrontImage({
            endpoint: "/api/storefront-editor/logo",
            file,
            fileField: "logo",
            responseField: "logoUrl",
          })
        }
        value={theme.logoUrl}
        onChange={(logoUrl) => onChangeTheme({ ...theme, logoUrl })}
      />
      <HStack align="start">
        <ThemeColorPicker
          id="storefront-editor-primary-color"
          label={t("store.editor.theme.primaryColor", {
            defaultValue: "Main Color",
          })}
          fallback={defaultPrimaryColor}
          onChange={(primaryColor) => onChangeTheme({ ...theme, primaryColor })}
          value={theme.primaryColor}
        />
        <ThemeColorPicker
          id="storefront-editor-accent-color"
          label={t("store.editor.theme.accentColor", {
            defaultValue: "Accent Color",
          })}
          fallback={defaultAccentColor}
          onChange={(accentColor) => onChangeTheme({ ...theme, accentColor })}
          value={theme.accentColor}
        />
      </HStack>
      <Stack gap={1}>
        <Switch
          checked={Boolean(theme.gradientEnabled) && hasBothColors}
          colorPalette="primary"
          disabled={!hasBothColors}
          display="flex"
          flexDirection="row-reverse"
          fontSize="sm"
          fontWeight="medium"
          inputProps={{ "aria-label": gradientLabel }}
          justifyContent="space-between"
          size="sm"
          w="full"
          onCheckedChange={({ checked }) =>
            onChangeTheme({
              ...theme,
              gradientEnabled: checked ? true : undefined,
            })
          }
        >
          {gradientLabel}
        </Switch>
        <Text color="fg.muted" fontSize="xs">
          {hasBothColors
            ? t("store.editor.theme.gradientDescription", {
                defaultValue:
                  "Blends your colors on hero and newsletter backgrounds.",
              })
            : t("store.editor.theme.gradientNeedsColors", {
                defaultValue: "Pick both colors to enable the gradient.",
              })}
        </Text>
      </Stack>
      <Stack gap={2}>
        <Text fontSize="sm">
          {t("store.editor.theme.radius", {
            defaultValue: "Rounding",
          })}
        </Text>
        <HStack flexWrap="wrap" gap={1}>
          {radiusOptions.map((radius) => {
            const option = radiusLabels[radius ?? "default"];

            return (
              <Button
                key={radius ?? "default"}
                size="xs"
                variant={theme.radius === radius ? "solid" : "outline"}
                onClick={() => onChangeTheme({ ...theme, radius })}
              >
                {t(option.key, { defaultValue: option.label })}
              </Button>
            );
          })}
        </HStack>
      </Stack>
      <Stack gap={2}>
        <Text fontSize="sm">
          {t("store.editor.theme.buttonStyle", {
            defaultValue: "Button Style",
          })}
        </Text>
        <HStack flexWrap="wrap" gap={1}>
          {buttonStyleOptions.map((buttonStyle) => (
            <Button
              key={buttonStyle}
              size="xs"
              variant={
                (theme.buttonStyle ?? "solid") === buttonStyle
                  ? "solid"
                  : "outline"
              }
              onClick={() => onChangeTheme({ ...theme, buttonStyle })}
            >
              {t(buttonStyleLabelKeys[buttonStyle], {
                defaultValue: buttonStyleLabels[buttonStyle],
              })}
            </Button>
          ))}
        </HStack>
      </Stack>
    </Stack>
  );
};

export const StorefrontEditorSharingSection = ({
  onChangeSharing,
  sharing,
}: {
  onChangeSharing: (sharing: StorefrontSharingSettings) => void;
  sharing: StorefrontSharingSettings;
}) => {
  const { t } = useT();

  return (
    <Stack gap={4}>
      <Stack gap={1}>
        <Text fontSize="sm" fontWeight="medium">
          {t("store.editor.sharing.title", {
            defaultValue: "Sharing",
          })}
        </Text>
        <Text color="fg.muted" fontSize="xs">
          {t("store.editor.sharing.description", {
            defaultValue:
              "Control the browser icon and social preview images for this storefront.",
          })}
        </Text>
      </Stack>
      <StorefrontEditorImageField
        accept={faviconFileTypes}
        description={t("store.editor.sharing.faviconDropzoneDescription", {
          defaultValue: "PNG, SVG, or ICO under 1 MB.",
        })}
        id="storefront-editor-favicon"
        label={t("store.editor.sharing.favicon", {
          defaultValue: "Favicon",
        })}
        maxFileSize={maxFaviconFileSizeBytes}
        previewRatio={1}
        upload={(file) =>
          uploadStorefrontImage({
            endpoint: "/api/storefront-editor/sharing-image",
            file,
            fileField: "image",
            formFields: { kind: "favicon" },
            responseField: "imageUrl",
          })
        }
        value={sharing.faviconUrl}
        onChange={(faviconUrl) => onChangeSharing({ ...sharing, faviconUrl })}
      />
      <StorefrontEditorImageField
        accept={openGraphFileTypes}
        description={t("store.editor.sharing.openGraphDropzoneDescription", {
          defaultValue: "PNG or JPG, ideally 1200 x 630 px.",
        })}
        id="storefront-editor-open-graph"
        label={t("store.editor.sharing.openGraphImage", {
          defaultValue: "Social Preview Image",
        })}
        maxFileSize={maxOpenGraphFileSizeBytes}
        previewRatio={1.91}
        upload={(file) =>
          uploadStorefrontImage({
            endpoint: "/api/storefront-editor/sharing-image",
            file,
            fileField: "image",
            formFields: { kind: "openGraph" },
            responseField: "imageUrl",
          })
        }
        value={sharing.defaultOpenGraphImageUrl}
        onChange={(defaultOpenGraphImageUrl) =>
          onChangeSharing({ ...sharing, defaultOpenGraphImageUrl })
        }
      />
    </Stack>
  );
};
