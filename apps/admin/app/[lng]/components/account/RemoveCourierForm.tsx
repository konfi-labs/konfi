import { removeCourierAction } from "@/actions/admin-management";
import { useT } from "@/i18n/client";
import { Button, Heading, Input, Skeleton } from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import { Field, toaster } from "@konfi/components";
import { RemoveAdminSchema } from "@konfi/utils";
import { useAuth } from "context/auth";
import { SubmitHandler, useForm } from "react-hook-form";
import { InferType } from "yup";

type Inputs = InferType<typeof RemoveAdminSchema>;

const RemoveCourierForm = () => {
  const { loading } = useAuth();
  const { t } = useT();

  const {
    register,
    handleSubmit,
    formState: { errors, touchedFields },
  } = useForm({
    defaultValues: {
      email: "",
    },
    resolver: yupResolver(RemoveAdminSchema),
  });
  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    const promise = removeCourierAction({ email: data.email });
    toaster.promise(promise, {
      loading: {
        title: t("toasts.courier.removing", {
          defaultValue: "Removing courier...",
        }),
      },
      success: {
        title: t("toasts.courier.removed", { defaultValue: "Courier removed" }),
        description: t("toasts.courier.removedDescription", {
          defaultValue: "Successfully removed courier {{name}}",
          name: data.email,
        }),
      },
      error: (err: unknown) => ({
        title: t("toasts.courier.notRemoved", {
          defaultValue: "Courier was not removed, error code: {{error}}",
          error: err instanceof Error ? err.message : String(err),
        }),
      }),
    });
    await promise;
  };

  return (
    <Skeleton loading={loading}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Heading mt={"8"}>
          {t("courier.removeCourier", { defaultValue: "Remove Courier" })}
        </Heading>
        <Field
          label={t("common.email", { defaultValue: "Email" })}
          invalid={!!(errors.email && touchedFields.email)}
          errorText={errors.email?.message}
          required
          mt="6"
        >
          <Input
            id="email"
            placeholder={t("courier.emailPlaceholder", {
              defaultValue: "name@domain.com",
            })}
            type="email"
            autoComplete="email"
            {...register("email")}
          />
        </Field>
        <Button mt={6} loading={loading} type={"submit"} colorPalette={"red"}>
          {t("common.remove", { defaultValue: "Remove" })}
        </Button>
      </form>
    </Skeleton>
  );
};

export default RemoveCourierForm;
