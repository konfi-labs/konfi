import { Badge, HStack } from "@chakra-ui/react";
import { LocaleAsOptions, Locale } from "@konfi/types";

interface TranslationStatusProps {
  existingLocales: Locale[];
  size?: "xs" | "sm" | "md";
}

export function TranslationStatus({
  existingLocales,
  size = "xs",
}: TranslationStatusProps) {
  return (
    <HStack gap={1}>
      {LocaleAsOptions.map((localeOption) => {
        const locale = localeOption.value as Locale;
        const hasTranslation = existingLocales.includes(locale);

        return (
          <Badge
            key={locale}
            size={size}
            colorPalette={hasTranslation ? "success" : "gray"}
            variant={hasTranslation ? "solid" : "outline"}
          >
            {locale.toUpperCase()}
          </Badge>
        );
      })}
    </HStack>
  );
}
