"use client";

import { useT } from "@/i18n/client";
import { PasswordChangeForm as SharedPasswordChangeForm } from "@konfi/components";
import { useAuth } from "context/auth";

const PasswordChangeForm = () => {
  const { actionLoading, passwordChange } = useAuth();
  const { t } = useT();

  return (
    <SharedPasswordChangeForm
      loading={actionLoading}
      labels={{
        title: t("admin.resetPassword", {
          defaultValue: "Reset Your Password",
        }),
        oldPassword: t("admin.oldPassword", { defaultValue: "Old Password" }),
        newPassword: t("admin.newPassword", { defaultValue: "New Password" }),
        confirmPassword: t("admin.confirmPassword", {
          defaultValue: "Confirm New Password",
        }),
        save: t("common.save", { defaultValue: "Save" }),
      }}
      onPasswordChange={passwordChange}
    />
  );
};

export default PasswordChangeForm;
