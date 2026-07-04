"use client";

import { useStoreCurrency } from "@/context/currency";
import { useT } from "@/i18n/client";
import { Button, HStack, Menu, Portal, Text } from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";

export function CurrencySwitcher({ lng }: { lng: string }) {
  const { t } = useT();
  const { enabledCurrencies, selectedCurrencyCode, setSelectedCurrencyCode } =
    useStoreCurrency();

  if (enabledCurrencies.length <= 1) {
    return null;
  }

  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <Button
          size="sm"
          variant="ghost"
          aria-label={t("store.currency.select", {
            defaultValue: "Select currency",
            lng,
          })}
        >
          <MaterialSymbol>currency_exchange</MaterialSymbol>
          {selectedCurrencyCode}
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content>
            <Menu.ItemGroup>
              <Menu.ItemGroupLabel>
                {t("store.currency.label", {
                  defaultValue: "Currency",
                  lng,
                })}
              </Menu.ItemGroupLabel>
              {enabledCurrencies.map((currency) => (
                <Menu.Item
                  key={currency.code}
                  value={currency.code}
                  onClick={() => setSelectedCurrencyCode(currency.code)}
                >
                  <HStack gap={2} minW={0}>
                    <Text as="span" fontWeight="semibold">
                      {currency.code}
                    </Text>
                    <Text as="span" color="fg.muted" truncate>
                      {currency.name}
                    </Text>
                  </HStack>
                </Menu.Item>
              ))}
            </Menu.ItemGroup>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
