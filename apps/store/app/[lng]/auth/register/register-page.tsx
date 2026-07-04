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
import { AUTH_LOGIN, RegisterSchema } from "@konfi/utils";
import { MultiFactorError } from "firebase/auth";
import { useEffect, useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { InferType } from "yup";

type Inputs = InferType<typeof RegisterSchema>;

export default function RegisterPage() {
  const { t, i18n } = useT();
  const {
    loading,
    register: authRegister,
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
      displayName: "",
      email: "",
      password: "",
    },
    resolver: yupResolver(RegisterSchema),
  });
  const onSubmit: SubmitHandler<Inputs> = (data) =>
    authRegister(data.email, data.password, data.displayName);

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
            {t("auth.register.tagline")}
          </Heading>
        </Flex>
      </GridItem>
      <GridItem alignContent={"center"}>
        <Box position={"absolute"} top={8} right={8}>
          {" "}
          <Link
            lng={i18n.resolvedLanguage}
            href={AUTH_LOGIN}
            color={"gray.300"}
          >
            {t("auth.register.loginLink")}
          </Link>
        </Box>
        <Center m={8}>
          <chakra.form
            onSubmit={handleSubmit(onSubmit)}
            w={["100%", "100%", "100%", "50%"]}
          >
            <Heading mt="8">{t("auth.register.title")}</Heading>{" "}
            <Button
              mt="6"
              variant="outline"
              loading={loading}
              type="button"
              w="100%"
              gap="2.5"
              onClick={() => {
                void handleGoogleSignIn();
              }}
            >
              <GoogleGIcon />
              {t("auth.google.button", {
                defaultValue: "Continue with Google",
              })}
            </Button>
            <Flex align="center" gap="4" mt="6" mb="2">
              <Separator flex="1" />
              <Text color="fg.muted" fontSize="sm">
                {t("auth.google.divider", {
                  defaultValue: "or continue with email",
                })}
              </Text>
              <Separator flex="1" />
            </Flex>
            <Field
              label={t("auth.register.displayNameLabel")}
              invalid={!!(errors.displayName && touchedFields.displayName)}
              errorText={errors.displayName?.message}
              required
            >
              <Input
                id="displayName"
                placeholder={t("auth.register.displayNamePlaceholder")}
                autoComplete="name"
                {...register("displayName")}
              />
            </Field>{" "}
            <Field
              label={t("auth.register.emailLabel")}
              invalid={!!(errors.email && touchedFields.email)}
              errorText={errors.email?.message}
              required
              mt="6"
            >
              <Input
                id="email"
                placeholder={t("auth.register.emailPlaceholder")}
                type="email"
                autoComplete="email"
                {...register("email")}
              />
            </Field>{" "}
            <Field
              label={t("auth.register.passwordLabel")}
              invalid={!!(errors.password && touchedFields.password)}
              errorText={errors.password?.message}
              helperText={t("auth.register.passwordHelperText")}
              required
              mt="6"
            >
              <Input
                id="password"
                placeholder={t("auth.register.passwordPlaceholder")}
                type="password"
                autoComplete="new-password"
                {...register("password")}
              />
            </Field>{" "}
            <Button
              mt="6"
              loading={loading}
              type="submit"
              colorPalette={"primary"}
              w={"100%"}
            >
              {t("auth.register.registerButton")}
            </Button>
            <Text fontSize={"sm"} mt={"4"} alignSelf={"center"}>
              {t("auth.register.termsText")}{" "}
              <Link lng={i18n.resolvedLanguage} href={"/help/regulations"}>
                {t("auth.register.termsLink")}
              </Link>
              <br />
              {t("auth.register.andText")}{" "}
              <Link lng={i18n.resolvedLanguage} href={"/help/privacy-policy"}>
                {t("auth.register.privacyPolicyLink")}
              </Link>
              .
            </Text>
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
