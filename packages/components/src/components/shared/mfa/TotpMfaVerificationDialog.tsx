"use client";

import {
  Alert,
  Button,
  CloseButton,
  Dialog,
  HStack,
  Input,
  Portal,
  Text,
  VStack,
} from "@chakra-ui/react";
import type {
  Auth,
  MultiFactorError,
  MultiFactorResolver,
} from "firebase/auth";
import {
  TotpMultiFactorGenerator,
  getMultiFactorResolver,
} from "firebase/auth";
import { TFunction } from "i18next";
import { useState } from "react";
import { Field } from "../../ui/field";
import { MaterialSymbol } from "../MaterialSymbol";

interface TotpMfaVerificationDialogProps {
  auth: Auth;
  error: MultiFactorError | null;
  open: boolean;
  t: TFunction;
  onClose: () => void;
  onSuccess: () => void;
}

export function TotpMfaVerificationDialog({
  auth,
  error,
  open,
  t,
  onClose,
  onSuccess,
}: TotpMfaVerificationDialogProps) {
  const [verificationCode, setVerificationCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(
    null,
  );
  const verificationCodeLabel = t("mfa.verificationCode", {
    defaultValue: "Verification Code",
  });

  const syncVerificationCode = (value: string) => {
    setVerificationCode(value.replace(/\D/g, "").slice(0, 6));
  };

  const handleVerify = async () => {
    if (!error || verificationCode.length !== 6) {
      return;
    }

    try {
      setIsVerifying(true);
      setVerificationError(null);

      const resolver: MultiFactorResolver = getMultiFactorResolver(auth, error);

      // Find the TOTP hint
      const totpHint = resolver.hints.find((hint) => hint.factorId === "totp");

      if (!totpHint) {
        setVerificationError(
          t("mfa.errors.noTotpFactor", {
            defaultValue: "No TOTP factor found for this account.",
          }),
        );
        return;
      }

      // Create the TOTP assertion for sign-in
      const assertion = TotpMultiFactorGenerator.assertionForSignIn(
        totpHint.uid,
        verificationCode,
      );

      // Complete the sign-in
      await resolver.resolveSignIn(assertion);
      onSuccess();
      handleClose();
    } catch (err) {
      console.error("MFA verification error:", err);
      // Check Firebase error code for invalid verification code
      const firebaseError = err as { code?: string };
      if (firebaseError.code === "auth/invalid-verification-code") {
        setVerificationError(
          t("mfa.errors.invalidVerificationCode", {
            defaultValue:
              "Invalid verification code. Please check and try again.",
          }),
        );
      } else if (err instanceof Error) {
        setVerificationError(err.message);
      } else {
        setVerificationError(
          t("mfa.errors.unknownError", {
            defaultValue: "An unknown error occurred.",
          }),
        );
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleClose = () => {
    setVerificationCode("");
    setVerificationError(null);
    onClose();
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={({ open: isOpen }) =>
        !isVerifying && !isOpen && handleClose()
      }
      motionPreset="slide-in-bottom"
      lazyMount
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.CloseTrigger asChild>
              <CloseButton disabled={isVerifying} />
            </Dialog.CloseTrigger>
            <Dialog.Header>
              <Dialog.Title>
                {t("mfa.verification.title", {
                  defaultValue: "Two-Factor Authentication",
                })}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <VStack gap={4} align="stretch">
                <Alert.Root
                  colorPalette="primary"
                  borderStartWidth="4px"
                  borderStartColor="primary.solid"
                  borderRadius="xl"
                >
                  <Alert.Indicator>
                    <MaterialSymbol>security</MaterialSymbol>
                  </Alert.Indicator>
                  <Alert.Content>
                    <Alert.Description>
                      {t("mfa.verification.description", {
                        defaultValue:
                          "Enter the 6-digit code from your authenticator app to complete the sign-in.",
                      })}
                    </Alert.Description>
                  </Alert.Content>
                </Alert.Root>

                <Field
                  label={verificationCodeLabel}
                  required
                  invalid={!!verificationError}
                  errorText={verificationError ?? undefined}
                >
                  <Input
                    aria-label={verificationCodeLabel}
                    autoFocus
                    autoComplete="one-time-code"
                    disabled={isVerifying}
                    fontFamily="mono"
                    fontSize="lg"
                    fontVariantNumeric="tabular-nums"
                    fontWeight="semibold"
                    inputMode="numeric"
                    name="verificationCode"
                    onChange={(event) =>
                      syncVerificationCode(event.currentTarget.value)
                    }
                    pattern="[0-9]*"
                    spellCheck={false}
                    textAlign="center"
                    type="text"
                    value={verificationCode}
                  />
                </Field>

                <Text fontSize="sm" color="fg.muted">
                  {t("mfa.verification.hint", {
                    defaultValue:
                      "Open your authenticator app (e.g., Google Authenticator, Authy) to get your verification code.",
                  })}
                </Text>
              </VStack>
            </Dialog.Body>
            <Dialog.Footer>
              <HStack gap={4}>
                <Button
                  variant="outline"
                  onClick={handleClose}
                  disabled={isVerifying}
                >
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </Button>
                <Button
                  colorPalette="primary"
                  onClick={handleVerify}
                  loading={isVerifying}
                  disabled={verificationCode.length !== 6}
                >
                  {t("mfa.verification.verify", { defaultValue: "Verify" })}
                </Button>
              </HStack>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
