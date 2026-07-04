"use client";

import { Alert, Box, Button, HStack, Text, VStack } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { MaterialSymbol } from "../MaterialSymbol";
import type { EnrolledFactor } from "./totpMfaTypes";

interface TotpEnrollmentStatusProps {
  enrolledFactors: EnrolledFactor[];
  hasTotpEnrolled: boolean;
  isEmailVerified: boolean;
  isEnrolling: boolean;
  isSendingVerification: boolean;
  t: TFunction;
  onOpenUnenrollDialog: (factor: EnrolledFactor) => void;
  onResendVerificationEmail: () => void;
  onStartEnrollment: () => void;
}

const TotpEnrollmentStatus = ({
  enrolledFactors,
  hasTotpEnrolled,
  isEmailVerified,
  isEnrolling,
  isSendingVerification,
  t,
  onOpenUnenrollDialog,
  onResendVerificationEmail,
  onStartEnrollment,
}: TotpEnrollmentStatusProps) => {
  const totpFactors = enrolledFactors.filter((factor) => factor.factorId === "totp");

  if (hasTotpEnrolled) {
    return (
      <Box mt={6}>
        <Alert.Root
          colorPalette="green"
          borderStartWidth="4px"
          borderStartColor="green.solid"
          borderRadius="xl"
        >
          <Alert.Indicator>
            <MaterialSymbol>verified_user</MaterialSymbol>
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>
              {t("mfa.status.enabled", {
                defaultValue: "Two-factor authentication is enabled",
              })}
            </Alert.Title>
            <Alert.Description>
              {t("mfa.status.enabledDescription", {
                defaultValue:
                  "Your account is protected with an authenticator app.",
              })}
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>

        <VStack align="stretch" mt={4} gap={2}>
          {totpFactors.map((factor) => (
            <HStack
              key={factor.uid}
              justify="space-between"
              p={3}
              borderWidth="1px"
              borderColor="gray.muted"
              borderRadius="xl"
            >
              <HStack gap={3}>
                <MaterialSymbol>smartphone</MaterialSymbol>
                <Box>
                  <Text fontWeight="medium">
                    {factor.displayName ||
                      t("mfa.factorName", {
                        defaultValue: "Authenticator App",
                      })}
                  </Text>
                  <Text fontSize="sm" color="fg.muted">
                    {t("mfa.enrolledOn", {
                      defaultValue: "Enrolled on {{date}}",
                      date: new Date(
                        factor.enrollmentTime,
                      ).toLocaleDateString(),
                    })}
                  </Text>
                </Box>
              </HStack>
              <Button
                variant="outline"
                colorPalette="red"
                size="sm"
                onClick={() => onOpenUnenrollDialog(factor)}
              >
                {t("mfa.remove", { defaultValue: "Remove" })}
              </Button>
            </HStack>
          ))}
        </VStack>
      </Box>
    );
  }

  return (
    <Box mt={6}>
      {!isEmailVerified && (
        <Alert.Root
          colorPalette="orange"
          borderStartWidth="4px"
          borderStartColor="orange.solid"
          borderRadius="3xl"
          mb={4}
        >
          <Alert.Indicator>
            <MaterialSymbol>mail</MaterialSymbol>
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>
              {t("mfa.emailVerification.title", {
                defaultValue: "Verify your email to enable MFA",
              })}
            </Alert.Title>
            <Alert.Description>
              {t("mfa.emailVerification.description", {
                defaultValue:
                  "Check your inbox for a verification link. MFA can be enabled after your email is verified.",
              })}
            </Alert.Description>
            <HStack mt={3} gap={3}>
              <Button
                variant="outline"
                size="sm"
                onClick={onResendVerificationEmail}
                loading={isSendingVerification}
                disabled={isSendingVerification}
              >
                <MaterialSymbol>send</MaterialSymbol>
                {t("mfa.emailVerification.resend", {
                  defaultValue: "Resend verification email",
                })}
              </Button>
            </HStack>
          </Alert.Content>
        </Alert.Root>
      )}
      <Alert.Root
        colorPalette="yellow"
        borderStartWidth="4px"
        borderStartColor="yellow.solid"
        borderRadius="3xl"
      >
        <Alert.Indicator>
          <MaterialSymbol>warning</MaterialSymbol>
        </Alert.Indicator>
        <Alert.Content>
          <Alert.Title>
            {t("mfa.status.disabled", {
              defaultValue: "Two-factor authentication is disabled",
            })}
          </Alert.Title>
          <Alert.Description>
            {t("mfa.status.disabledDescription", {
              defaultValue:
                "Enable two-factor authentication to add an extra layer of security to your account.",
            })}
          </Alert.Description>
        </Alert.Content>
      </Alert.Root>

      <Button
        mt={4}
        colorPalette="primary"
        onClick={onStartEnrollment}
        loading={isEnrolling}
        disabled={!isEmailVerified}
      >
        <MaterialSymbol>add</MaterialSymbol>
        {t("mfa.enable", {
          defaultValue: "Enable Two-Factor Authentication",
        })}
      </Button>
    </Box>
  );
};

export default TotpEnrollmentStatus;
