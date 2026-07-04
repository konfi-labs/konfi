import { useT } from "@/i18n/client";
import {
  type AdminAuthErrorReason,
  readStoredAdminAuthErrorReason,
} from "@/lib/auth-errors";
import { auth } from "@/lib/firebase/clientApp";
import { Alert, Button, chakra, Heading, Input } from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import {
  Checkbox,
  Field,
  GoogleGIcon,
  TotpMfaVerificationDialog,
} from "@konfi/components";
import { AdminLoginSchema, PASSKEY_USERNAME_AUTOCOMPLETE } from "@konfi/utils";
import { useAuth } from "context/auth";
import { MultiFactorError } from "firebase/auth";
import { useEffect, useState } from "react";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { InferType } from "yup";

type Inputs = InferType<typeof AdminLoginSchema>;

type LoginFormProps = {
  authError?: AdminAuthErrorReason;
};

const LoginForm = ({ authError }: LoginFormProps) => {
  const { t } = useT();
  const {
    actionLoading,
    authorizationError,
    login,
    loginWithGoogle,
    mfaError,
    clearMfaError,
    onMfaSuccess,
  } = useAuth();
  const [showMfaDialog, setShowMfaDialog] = useState(false);
  const {
    control,
    register,
    handleSubmit,
    getValues,
    formState: { errors, touchedFields },
  } = useForm({
    defaultValues: {
      email: "",
      password: "",
      remember: true,
    },
    resolver: yupResolver(AdminLoginSchema),
  });
  const [storedAuthError, setStoredAuthError] =
    useState<AdminAuthErrorReason | null>(null);

  useEffect(() => {
    setStoredAuthError(readStoredAdminAuthErrorReason() ?? null);
  }, []);

  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    const result = await login(
      data.email,
      data.password,
      Boolean(data.remember),
    );
    if (result?.mfaRequired) {
      setShowMfaDialog(true);
    }
  };

  const handleGoogleLogin = async () => {
    const result = await loginWithGoogle(Boolean(getValues("remember")));
    if (result?.mfaRequired) {
      setShowMfaDialog(true);
    }
  };

  useEffect(() => {
    if (mfaError) {
      setShowMfaDialog(true);
    }
  }, [mfaError]);

  const handleMfaClose = () => {
    setShowMfaDialog(false);
    clearMfaError();
  };

  const handleMfaSuccess = () => {
    setShowMfaDialog(false);
    onMfaSuccess();
  };

  const effectiveAuthError = authError ?? authorizationError ?? storedAuthError;

  const authErrorDescription = (() => {
    switch (effectiveAuthError) {
      case "admin-access-required":
        return t("auth.adminAccessRequiredDescription", {
          defaultValue:
            "This Google account is authenticated, but it has not been granted Konfi admin access yet.",
        });
      case "tenant-context-required":
        return t("auth.tenantContextRequiredDescription", {
          defaultValue:
            "This admin app is running in SaaS mode, but no tenant was resolved for this domain. Configure a local tenant or open the tenant domain.",
        });
      case "tenant-membership-required":
        return t("auth.tenantMembershipRequiredDescription", {
          defaultValue:
            "This account is not assigned to this tenant yet. Create the tenant membership in Konfi Cloud, then sign in again.",
        });
      case "session-error":
        return t("auth.sessionErrorDescription", {
          defaultValue:
            "The admin session could not be created. Check the Firebase project and service account configuration.",
        });
      default:
        return null;
    }
  })();

  return (
    <>
      <chakra.form
        onSubmit={handleSubmit(onSubmit)}
        w={["100%", "100%", "100%", "50%"]}
      >
        <Heading mt={"8"} mb={"2"}>
          {t("auth.login", { defaultValue: "Login" })}
        </Heading>
        {authErrorDescription && (
          <Alert.Root status="warning" mt="4">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>
                {t("auth.noAuthorization", {
                  defaultValue: "No authorization",
                })}
              </Alert.Title>
              <Alert.Description>{authErrorDescription}</Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}
        <Field
          label={t("common.email", { defaultValue: "Email" })}
          ids={{ control: "email" }}
          invalid={!!(errors.email && touchedFields.email)}
          errorText={errors.email && errors.email.message}
          required
          mt="6"
        >
          <Input
            id="email"
            placeholder={t("auth.emailPlaceholder", {
              defaultValue: "example@mail.com",
            })}
            type="email"
            autoComplete={PASSKEY_USERNAME_AUTOCOMPLETE}
            spellCheck={false}
            {...register("email")}
          />
        </Field>
        <Field
          label={t("auth.password", { defaultValue: "Password" })}
          ids={{ control: "password" }}
          invalid={!!(errors.password && touchedFields.password)}
          errorText={errors.password && errors.password.message}
          required
          mt="6"
        >
          <Input
            id="password"
            placeholder={t("auth.passwordPlaceholder", {
              defaultValue: "6 or more characters",
            })}
            type="password"
            autoComplete="current-password"
            {...register("password")}
          />
        </Field>
        <Field
          label={""}
          invalid={!!(errors.remember && touchedFields.remember)}
          errorText={errors.remember && errors.remember.message}
          mt="6"
        >
          <Controller
            name={"remember"}
            control={control}
            render={({ field }) => (
              <Checkbox
                name={field.name}
                onCheckedChange={({ checked }) => field.onChange(checked)}
                checked={Boolean(field.value)}
                fontWeight={"600"}
              >
                {t("auth.rememberSession", {
                  defaultValue: "Remember session on this device",
                })}
              </Checkbox>
            )}
          />
        </Field>
        <Button
          mt={"4"}
          mb={"2"}
          display={"block"}
          loading={actionLoading}
          type="submit"
          colorPalette={"primary"}
          w={"100%"}
        >
          {t("auth.loginButton", { defaultValue: "Login" })}
        </Button>
        <Button
          mt={"2"}
          mb={"2"}
          display={"flex"}
          gap={"2.5"}
          justifyContent={"center"}
          loading={actionLoading}
          type="button"
          variant={"outline"}
          w={"100%"}
          onClick={() => void handleGoogleLogin()}
        >
          <GoogleGIcon />
          {t("auth.loginWithGoogle", {
            defaultValue: "Continue with Google",
          })}
        </Button>
      </chakra.form>

      <TotpMfaVerificationDialog
        open={showMfaDialog}
        auth={auth}
        error={mfaError as MultiFactorError | null}
        t={t}
        onClose={handleMfaClose}
        onSuccess={handleMfaSuccess}
      />
    </>
  );
};

export default LoginForm;
