import { useAuth } from "@/context/auth";
import { useT } from "@/i18n/client";
import { auth } from "@/lib/firebase/clientApp";
import {
  Box,
  Button,
  Heading,
  Input,
  Separator,
  Skeleton,
} from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import { AlertDialog, Field, MaterialSymbol } from "@konfi/components";
import { RemoveAccountSchema } from "@konfi/utils";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { InferType } from "yup";

type Inputs = InferType<typeof RemoveAccountSchema>;

const RemoveAccountForm = () => {
  const { loading, removeAccount } = useAuth();
  const { t } = useT();
  const router = useRouter();
  const { lng } = useParams();
  const [open, setOpen] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, touchedFields },
  } = useForm({
    defaultValues: {
      password: "",
    },
    resolver: yupResolver(RemoveAccountSchema),
  });
  const onSubmit: SubmitHandler<Inputs> = (data) => {
    console.log("TEST");
    handleRemoveAccount(data.password);
  };
  async function handleRemoveAccount(password?: string) {
    await removeAccount(password).then(() => {
      router.push(`/${lng}`);
    });
  }

  return (
    <Skeleton loading={loading}>
      {!auth.currentUser?.isAnonymous ? (
        <form>
          <Heading mt={"8"}>
            {t("store.account.removeAccount", {
              defaultValue: "Remove Your Account",
            })}
          </Heading>
          <Field
            label={t("common.password", { defaultValue: "Password" })}
            invalid={!!(errors.password && touchedFields.password)}
            errorText={errors.password?.message}
            required
            mt="6"
          >
            <Input
              id="password"
              placeholder={t("account.passwordPlaceholder", {
                defaultValue: "6 or more characters",
              })}
              type="password"
              autoComplete="new-password"
              {...register("password")}
            />
          </Field>{" "}
          <Separator my={6} />
          <Button onClick={() => setOpen(true)} colorScheme={"red"}>
            <MaterialSymbol>delete</MaterialSymbol>
            {t("account.removeAccount", { defaultValue: "Remove Account" })}
          </Button>
          <AlertDialog
            header={t("account.confirmRemoveAccount", {
              defaultValue: "Are you sure you want to remove your account?",
            })}
            handle={handleSubmit(onSubmit)}
            open={open}
            setOpen={setOpen}
            t={t}
          >
            {t("account.removeAccountWarning", {
              defaultValue:
                "All your information will be removed from our database. This operation cannot be undone, so make sure you really want to remove your account.",
            })}
          </AlertDialog>
        </form>
      ) : (
        <Box>
          {" "}
          <Separator my={6} />
          <Button onClick={() => setOpen(true)} colorScheme={"red"}>
            <MaterialSymbol>delete</MaterialSymbol>
            {t("account.removeAccount", { defaultValue: "Remove Account" })}
          </Button>
          <AlertDialog
            header={t("account.confirmRemoveAccount", {
              defaultValue: "Are you sure you want to remove your account?",
            })}
            handle={() => handleRemoveAccount()}
            open={open}
            setOpen={setOpen}
            t={t}
          >
            {t("account.removeAccountWarning", {
              defaultValue:
                "All your information will be removed from our database. This operation cannot be undone, so make sure you really want to remove your account.",
            })}
          </AlertDialog>
        </Box>
      )}
    </Skeleton>
  );
};

export default RemoveAccountForm;
