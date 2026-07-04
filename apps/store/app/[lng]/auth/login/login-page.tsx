"use client";

import { useAuth } from "@/context/auth";
import { useT } from "@/i18n/client";
import { auth } from "@/lib/firebase/clientApp";
import {
  Box,
  Button,
  Center,
  chakra,
  Flex,
  GridItem,
  Heading,
  Input,
  Separator,
  SimpleGrid,
  Text,
} from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import {
  Field,
  GoogleGIcon,
  Link,
  LinkOverlay,
  Logo,
  TotpMfaVerificationDialog,
} from "@konfi/components";
import {
  AUTH_FORGOT,
  AUTH_REGISTER,
  LoginSchema,
  PASSKEY_USERNAME_AUTOCOMPLETE,
} from "@konfi/utils";
import { MultiFactorError } from "firebase/auth";
import { useEffect, useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { InferType } from "yup";

type Inputs = InferType<typeof LoginSchema>;

export default function LoginPage() {
  const { t, i18n } = useT();
  const {
    loading,
    login,
    loginWithGoogle,
    mfaError,
    clearMfaError,
    onMfaSuccess,
  } = useAuth();
  const [showMfaDialog, setShowMfaDialog] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, touchedFields },
  } = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    resolver: yupResolver(LoginSchema),
  });
  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    const result = await login(data.email, data.password);
    if (result?.mfaRequired) {
      setShowMfaDialog(true);
    }
  };

  const handleGoogleSignIn = async () => {
    const result = await loginWithGoogle();
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

  return (
    <SimpleGrid
      columns={[1, 1, 2, 2]}
      gap={0}
      position={"absolute"}
      left={0}
      top={0}
      w={"100vw"}
      h={"100vh"}
    >
      <GridItem h={"100%"} bgImage={`url(/assets/bg.avif)`} bgRepeat={"round"}>
        <Flex
          h={"93%"}
          mx={8}
          my={8}
          flexDir={"column"}
          justify={"space-between"}
        >
          <LinkOverlay
            lng={i18n.resolvedLanguage}
            href={"/"}
            mr={"auto"}
            width={"100px"}
            height={"auto"}
            filter={"invert(1)"}
          >
            <Logo />
          </LinkOverlay>{" "}
          <Heading color={"white"} size={["4xl", "4xl", "5xl", "5xl"]}>
            {t("auth.login.tagline")}
          </Heading>
        </Flex>
      </GridItem>
      <GridItem alignContent={"center"}>
        <Box position={"absolute"} top={8} right={8}>
          {" "}
          <Link
            lng={i18n.resolvedLanguage}
            href={AUTH_REGISTER}
            color={"gray.300"}
          >
            {t("auth.login.registerLink")}
          </Link>
        </Box>
        <Center m={8}>
          <chakra.form
            onSubmit={handleSubmit(onSubmit)}
            w={["100%", "100%", "100%", "50%"]}
          >
            {" "}
            <Heading mt={"8"} mb={"2"}>
              {t("auth.login.title")}
            </Heading>
            <Link lng={i18n.resolvedLanguage} href={"/auth/register"}>
              {t("auth.login.noAccountText")}
            </Link>{" "}
            <Button
              mt={"6"}
              variant={"outline"}
              loading={loading}
              type="button"
              w={"100%"}
              gap={"2.5"}
              onClick={() => {
                void handleGoogleSignIn();
              }}
            >
              <GoogleGIcon />
              {t("auth.google.button", {
                defaultValue: "Continue with Google",
              })}
            </Button>
            <Flex align={"center"} gap={"4"} mt={"6"} mb={"2"}>
              <Separator flex={"1"} />
              <Text color={"fg.muted"} fontSize={"sm"}>
                {t("auth.google.divider", {
                  defaultValue: "or continue with email",
                })}
              </Text>
              <Separator flex={"1"} />
            </Flex>
            <Field
              label={t("auth.login.emailLabel")}
              invalid={!!(errors.email && touchedFields.email)}
              errorText={errors.email?.message}
              required
            >
              <Input
                id="email"
                placeholder={t("auth.login.emailPlaceholder")}
                type="email"
                autoComplete={PASSKEY_USERNAME_AUTOCOMPLETE}
                {...register("email")}
              />
            </Field>
            <Field
              mt={"6"}
              label={t("auth.login.passwordLabel")}
              invalid={!!(errors.password && touchedFields.password)}
              errorText={errors.password?.message}
              required
            >
              <Input
                id="password"
                placeholder={t("auth.login.passwordPlaceholder")}
                type="password"
                autoComplete="current-password"
                {...register("password")}
              />
            </Field>{" "}
            <Button
              mt={"4"}
              mb={"2"}
              display={"block"}
              loading={loading}
              type="submit"
              colorPalette={"primary"}
              w={"100%"}
            >
              {t("auth.login.loginButton")}
            </Button>
            <Link lng={i18n.resolvedLanguage} href={AUTH_FORGOT}>
              {t("auth.login.forgotPasswordLink")}
            </Link>
          </chakra.form>
        </Center>
      </GridItem>

      <TotpMfaVerificationDialog
        open={showMfaDialog}
        auth={auth}
        error={mfaError as MultiFactorError | null}
        t={t}
        onClose={handleMfaClose}
        onSuccess={handleMfaSuccess}
      />
    </SimpleGrid>
  );
}
