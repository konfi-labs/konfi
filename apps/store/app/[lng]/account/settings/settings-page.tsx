"use client";

import { useAuth } from "@/context/auth";
import { useT } from "@/i18n/client";
import { auth } from "@/lib/firebase/clientApp";
import { Box, Button, Tabs, Text } from "@chakra-ui/react";
import { CustomHeading, toaster } from "@konfi/components";
import { getNewsletter, newsletterUnsubscribe } from "@konfi/firebase";
import PasswordChangeForm from "app/[lng]/components/account/PasswordChangeForm";
import RemoveAccountForm from "app/[lng]/components/account/RemoveAccountForm";
import TotpMfaForm from "app/[lng]/components/account/TotpMfaForm";
import { FirebaseError } from "firebase/app";
import { useState } from "react";
import useSWRImmutable from "swr/immutable";

const SettingsPage = () => {
  const borderColor = "gray.muted";
  const { t } = useT();
  const { user } = useAuth();
  const {
    data: newsletter,
    isLoading: isLoadingNewsletter,
    isValidating: isValidatingNewsletter,
    mutate: mutateNewsletter,
  } = useSWRImmutable(
    user?.uid ? user.uid : null,
    async (userId) => await getNewsletter(userId),
  );
  const [isUnsubscribing, setIsUnsubscribing] = useState(false);
  async function unsubscribe() {
    setIsUnsubscribing(true);
    const result = await newsletterUnsubscribe();
    if (result instanceof FirebaseError) {
      const error = result as FirebaseError;
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("newsletter.unsubscribeError", {
          defaultValue: "Failed to unsubscribe from newsletter",
        }),
      });
    } else {
      mutateNewsletter();
      toaster.success({
        title: t("common.success", { defaultValue: "Success" }),
        description: t("newsletter.unsubscribed", {
          defaultValue: "Successfully unsubscribed from newsletter",
        }),
      });
    }
    setIsUnsubscribing(false);
  }

  return (
    <>
      <CustomHeading
        heading={t("account.settings", { defaultValue: "Settings" })}
        mb={"8"}
      />
      <Tabs.Root defaultValue={"basic"}>
        <Tabs.List>
          <Tabs.Trigger value={"basic"}>
            {t("account.basic", { defaultValue: "Basic" })}
          </Tabs.Trigger>
          {!auth.currentUser?.isAnonymous && (
            <Tabs.Trigger value={"security"}>
              {t("mfa.sectionTitle", { defaultValue: "Security" })}
            </Tabs.Trigger>
          )}
          <Tabs.Indicator />
        </Tabs.List>
        <Tabs.Content value={"basic"} w={"100%"}>
          {!auth.currentUser?.isAnonymous && (
            <Box
              mb={8}
              px={6}
              py={4}
              border={"1px solid"}
              borderColor={borderColor}
              borderRadius="3xl"
            >
              <Text fontSize={"xl"} fontWeight={600}>
                {t("account.changePassword", {
                  defaultValue: "Change Password",
                })}
              </Text>
              <Text>
                {t("account.changePasswordDescription", {
                  defaultValue:
                    "Easily and securely change your account password.",
                })}
              </Text>
              <PasswordChangeForm />
            </Box>
          )}
          <Box
            mb={8}
            px={6}
            py={4}
            border={"1px solid"}
            borderColor={borderColor}
            borderRadius="3xl"
          >
            <Text fontSize={"xl"} fontWeight={600}>
              {t("account.removeAccountTitle", {
                defaultValue: "Remove Account",
              })}
            </Text>
            <Text>
              {t("account.removeAccountDescription", {
                defaultValue:
                  "Easily and securely remove your account and all your data.",
              })}
            </Text>
            <RemoveAccountForm />
          </Box>
          {(!user ||
            isLoadingNewsletter ||
            isValidatingNewsletter ||
            newsletter?.subscribed) && (
            <Box
              mb={4}
              px={6}
              py={4}
              border={"1px solid"}
              borderColor={borderColor}
              borderRadius="3xl"
            >
              <Text fontSize={"xl"} fontWeight={600}>
                {t("account.newsletter", { defaultValue: "Newsletter" })}
              </Text>
              <Button
                mt={"4"}
                onClick={() => unsubscribe()}
                loading={isUnsubscribing}
                colorPalette={"red"}
              >
                {t("account.unsubscribeFromNewsletter", {
                  defaultValue: "Unsubscribe from newsletter",
                })}
              </Button>
            </Box>
          )}
        </Tabs.Content>
        {!auth.currentUser?.isAnonymous && (
          <Tabs.Content value={"security"} w={"100%"}>
            <Box
              px={6}
              py={4}
              border={"1px solid"}
              borderColor={borderColor}
              borderRadius="3xl"
            >
              <Text fontSize={"xl"} fontWeight={600}>
                {t("mfa.sectionTitle", { defaultValue: "Security" })}
              </Text>
              <Text>
                {t("mfa.sectionDescription", {
                  defaultValue:
                    "Manage two-factor authentication for your account.",
                })}
              </Text>
              <TotpMfaForm />
            </Box>
          </Tabs.Content>
        )}
      </Tabs.Root>
    </>
  );
};

export default SettingsPage;
