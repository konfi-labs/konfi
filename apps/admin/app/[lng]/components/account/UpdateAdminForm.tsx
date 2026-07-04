import { updateAdminAction } from "@/actions/admin-management";
import { useT } from "@/i18n/client";
import { Button, Heading, Input, Skeleton } from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import { Field, toaster } from "@konfi/components";
import { UpdateAdminSchema } from "@konfi/utils";
import { useAuth } from "context/auth";
import { SubmitHandler, useForm } from "react-hook-form";
import { InferType } from "yup";

type Inputs = InferType<typeof UpdateAdminSchema>;

const UpdateAdminForm = () => {
  const { loading } = useAuth();
  const { t } = useT();

  const {
    register,
    handleSubmit,
    formState: { errors, touchedFields },
  } = useForm({
    defaultValues: {
      email: "",
      accessLevel: 1,
    },
    resolver: yupResolver(UpdateAdminSchema),
  });
  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    const promise = updateAdminAction({
      email: data.email,
      accessLevel: data.accessLevel,
    });
    toaster.promise(promise, {
      loading: {
        title: t("toasts.admin.updating", {
          defaultValue: "Updating administrator...",
        }),
      },
      success: {
        title: t("toasts.admin.updated", {
          defaultValue: "Administrator updated",
        }),
        description: t("toasts.admin.updatedDescription", {
          defaultValue: "Successfully updated administrator {{name}}",
          name: data.email,
        }),
      },
      error: (err: unknown) => ({
        title: t("toasts.admin.notUpdated", {
          defaultValue: "Administrator was not updated, error code: {{error}}",
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
          {t("admin.updateAdmin", { defaultValue: "Update Administrator" })}
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
        <Field
          label={t("admin.accessLevel", { defaultValue: "Access Level" })}
          invalid={!!(errors.accessLevel && touchedFields.accessLevel)}
          errorText={errors.accessLevel?.message}
          required
          mt="6"
        >
          <Input
            id="accessLevel"
            placeholder={"1"}
            type="number"
            {...register("accessLevel")}
          />
        </Field>
        <Button
          mt={6}
          loading={loading}
          type={"submit"}
          colorPalette={"primary"}
        >
          {t("common.update", { defaultValue: "Update" })}
        </Button>
      </form>
    </Skeleton>
  );
};

export default UpdateAdminForm;
