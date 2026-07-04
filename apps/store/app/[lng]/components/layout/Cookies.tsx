"use client";

import { useT } from "@/i18n/client";
import { Button, Drawer, Portal, Separator, Stack } from "@chakra-ui/react";
import {
  AccordionItem,
  AccordionItemContent,
  AccordionItemTrigger,
  AccordionRoot,
  CustomHeading,
  Field,
  Switch,
} from "@konfi/components";
import { safeLocalStorage } from "@konfi/utils";
import { isNull } from "es-toolkit";
import { ConsentSettings, setConsent } from "firebase/analytics";
import { useEffect, useState } from "react";

const requiredConsent: ConsentSettings = {
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  personalization_storage: "denied",
  analytics_storage: "granted",
  functionality_storage: "granted",
  security_storage: "granted",
};

const defaultConsentSettings: ConsentSettings = {
  ...requiredConsent,
  ad_storage: "granted",
  ad_user_data: "granted",
  ad_personalization: "granted",
};

const CONSENT_STORAGE_VERSION = "v2";
const CONSENT_ACCEPT_KEY = `consentAccept-${CONSENT_STORAGE_VERSION}`;
const CONSENT_SETTINGS_KEY = `consentSettings-${CONSENT_STORAGE_VERSION}`;

const Cookies = () => {
  const { t } = useT();
  const [hasResolvedStoredConsent, setHasResolvedStoredConsent] =
    useState(false);
  const [isConsentAccepted, setIsConsentAccepted] = useState(true);
  const [consentSettings, setConsentSettings] = useState<ConsentSettings>(
    defaultConsentSettings,
  );

  const requiredConsentKeys = Object.keys(requiredConsent).filter(
    (key) => requiredConsent[key] === "granted",
  );
  const optionalConsentKeys = Object.keys(consentSettings).filter(
    (key) => !requiredConsentKeys.includes(key),
  );

  useEffect(() => {
    const storedConsentAccept = safeLocalStorage.getItem(
      CONSENT_ACCEPT_KEY,
      "false",
    );
    const storedConsentSettings = safeLocalStorage.getJSON<ConsentSettings>(
      CONSENT_SETTINGS_KEY,
      null,
    );
    const nextConsentSettings = storedConsentSettings ?? defaultConsentSettings;
    const nextConsentAccepted =
      storedConsentAccept === "true" && !isNull(storedConsentSettings);

    setConsentSettings(nextConsentSettings);
    setIsConsentAccepted(nextConsentAccepted);
    setHasResolvedStoredConsent(true);

    if (nextConsentAccepted) {
      setConsent(nextConsentSettings);
    }
  }, []);

  useEffect(() => {
    if (!isConsentAccepted) return;

    setConsent(consentSettings);
  }, [consentSettings, isConsentAccepted]);

  function acceptSelectedCookies() {
    safeLocalStorage.setItem(CONSENT_ACCEPT_KEY, "true");
    safeLocalStorage.setJSON(CONSENT_SETTINGS_KEY, consentSettings);
    try {
      setConsent(consentSettings);
    } catch {}
    setIsConsentAccepted(true);
  }

  function acceptRequiredCookies() {
    safeLocalStorage.setItem(CONSENT_ACCEPT_KEY, "true");
    safeLocalStorage.setJSON(CONSENT_SETTINGS_KEY, requiredConsent);
    try {
      setConsent(requiredConsent);
    } catch {}
    setIsConsentAccepted(true);
  }

  if (!hasResolvedStoredConsent || isConsentAccepted) return null;

  return (
    <Drawer.Root
      open={true}
      placement={"bottom"}
      closeOnEscape={false}
      closeOnInteractOutside={false}
      lazyMount
    >
      <Portal>
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content data-nosnippet>
            <Drawer.Header>
              <Drawer.Title asChild>
                <CustomHeading
                  heading={t("store.privacyTitle", {
                    defaultValue: "We care about your privacy",
                  })}
                  goBack={false}
                  top={[2, 2]}
                >
                  {" "}
                  /cookie
                </CustomHeading>
              </Drawer.Title>
            </Drawer.Header>
            <Drawer.Body>
              {t("store.cookieUsageDescription", {
                defaultValue:
                  "We and our partners use cookies to store and access data such as:",
              })}
              <br />
              {t("store.cookieDataTypes", {
                defaultValue:
                  "product display, cart content, content or product sharing, authorization, payment initiation and completion",
              })}{" "}
              <br />
              {t("store.cookiePurpose", {
                defaultValue:
                  "for purposes such as delivering and personalizing content and ads and analyzing website traffic.",
              })}{" "}
              <br />
              <Separator my={4} />
              <Field
                label={t("requiredConsent", {
                  defaultValue: "Required Consents",
                })}
                my={2}
                display="flex"
                justifyContent={"space-between"}
              >
                <Switch
                  colorPalette={"primary"}
                  size={"lg"}
                  checked={true}
                  disabled
                />
              </Field>
              <AccordionRoot multiple my={4}>
                <AccordionItem value={"optional_consent_settings"}>
                  <AccordionItemTrigger>
                    {t("optionalConsent", {
                      defaultValue: "Show optional consent settings",
                    })}
                  </AccordionItemTrigger>
                  <AccordionItemContent pb={4}>
                    {optionalConsentKeys.map((key) => (
                      <Field
                        label={t(`ConsentSettings.${key}`)}
                        my={2}
                        key={key}
                        display="flex"
                        justifyContent={"space-between"}
                      >
                        <Switch
                          id={key}
                          colorPalette={"primary"}
                          size={"lg"}
                          defaultChecked={consentSettings[key] === "granted"}
                          checked={consentSettings[key] === "granted"}
                          onCheckedChange={({ checked }) => {
                            setConsentSettings((prev) => ({
                              ...prev,
                              [key]: checked ? "granted" : "denied",
                            }));
                          }}
                        />
                      </Field>
                    ))}
                  </AccordionItemContent>
                </AccordionItem>
              </AccordionRoot>
            </Drawer.Body>
            <Drawer.Footer justifyContent={"start"} gap={2}>
              <Stack
                direction={["column", "column", "column", "row"]}
                w={"100%"}
              >
                <Button
                  onClick={acceptRequiredCookies}
                  colorPalette={"primary"}
                >
                  {t("store.acceptRequiredOnly", {
                    defaultValue: "Accept only required consents",
                  })}
                </Button>
                <Button onClick={acceptSelectedCookies}>
                  {t("store.acceptSelected", {
                    defaultValue: "Accept selected consents",
                  })}
                </Button>
              </Stack>
            </Drawer.Footer>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
};

export default Cookies;
