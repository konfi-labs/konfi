import { addCourierAction } from "@/actions/admin-management";
import { useT } from "@/i18n/client";
import { Button, Heading, Input, Skeleton } from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import { Field, toaster } from "@konfi/components";
import { AddAdminSchema } from "@konfi/utils";
import { useAuth } from "context/auth";
import { SubmitHandler, useForm } from "react-hook-form";
import { InferType } from "yup";

type Inputs = InferType<typeof AddAdminSchema>;

const AddCourierForm = () => {
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
    resolver: yupResolver(AddAdminSchema),
  });
  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    const promise = addCourierAction({ email: data.email });
    toaster.promise(promise, {
      loading: {
        title: t("toasts.courier.creating", {
          defaultValue: "Creating courier...",
        }),
      },
      success: {
        title: t("toasts.courier.created", { defaultValue: "Courier created" }),
        description: t("toasts.courier.createdDescription", {
          defaultValue: "Successfully created courier {{name}}",
          name: data.email,
        }),
      },
      error: (err: unknown) => ({
        title: t("toasts.courier.notCreated", {
          defaultValue: "Courier was not created, error code: {{error}}",
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
          {t("courier.addCourier", { defaultValue: "Add Courier" })}
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
        <Button
          mt={6}
          loading={loading}
          type={"submit"}
          colorPalette={"primary"}
        >
          {t("common.add", { defaultValue: "Add" })}
        </Button>
      </form>
    </Skeleton>
  );
};

export default AddCourierForm;
