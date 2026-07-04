"use client";

import {
  Box,
  Button,
  Center,
  chakra,
  Flex,
  GridItem,
  Heading,
  Input,
  SimpleGrid,
} from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import { Field, Link, LinkOverlay, Logo } from "@konfi/components";
import { AUTH_LOGIN, ForgotSchema } from "@konfi/utils";
import { SubmitHandler, useForm } from "react-hook-form";
import { InferType } from "yup";
import { useAuth } from "@/context/auth";
import { useT } from "@/i18n/client";

type Inputs = InferType<typeof ForgotSchema>;

export default function ForgotPage() {
  const { t, i18n } = useT();
  const { loading, forgot } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors, touchedFields },
  } = useForm({
    defaultValues: {
      email: "",
    },
    resolver: yupResolver(ForgotSchema),
  });
  const onSubmit: SubmitHandler<Inputs> = (data) => forgot(data.email);

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
          </LinkOverlay>
          <Heading color={"white"} size={["4xl", "4xl", "5xl", "5xl"]}>
            {t("auth.forgot.heroHeading", {
              defaultValue: "Bring your ideas to life with us today!",
            })}
          </Heading>
        </Flex>
      </GridItem>
      <GridItem alignContent={"center"}>
        <Box position={"absolute"} top={8} right={8}>
          <Link
            lng={i18n.resolvedLanguage}
            href={AUTH_LOGIN}
            color={"gray.300"}
          >
            {t("auth.login.loginButton", { defaultValue: "Login" })}
          </Link>
        </Box>
        <Center m={8}>
          <chakra.form
            onSubmit={handleSubmit(onSubmit)}
            w={["100%", "100%", "100%", "50%"]}
          >
            <Heading mt={"8"}>
              {t("auth.forgot.title", {
                defaultValue: "Reset your password",
              })}
            </Heading>
            <Field
              mt={"6"}
              label={"E-mail"}
              invalid={!!(errors.email && touchedFields.email)}
              errorText={errors.email?.message}
              required
            >
              <Input
                id="email"
                placeholder={t("auth.login.emailPlaceholder", {
                  defaultValue: "example@mail.com",
                })}
                type="email"
                autoComplete="email"
                {...register("email")}
              />
            </Field>
            <Button
              mt={6}
              loading={loading}
              type={"submit"}
              colorPalette={"primary"}
              w={"100%"}
            >
              {t("auth.forgot.submitButton", { defaultValue: "Submit" })}
            </Button>
          </chakra.form>
        </Center>
      </GridItem>
    </SimpleGrid>
  );
}
