"use client";

import { useT } from "@/i18n/client";
import type { ProductionCooperationActionResultCode } from "@/lib/production-cooperation/types";
import { Alert, Box, Card, Code, HStack, Text, VStack } from "@chakra-ui/react";
import { ButtonLink, CustomHeading, MaterialSymbol } from "@konfi/components";

const successCodes = new Set<ProductionCooperationActionResultCode>([
  "accepted",
  "declined",
]);

export default function CooperationStatusPage({
  code,
  requestId,
}: {
  code: ProductionCooperationActionResultCode;
  requestId?: string;
}) {
  const { t, i18n } = useT();
  const isSuccess = successCodes.has(code);

  return (
    <Box>
      <CustomHeading
        heading={t("productionCooperation.statusPage.title", {
          defaultValue: "Cooperation Request Status",
        })}
        mb="8"
        breadcrumb
        goBack
        t={t}
      />
      <Card.Root maxW="3xl" variant="outline">
        <Card.Body>
          <VStack align="stretch" gap={5}>
            <Alert.Root status={isSuccess ? "success" : "warning"}>
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>
                  {t(`productionCooperation.result.${code}.title`, {
                    defaultValue: isSuccess
                      ? "Action completed"
                      : "Action unavailable",
                  })}
                </Alert.Title>
                <Alert.Description>
                  {t(`productionCooperation.result.${code}.description`, {
                    defaultValue:
                      "The cooperation request status could not be changed.",
                  })}
                </Alert.Description>
              </Alert.Content>
            </Alert.Root>
            {requestId ? (
              <HStack gap={2} minW="0">
                <Text color="fg.muted">
                  {t("productionCooperation.requestId", {
                    defaultValue: "Request ID",
                  })}
                </Text>
                <Code truncate translate="no">
                  {requestId}
                </Code>
              </HStack>
            ) : null}
            <HStack>
              <ButtonLink
                lng={i18n.resolvedLanguage}
                href="/cooperation"
                colorPalette="primary"
                ariaLabel={t("productionCooperation.backToInbox", {
                  defaultValue: "Back to Cooperation",
                })}
              >
                <MaterialSymbol>assignment</MaterialSymbol>
                {t("productionCooperation.backToInbox", {
                  defaultValue: "Back to Cooperation",
                })}
              </ButtonLink>
            </HStack>
          </VStack>
        </Card.Body>
      </Card.Root>
    </Box>
  );
}
