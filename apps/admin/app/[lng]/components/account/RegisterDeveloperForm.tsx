import { registerDeveloper } from "@/actions";
import { useT } from "@/i18n/client";
import { Button, Heading, Input, Skeleton } from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import { Field, toaster } from "@konfi/components";
import { RegisterDeveloperSchema } from "@konfi/utils";
import { useAuth } from "context/auth";
import { SubmitHandler, useForm } from "react-hook-form";
import { InferType } from "yup";

type Inputs = InferType<typeof RegisterDeveloperSchema>;

const RegisterDeveloperForm = () => {
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
    resolver: yupResolver(RegisterDeveloperSchema),
  });
  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    const promise = registerDeveloper(data.email);
    toaster.promise(promise, {
      loading: {
        title: t("toasts.admin.creating", {
          defaultValue: "Creating administrator...",
        }),
      },
      success: {
        title: t("toasts.admin.created", {
          defaultValue: "Administrator created",
        }),
        description: t("toasts.admin.createdDescription", {
          defaultValue: "Successfully created administrator {{name}}",
          name: data.email,
        }),
      },
      error: (err: unknown) => ({
        title: t("toasts.admin.notCreated", {
          defaultValue: "Administrator was not created, error code: {{error}}",
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
          {t("admin.registerDeveloper", { defaultValue: "Register Developer" })}
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
            placeholder={t("admin.emailPlaceholder", {
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
          {t("common.register", { defaultValue: "Register" })}
        </Button>
      </form>
    </Skeleton>
  );
};

export default RegisterDeveloperForm;
