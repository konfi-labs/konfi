"use client";

import { useAuth } from "@/context/auth";
import { useT } from "@/i18n/client";
import { PasswordChangeForm as SharedPasswordChangeForm } from "@konfi/components";

const PasswordChangeForm = () => {
  const { loading, passwordChange } = useAuth();
  const { t } = useT();

  return (
    <SharedPasswordChangeForm
      loading={loading}
      labels={{
        title: t("account.resetPassword", {
          defaultValue: "Reset your password",
        }),
        oldPassword: t("account.oldPassword", { defaultValue: "Old Password" }),
        newPassword: t("account.newPassword", { defaultValue: "New Password" }),
        confirmPassword: t("account.confirmNewPassword", {
          defaultValue: "Confirm new password",
        }),
        save: t("actions.save", { defaultValue: "Save" }),
      }}
      onPasswordChange={passwordChange}
    />
  );
};

export default PasswordChangeForm;
