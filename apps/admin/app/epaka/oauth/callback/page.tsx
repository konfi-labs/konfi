import { exchangeEpakaCode } from "@/actions/epaka-oauth";
import { getT } from "@/i18n/index";
import { cookieName, fallbackLng } from "@/i18n/settings";
import {
  Alert,
  Box,
  Card,
  HStack,
  Text,
  VStack
} from "@chakra-ui/react";
import { ButtonLink } from "@konfi/components";
import { cookies } from "next/headers";
import { Suspense } from "react";

type SearchParams = Promise<{
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}>;

export default function EpakaOAuthCallbackPage({ searchParams }: { searchParams: SearchParams; }) {
  return (
    <Suspense fallback={null}>
      <EpakaOAuthCallbackContent searchParams={searchParams} />
    </Suspense>
  );
}

async function EpakaOAuthCallbackContent({ searchParams }: { searchParams: SearchParams; }) {
  const { t } = await getT();
  const { code, state, error, error_description: errorDescription } = await searchParams;
  const cookieStore = await cookies();
  const lng = cookieStore.get(cookieName)?.value ?? fallbackLng;

  const retryAuthorizationLabel = t("epaka.oauthCallback.retryAuthorization", {
    defaultValue: "Retry authorization",
  });
  const backToSendParcelLabel = t("epaka.oauthCallback.backToSendParcel", {
    defaultValue: "Back to Send Parcel",
  });

  let status: "missing" | "error" | "success" = "missing";
  let message: string | null = null;

  if (error || errorDescription) {
    status = "error";
    message = errorDescription ?? error ?? null;
  } else if (code) {
    try {
      await exchangeEpakaCode(code, state);
      status = "success";
      message = t("epaka.oauthCallback.successMessage", {
        defaultValue: "Epaka authorization complete. Tokens saved.",
      });
    } catch (err) {
      status = "error";
      message =
        err instanceof Error
          ? err.message
          : t("epaka.oauthCallback.tokenExchangeFailed", {
            defaultValue: "Token exchange failed",
          });
    }
  }

  return (
    <Box p={6} maxW="lg" mx="auto">
      <Card.Root>
        <Card.Body p={6}>
          <VStack align="stretch" gap={4}>
            <Text fontSize="xl" fontWeight="semibold">
              {t("epaka.oauthCallback.title", {
                defaultValue: "Epaka OAuth callback",
              })}
            </Text>

            {status === "missing" && (
              <Alert.Root status="warning">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>
                    {t("epaka.oauthCallback.missingTitle", {
                      defaultValue: "Missing code",
                    })}
                  </Alert.Title>
                  <Alert.Description>
                    {t("epaka.oauthCallback.missingDescription", {
                      defaultValue:
                        "No authorization code was provided. Please start the authorization again.",
                    })}
                  </Alert.Description>
                </Alert.Content>
              </Alert.Root>
            )}

            {status === "success" && (
              <Alert.Root status="success">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>
                    {t("common.success", { defaultValue: "Success" })}
                  </Alert.Title>
                  <Alert.Description>{message}</Alert.Description>
                </Alert.Content>
              </Alert.Root>
            )}

            {status === "error" && (
              <Alert.Root status="error">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>
                    {t("epaka.oauthCallback.errorTitle", {
                      defaultValue: "Authorization failed",
                    })}
                  </Alert.Title>
                  <Alert.Description>
                    {message ??
                      t("common.unknownError", {
                        defaultValue: "Unknown error",
                      })}
                  </Alert.Description>
                </Alert.Content>
              </Alert.Root>
            )}

            <HStack gap={3}>
              <ButtonLink
                href={"/epaka/oauth/login"}
                variant="outline"
                ariaLabel={retryAuthorizationLabel}
              >
                {retryAuthorizationLabel}
              </ButtonLink>
              <ButtonLink href={`/${lng}/send-parcel`} ariaLabel={backToSendParcelLabel}>
                {backToSendParcelLabel}
              </ButtonLink>
            </HStack>
          </VStack>
        </Card.Body>
      </Card.Root>
    </Box>
  );
}
