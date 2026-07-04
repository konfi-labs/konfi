"use client";

import { useT } from "@/i18n/client";
import { Box, Button, Card, HStack, Stack, Text } from "@chakra-ui/react";
import { CustomHeading, MaterialSymbol } from "@konfi/components";

const TENANT_DASHBOARD_URL = "https://getkonfi.com/tenant/dashboard";

export function IntegrationUnavailableCard({
  integrationName,
}: {
  integrationName: string;
}) {
  const { t } = useT();

  return (
    <Stack gap={6} maxW="720px">
      <CustomHeading heading={integrationName} breadcrumb goBack t={t} />
      <Card.Root variant="outline" borderRadius="2xl">
        <Card.Body>
          <Stack gap={5}>
            <HStack align="start" gap={4}>
              <Box
                aria-hidden="true"
                bg="colorPalette.subtle"
                borderRadius="full"
                color="colorPalette.fg"
                colorPalette="orange"
                flex="0 0 auto"
                p={3}
              >
                <MaterialSymbol>lock</MaterialSymbol>
              </Box>
              <Stack gap={2} minW={0}>
                <Card.Title>
                  {t("integrations.unavailable.title", {
                    defaultValue: "{{integration}} Is Not Available",
                    integration: integrationName,
                  })}
                </Card.Title>
                <Card.Description asChild>
                  <Text color="fg.muted">
                    {t("integrations.unavailable.description", {
                      defaultValue:
                        "This integration is not included in the current tenant plan or is not connected yet. Open the tenant dashboard to update the plan or enable the integration.",
                    })}
                  </Text>
                </Card.Description>
              </Stack>
            </HStack>
            <Button asChild alignSelf="flex-start" colorPalette="primary">
              <a
                href={TENANT_DASHBOARD_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                <MaterialSymbol>open_in_new</MaterialSymbol>
                {t("integrations.unavailable.updatePlan", {
                  defaultValue: "Update Plan",
                })}
              </a>
            </Button>
          </Stack>
        </Card.Body>
      </Card.Root>
    </Stack>
  );
}
