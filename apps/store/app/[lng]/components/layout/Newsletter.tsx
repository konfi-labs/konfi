import { Box, Button, Grid, Heading, Text, Theme } from "@chakra-ui/react";
import {
  storefrontGradientCssVar,
  storefrontRadiusCssVar,
} from "@/lib/storefront-editor/theme-vars";
import { toaster } from "@konfi/components";
import { themeGradients } from "@konfi/components/theme";
import { getNewsletter, newsletterSubscribe } from "@konfi/firebase";
import type {
  StorefrontButtonStyle,
  StorefrontHomeBlockVariant,
} from "@konfi/types";
import { FirebaseError } from "firebase/app";
import { useState } from "react";
import { useT } from "@/i18n/client";
import useSWRImmutable from "swr/immutable";
import { useAuth } from "@/context/auth";

const NEWSLETTER_MUTED = "primary.contrast";
const NEWSLETTER_SUBTLE = "primary.muted";

type NewsletterVariant = Extract<
  StorefrontHomeBlockVariant,
  "default" | "inline" | "minimal"
>;

export default function Newsletter({
  buttonStyle = "solid",
  buttonLabel,
  description,
  disclaimer,
  title,
  variant = "default",
}: {
  buttonStyle?: StorefrontButtonStyle;
  buttonLabel?: string;
  description?: string;
  disclaimer?: string;
  title?: string;
  variant?: NewsletterVariant;
}) {
  const { t } = useT();
  const { user } = useAuth();
  const isInline = variant === "inline";
  const isMinimal = variant === "minimal";
  const { data, isLoading, isValidating, mutate } = useSWRImmutable(
    user?.uid ? user.uid : null,
    async (userId) => await getNewsletter(userId),
  );
  const [isSubscribing, setIsSubscribing] = useState(false);

  async function subscribe() {
    setIsSubscribing(true);
    const result = await newsletterSubscribe();
    if (result instanceof FirebaseError) {
      toaster.error({
        title: t("common.error", { defaultValue: "An error occurred!" }),
        description: t("newsletter.subscribeError", {
          defaultValue: "Failed to subscribe to newsletter",
        }),
      });
    } else {
      mutate();
      toaster.success({
        title: t("common.success", { defaultValue: "Success!" }),
        description: t("newsletter.subscribed", {
          defaultValue: "Newsletter subscribed successfully",
        }),
      });
    }
    setIsSubscribing(false);
  }

  if (!user || !user.email || data?.subscribed) {
    return null;
  }

  if (isLoading || isValidating) {
    return <Box minH={"200px"} w={"100%"} />;
  }

  return (
    <Box
      as="section"
      position="relative"
      overflow="hidden"
      rounded={storefrontRadiusCssVar.block}
      w={"100%"}
      p={isMinimal ? [5, 6, 8] : [8, 10, 12]}
      bg={isMinimal ? "bg.panel" : "primary.700"}
      bgImage={
        isMinimal
          ? undefined
          : `var(${storefrontGradientCssVar}, ${themeGradients.newsletterSection})`
      }
      border={isMinimal ? "1px solid" : undefined}
      borderColor={isMinimal ? "border.muted" : undefined}
      maxW={"7xl"}
    >
      <Grid
        templateColumns={{
          base: "1fr",
          lg: isInline ? "minmax(0, 1fr) auto" : "1fr",
        }}
        gap={isInline ? [5, 8] : 0}
        alignItems="center"
      >
        <Box>
          <Text
            fontSize="xs"
            letterSpacing="0.26em"
            textTransform="uppercase"
            color={isMinimal ? "fg.muted" : "primary.muted"}
            fontFamily="mono"
            mb={4}
          >
            [ 10% / ONLINE ONLY ]
          </Text>

          <Heading
            as={"h2"}
            size={{ base: "2xl", md: isMinimal ? "3xl" : "4xl" }}
            color={isMinimal ? undefined : "primary.contrast"}
            maxW="3xl"
          >
            {title ??
              t("newsletter.title", {
                defaultValue: "Subscribe to Newsletter and get 10% Discount",
              })}
          </Heading>
          <Text
            mt={isMinimal ? 4 : 6}
            fontSize={{ base: "md", md: isMinimal ? "lg" : "xl" }}
            color={isMinimal ? "fg.muted" : NEWSLETTER_MUTED}
            maxW="2xl"
          >
            {description ??
              t("newsletter.description", {
                defaultValue:
                  "Get updates about promotions, exclusive offers and new products!",
              })}
          </Text>
        </Box>
        <Box>
          <Theme appearance={"light"} bg={"none"}>
            <Button
              onClick={() => subscribe()}
              mt={isInline ? 0 : 6}
              borderRadius={storefrontRadiusCssVar.button}
              bg={
                buttonStyle === "solid"
                  ? isMinimal
                    ? "primary.solid"
                    : "white"
                  : undefined
              }
              color={
                buttonStyle === "solid"
                  ? isMinimal
                    ? "primary.contrast"
                    : "primary.fg"
                  : undefined
              }
              colorPalette="primary"
              loading={isSubscribing}
              variant={buttonStyle}
              _hover={{
                bg:
                  buttonStyle === "solid"
                    ? isMinimal
                      ? "primary.solid"
                      : "gray.50"
                    : undefined,
                transform: "translateY(-2px)",
              }}
              transitionProperty="transform, background-color"
              transitionDuration="fast"
            >
              {buttonLabel ??
                t("newsletter.subscribeButton", { defaultValue: "Subscribe" })}
            </Button>
          </Theme>
          <Text
            fontSize={{ base: "xs", md: "sm" }}
            mt={4}
            color={isMinimal ? "fg.muted" : NEWSLETTER_SUBTLE}
          >
            {disclaimer ??
              t("newsletter.disclaimer", {
                defaultValue:
                  "*Special offer available exclusively for online purchases!",
              })}
          </Text>
        </Box>
      </Grid>
    </Box>
  );
}
