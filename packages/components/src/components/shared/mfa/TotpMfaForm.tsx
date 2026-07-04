"use client";

import { Heading, Skeleton, Text } from "@chakra-ui/react";
import { FirebaseError } from "firebase/app";
import {
  type Auth,
  multiFactor,
  sendEmailVerification,
  TotpMultiFactorGenerator,
  TotpSecret,
} from "firebase/auth";
import { TFunction } from "i18next";
import { useCallback, useEffect, useState } from "react";
import { toaster } from "../../ui";
import TotpEnrollmentSetup from "./TotpEnrollmentSetup";
import TotpEnrollmentStatus from "./TotpEnrollmentStatus";
import type { EnrolledFactor } from "./totpMfaTypes";
import TotpUnenrollDialog from "./TotpUnenrollDialog";

type EnrollmentStep = "idle" | "setup" | "verify";

interface TotpMfaFormProps {
  auth: Auth;
  t: TFunction;
  defaultIssuerName?: string;
}

const TotpMfaForm = ({
  auth,
  t,
  defaultIssuerName = "Konfi",
}: TotpMfaFormProps) => {
  const [loading, setLoading] = useState(true);
  const [enrolledFactors, setEnrolledFactors] = useState<EnrolledFactor[]>([]);
  const [enrollmentStep, setEnrollmentStep] = useState<EnrollmentStep>("idle");
  const [totpSecret, setTotpSecret] = useState<TotpSecret | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isUnenrolling, setIsUnenrolling] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const [unenrollDialogOpen, setUnenrollDialogOpen] = useState(false);
  const [factorToUnenroll, setFactorToUnenroll] =
    useState<EnrolledFactor | null>(null);

  const loadEnrolledFactors = useCallback(() => {
    const user = auth.currentUser;
    if (user) {
      setIsEmailVerified(user.emailVerified);
      const mfaUser = multiFactor(user);
      const factors = mfaUser.enrolledFactors.map((factor) => ({
        uid: factor.uid,
        displayName: factor.displayName,
        factorId: factor.factorId,
        enrollmentTime: factor.enrollmentTime,
      }));
      setEnrolledFactors(factors);
    } else {
      setIsEmailVerified(false);
    }
    setLoading(false);
  }, [auth]);

  useEffect(() => {
    loadEnrolledFactors();
  }, [loadEnrolledFactors]);

  const hasTotpEnrolled = enrolledFactors.some(
    (factor) => factor.factorId === "totp",
  );

  const getRecentLoginError = (error: unknown) => {
    if (
      error instanceof FirebaseError &&
      error.code === "auth/requires-recent-login"
    ) {
      return {
        title: t("mfa.errors.recentLoginRequiredTitle", {
          defaultValue: "Re-authentication required",
        }),
        description: t("mfa.errors.recentLoginRequiredDescription", {
          defaultValue:
            "For security reasons, please sign in again and retry this action.",
        }),
      };
    }
    return null;
  };

  const startEnrollment = async () => {
    const user = auth.currentUser;
    if (!user) {
      toaster.error({
        title: t("mfa.errors.notAuthenticated", {
          defaultValue: "Not authenticated",
        }),
        description: t("mfa.errors.notAuthenticatedDescription", {
          defaultValue: "Please log in to enable MFA.",
        }),
      });
      return;
    }

    if (!user.emailVerified) {
      toaster.error({
        title: t("mfa.errors.emailNotVerified", {
          defaultValue: "Email not verified",
        }),
        description: t("mfa.errors.emailNotVerifiedDescription", {
          defaultValue:
            "Verify your email address before enabling two-factor authentication.",
        }),
      });
      return;
    }

    try {
      setIsEnrolling(true);
      const mfaUser = multiFactor(user);
      const session = await mfaUser.getSession();
      const secret = await TotpMultiFactorGenerator.generateSecret(session);
      setTotpSecret(secret);
      setEnrollmentStep("setup");
    } catch (error) {
      console.error("Error starting TOTP enrollment:", error);
      const recentLoginError = getRecentLoginError(error);
      if (recentLoginError) {
        toaster.error(recentLoginError);
      } else {
        toaster.error({
          title: t("mfa.errors.enrollmentFailed", {
            defaultValue: "Enrollment failed",
          }),
          description:
            error instanceof Error
              ? error.message
              : t("mfa.errors.unknownError", {
                  defaultValue: "An unknown error occurred.",
                }),
        });
      }
    } finally {
      setIsEnrolling(false);
    }
  };

  const verifyAndEnroll = async () => {
    const user = auth.currentUser;
    if (!user || !totpSecret) {
      return;
    }

    if (verificationCode.length !== 6) {
      toaster.error({
        title: t("mfa.errors.invalidCode", {
          defaultValue: "Invalid code",
        }),
        description: t("mfa.errors.codeLength", {
          defaultValue: "Please enter a 6-digit code.",
        }),
      });
      return;
    }

    try {
      setIsEnrolling(true);
      const mfaUser = multiFactor(user);
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(
        totpSecret,
        verificationCode,
      );
      await mfaUser.enroll(
        assertion,
        t("mfa.factorName", { defaultValue: "Authenticator App" }),
      );

      toaster.success({
        title: t("mfa.success.enrolled", {
          defaultValue: "MFA enabled",
        }),
        description: t("mfa.success.enrolledDescription", {
          defaultValue:
            "Two-factor authentication has been enabled for your account.",
        }),
      });

      // Reset state and reload factors
      setEnrollmentStep("idle");
      setTotpSecret(null);
      setVerificationCode("");
      loadEnrolledFactors();
    } catch (error) {
      console.error("Error completing TOTP enrollment:", error);
      const recentLoginError = getRecentLoginError(error);
      if (recentLoginError) {
        toaster.error(recentLoginError);
      } else {
        toaster.error({
          title: t("mfa.errors.verificationFailed", {
            defaultValue: "Verification failed",
          }),
          description:
            error instanceof Error
              ? error.message
              : t("mfa.errors.unknownError", {
                  defaultValue: "An unknown error occurred.",
                }),
        });
      }
    } finally {
      setIsEnrolling(false);
    }
  };

  const cancelEnrollment = () => {
    setEnrollmentStep("idle");
    setTotpSecret(null);
    setVerificationCode("");
  };

  const resendVerificationEmail = async () => {
    const user = auth.currentUser;
    if (!user) {
      toaster.error({
        title: t("mfa.errors.notAuthenticated", {
          defaultValue: "Not authenticated",
        }),
        description: t("mfa.errors.notAuthenticatedDescription", {
          defaultValue: "Please log in to enable MFA.",
        }),
      });
      return;
    }

    try {
      setIsSendingVerification(true);
      await sendEmailVerification(user);
      toaster.success({
        title: t("mfa.emailVerification.sentTitle", {
          defaultValue: "Verification email sent",
        }),
        description: t("mfa.emailVerification.sentDescription", {
          defaultValue:
            "Check your inbox and follow the link to verify your email address.",
        }),
      });
    } catch (error) {
      console.error("Error sending verification email:", error);
      const recentLoginError = getRecentLoginError(error);
      if (recentLoginError) {
        toaster.error(recentLoginError);
      } else {
        toaster.error({
          title: t("mfa.emailVerification.sendFailed", {
            defaultValue: "Failed to send verification email",
          }),
          description:
            error instanceof Error
              ? error.message
              : t("mfa.errors.unknownError", {
                  defaultValue: "An unknown error occurred.",
                }),
        });
      }
    } finally {
      setIsSendingVerification(false);
    }
  };

  const openUnenrollDialog = (factor: EnrolledFactor) => {
    setFactorToUnenroll(factor);
    setUnenrollDialogOpen(true);
  };

  const confirmUnenroll = async () => {
    const user = auth.currentUser;
    if (!user || !factorToUnenroll) {
      return;
    }

    try {
      setIsUnenrolling(true);
      const mfaUser = multiFactor(user);
      const factorInfo = mfaUser.enrolledFactors.find(
        (f) => f.uid === factorToUnenroll.uid,
      );

      if (factorInfo) {
        await mfaUser.unenroll(factorInfo);
        toaster.success({
          title: t("mfa.success.unenrolled", {
            defaultValue: "MFA disabled",
          }),
          description: t("mfa.success.unenrolledDescription", {
            defaultValue:
              "Two-factor authentication has been disabled for your account.",
          }),
        });
        loadEnrolledFactors();
      }
    } catch (error) {
      console.error("Error unenrolling TOTP:", error);
      const recentLoginError = getRecentLoginError(error);
      if (recentLoginError) {
        toaster.error(recentLoginError);
      } else {
        toaster.error({
          title: t("mfa.errors.unenrollFailed", {
            defaultValue: "Failed to disable MFA",
          }),
          description:
            error instanceof Error
              ? error.message
              : t("mfa.errors.unknownError", {
                  defaultValue: "An unknown error occurred.",
                }),
        });
      }
    } finally {
      setIsUnenrolling(false);
      setUnenrollDialogOpen(false);
      setFactorToUnenroll(null);
    }
  };

  const getQrCodeUri = () => {
    if (!totpSecret || !auth.currentUser?.email) return "";
    return totpSecret.generateQrCodeUrl(
      auth.currentUser.email,
      t("mfa.issuerName", { defaultValue: defaultIssuerName }),
    );
  };

  return (
    <Skeleton loading={loading}>
      <Heading mt={"8"}>
        {t("mfa.title", { defaultValue: "Two-Factor Authentication" })}
      </Heading>
      <Text color="fg.muted" mt={2}>
        {t("mfa.description", {
          defaultValue:
            "Add an extra layer of security to your account by enabling two-factor authentication using an authenticator app.",
        })}
      </Text>

      {enrollmentStep === "idle" && (
        <TotpEnrollmentStatus
          enrolledFactors={enrolledFactors}
          hasTotpEnrolled={hasTotpEnrolled}
          isEmailVerified={isEmailVerified}
          isEnrolling={isEnrolling}
          isSendingVerification={isSendingVerification}
          t={t}
          onOpenUnenrollDialog={openUnenrollDialog}
          onResendVerificationEmail={resendVerificationEmail}
          onStartEnrollment={startEnrollment}
        />
      )}

      {enrollmentStep === "setup" && totpSecret && (
        <TotpEnrollmentSetup
          isEnrolling={isEnrolling}
          qrCodeUri={getQrCodeUri()}
          secretKey={totpSecret.secretKey}
          t={t}
          verificationCode={verificationCode}
          onCancel={cancelEnrollment}
          onVerify={verifyAndEnroll}
          onVerificationCodeChange={setVerificationCode}
        />
      )}

      <TotpUnenrollDialog
        open={unenrollDialogOpen}
        isUnenrolling={isUnenrolling}
        t={t}
        onConfirm={confirmUnenroll}
        onOpenChange={(open) => !isUnenrolling && setUnenrollDialogOpen(open)}
      />
    </Skeleton>
  );
};

export default TotpMfaForm;
