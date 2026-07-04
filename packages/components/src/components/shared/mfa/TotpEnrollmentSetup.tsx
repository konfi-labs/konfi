"use client";

import {
  Alert,
  Box,
  Button,
  Group,
  HStack,
  PinInput,
  QrCode,
  Separator,
  Text,
  VStack,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import { Field } from "../../ui/field";
import { MaterialSymbol } from "../MaterialSymbol";

interface TotpEnrollmentSetupProps {
  isEnrolling: boolean;
  qrCodeUri: string;
  secretKey: string;
  t: TFunction;
  verificationCode: string;
  onCancel: () => void;
  onVerify: () => void;
  onVerificationCodeChange: (value: string) => void;
}

const TotpEnrollmentSetup = ({
  isEnrolling,
  qrCodeUri,
  secretKey,
  t,
  verificationCode,
  onCancel,
  onVerify,
  onVerificationCodeChange,
}: TotpEnrollmentSetupProps) => {
  const verificationCodeValues = Array.from({ length: 6 }, (_, index) =>
    verificationCode[index] ?? "",
  );

  const syncVerificationCode = (value: string) => {
    onVerificationCodeChange(value.replace(/\D/g, "").slice(0, 6));
  };

  const handleHiddenInputChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    syncVerificationCode(event.currentTarget.value);
  };

  const handleHiddenInputInput = (
    event: React.FormEvent<HTMLInputElement>,
  ) => {
    syncVerificationCode(event.currentTarget.value);
  };

  return (
    <Box mt={6}>
      <VStack align="stretch" gap={4}>
        <Alert.Root
          colorPalette="primary"
          borderStartWidth="4px"
          borderStartColor="primary.solid"
          borderRadius="xl"
        >
          <Alert.Indicator>
            <MaterialSymbol>info</MaterialSymbol>
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>
              {t("mfa.setup.step1Title", {
                defaultValue: "Step 1: Scan QR Code",
              })}
            </Alert.Title>
            <Alert.Description>
              {t("mfa.setup.step1Description", {
                defaultValue:
                  "Open your authenticator app (e.g., Google Authenticator, Authy) and scan this QR code.",
              })}
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>

        <Box
          p={4}
          bg="bg"
          borderRadius="xl"
          borderWidth="1px"
          borderColor="gray.muted"
          alignSelf="center"
        >
          <QrCode.Root value={qrCodeUri} size="lg" encoding={{ ecc: "M" }}>
            <QrCode.Frame>
              <QrCode.Pattern />
            </QrCode.Frame>
          </QrCode.Root>
        </Box>

        <Text fontSize="sm" color="fg.muted" textAlign="center">
          {t("mfa.setup.manualEntry", {
            defaultValue: "Can't scan? Enter this code manually:",
          })}
        </Text>
        <Box
          p={3}
          bg="gray.subtle"
          borderRadius="md"
          fontFamily="mono"
          fontSize="sm"
          wordBreak="break-all"
          textAlign="center"
        >
          {secretKey}
        </Box>

        <Separator />

        <Text fontWeight="medium">
          {t("mfa.setup.step2Title", {
            defaultValue: "Step 2: Enter Verification Code",
          })}
        </Text>
        <Text fontSize="sm" color="fg.muted">
          {t("mfa.setup.step2Description", {
            defaultValue:
              "Enter the 6-digit code displayed in your authenticator app to verify the setup.",
          })}
        </Text>

        <Field
          label={t("mfa.verificationCode", {
            defaultValue: "Verification Code",
          })}
          required
        >
          <PinInput.Root
            count={6}
            name="verificationCode"
            otp
            type="numeric"
            value={verificationCodeValues}
            onValueChange={(event) => syncVerificationCode(event.value.join(""))}
          >
            <PinInput.HiddenInput
              autoComplete="one-time-code"
              inputMode="numeric"
              onChange={handleHiddenInputChange}
              onInput={handleHiddenInputInput}
              pattern="[0-9]*"
            />
            <PinInput.Control>
              <Group attached>
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <PinInput.Input key={index} index={index} />
                ))}
              </Group>
            </PinInput.Control>
          </PinInput.Root>
        </Field>

        <HStack gap={4} mt={2}>
          <Button variant="outline" onClick={onCancel} disabled={isEnrolling}>
            {t("common.cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button
            colorPalette="primary"
            onClick={onVerify}
            loading={isEnrolling}
            disabled={verificationCode.length !== 6}
          >
            {t("mfa.verify", { defaultValue: "Verify and Enable" })}
          </Button>
        </HStack>
      </VStack>
    </Box>
  );
};

export default TotpEnrollmentSetup;
