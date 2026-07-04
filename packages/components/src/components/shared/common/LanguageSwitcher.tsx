import { Avatar, Button, Dialog, Portal, VStack } from "@chakra-ui/react";
import { Locale } from "@konfi/types";
import { TFunction } from "i18next";
import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { CloseButton } from "../../ui/close-button";

export function LanguageSwitcher({
  lng,
  t,
  router,
  pathname,
}: {
  lng: string;
  t: TFunction;
  router: AppRouterInstance;
  pathname: string;
}) {
  function switchLocale(locale: string) {
    // e.g. '/en/about' or '/fr/contact'
    const rest = pathname.split("/").slice(2).join("/");
    const nextPath = rest ? `/${locale}/${rest}` : `/${locale}`;
    router.push(nextPath);
  }

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Avatar.Root>
          <Avatar.Fallback name={lng.split("").join(" ")} />
          <Avatar.Image src={`/assets/lng/${lng}.svg`} />
        </Avatar.Root>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>
                {t("common.selectLanguage", {
                  defaultValue: "Select language",
                })}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <VStack gap={4} align="stretch">
                {Object.entries(Locale)
                  .filter(([_, value]) => value !== lng)
                  .map(([key, value]) => (
                    <Button
                      justifyContent={"start"}
                      key={key}
                      onClick={() => {
                        switchLocale(value);
                      }}
                      variant={"subtle"}
                      size={"xl"}
                      pl={1.5}
                    >
                      <Avatar.Root>
                        <Avatar.Fallback name={value.split("").join(" ")} />
                        <Avatar.Image src={`/assets/lng/${value}.svg`} />
                      </Avatar.Root>
                      {t(`languages.${value}`, { defaultValue: value })}
                    </Button>
                  ))}
              </VStack>
            </Dialog.Body>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
