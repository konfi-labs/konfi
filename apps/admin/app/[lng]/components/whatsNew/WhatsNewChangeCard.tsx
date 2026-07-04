"use client";

import { Badge, Box, HStack, Text, VStack } from "@chakra-ui/react";
import { Image, MaterialSymbol } from "@konfi/components";
import type { WhatsNewChange } from "@/lib/whats-new/types";
import { WHATS_NEW_CHANGE_KIND } from "@/lib/whats-new/types";
import type { useT } from "@/i18n/client";
import { pickLocaleValue } from "./utils";

type TranslationFunction = ReturnType<typeof useT>["t"];

type WhatsNewChangeCardProps = {
  change: WhatsNewChange;
  dateFormatter: Intl.DateTimeFormat;
  imageErrors: Set<string>;
  onImageError: (changeId: string) => void;
  resolvedLocale: string;
  t: TranslationFunction;
};

function getChangeBadgeLabel(kind: string | undefined, t: TranslationFunction) {
  switch (kind) {
    case WHATS_NEW_CHANGE_KIND.WEEKLY_UPDATE:
      return t("whatsNew.kind.weeklyUpdate", {
        defaultValue: "Weekly update",
      });
    case WHATS_NEW_CHANGE_KIND.MONTHLY_GROWTH:
      return t("whatsNew.kind.monthlyGrowth", {
        defaultValue: "Monthly ideas",
      });
    default:
      return t("whatsNew.kind.release", {
        defaultValue: "Release note",
      });
  }
}

function getChangeBadgeColor(kind: string | undefined) {
  switch (kind) {
    case WHATS_NEW_CHANGE_KIND.MONTHLY_GROWTH:
      return "purple";
    case WHATS_NEW_CHANGE_KIND.WEEKLY_UPDATE:
      return "primary";
    default:
      return "green";
  }
}

export default function WhatsNewChangeCard({
  change,
  dateFormatter,
  imageErrors,
  onImageError,
  resolvedLocale,
  t,
}: WhatsNewChangeCardProps) {
  const title = pickLocaleValue(change.title, resolvedLocale);
  const description = pickLocaleValue(change.description, resolvedLocale);
  const hasHighlights =
    change.highlightFeatures && change.highlightFeatures.length > 0;

  return (
    <Box as="article" minW={0}>
      <VStack alignItems="stretch" gap={5}>
        <HStack justifyContent="space-between" gap={3} alignItems="flex-start">
          <Box minW={0}>
            <HStack gap={2} mb={2} flexWrap="wrap">
              <Text fontSize="sm" color="fg.muted">
                {dateFormatter.format(new Date(change.timestamp))}
              </Text>
              <Badge
                size="sm"
                variant="subtle"
                colorPalette={getChangeBadgeColor(change.kind)}
              >
                {getChangeBadgeLabel(change.kind, t)}
              </Badge>
            </HStack>
            <Text
              as="h3"
              fontSize={{ base: "2xl", md: "3xl" }}
              fontWeight="semibold"
              lineHeight="short"
              textWrap="balance"
            >
              {title}
            </Text>
            <Text
              color="fg.muted"
              fontSize={{ base: "md", md: "lg" }}
              lineHeight="tall"
              mt={3}
            >
              {description}
            </Text>
          </Box>
        </HStack>

        {change.imageUrl && !imageErrors.has(change.id) && (
          <Image
            src={change.imageUrl}
            alt={title}
            ratio={16 / 9}
            width={720}
            height={405}
            priority={false}
            borderRadius="2xl"
            onError={() => onImageError(change.id)}
          />
        )}

        {hasHighlights && (
          <Box>
            <Text fontSize="sm" fontWeight="semibold" mb={3}>
              {t("whatsNew.highlights", {
                defaultValue: "Highlights:",
              })}
            </Text>
            <VStack alignItems="stretch" gap={3}>
              {change.highlightFeatures?.map((feature, index) => {
                const featureText = pickLocaleValue(
                  {
                    en: feature.en,
                    pl: feature.pl,
                  },
                  resolvedLocale,
                );
                const featureImageUrl = feature.imageUrl;
                const featureImageKey = `${change.id}-feature-${index}`;
                const featureCategory = feature.category
                  ? pickLocaleValue(feature.category, resolvedLocale)
                  : "";
                const featureIcon = feature.icon;

                return (
                  <Box
                    key={featureImageKey}
                    position="relative"
                    borderWidth="1px"
                    borderColor="border.subtle"
                    borderRadius="xl"
                    bg="bg.subtle"
                    p={{ base: 4, md: 5 }}
                    minW={0}
                    overflow="hidden"
                  >
                    {featureIcon && (
                      <Box
                        aria-hidden="true"
                        position="absolute"
                        right={{ base: 3, md: 5 }}
                        bottom={{ base: -5, md: -7 }}
                        fontSize={{ base: 84, md: 112 }}
                        color="fg.muted"
                        opacity={0.12}
                        pointerEvents="none"
                      >
                        <MaterialSymbol fontSize="1em">
                          {featureIcon}
                        </MaterialSymbol>
                      </Box>
                    )}
                    <Box position="relative" minW={0} pr={{ md: 20 }}>
                      {featureCategory && (
                        <Text
                          fontSize="sm"
                          fontWeight="semibold"
                          color="fg.muted"
                          mb={1}
                        >
                          {featureCategory}
                        </Text>
                      )}
                      <Text
                        fontSize={{ base: "md", md: "lg" }}
                        lineHeight="tall"
                      >
                        {featureText}
                      </Text>
                    </Box>
                    {featureImageUrl && !imageErrors.has(featureImageKey) && (
                      <Box mt={3} position="relative">
                        <Image
                          src={featureImageUrl}
                          alt={featureText}
                          ratio={16 / 9}
                          width={600}
                          height={338}
                          priority={false}
                          borderRadius="xl"
                          onError={() => onImageError(featureImageKey)}
                        />
                      </Box>
                    )}
                  </Box>
                );
              })}
            </VStack>
          </Box>
        )}
      </VStack>
    </Box>
  );
}
