"use client";

import { Button, Heading, Input, Separator, Skeleton } from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import { PasswordChangeSchema } from "@konfi/utils";
import { SubmitHandler, useForm } from "react-hook-form";
import { InferType } from "yup";
import { Field } from "../../ui";

type Inputs = InferType<typeof PasswordChangeSchema>;

export interface PasswordChangeFormLabels {
  title: string;
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
  save: string;
}

interface PasswordChangeFormProps {
  loading: boolean;
  labels: PasswordChangeFormLabels;
  onPasswordChange: (oldPassword: string, newPassword: string) => void;
}

const PasswordChangeForm = ({
  loading,
  labels,
  onPasswordChange,
}: PasswordChangeFormProps) => {
  const {
    register,
    handleSubmit,
    formState: { errors, touchedFields },
  } = useForm({
    defaultValues: {
      oldPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    resolver: yupResolver(PasswordChangeSchema),
  });
  const onSubmit: SubmitHandler<Inputs> = (data) =>
    onPasswordChange(data.oldPassword, data.newPassword);

  return (
    <Skeleton loading={loading}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Heading mt={"8"}>{labels.title}</Heading>
        <Field
          label={labels.oldPassword}
          invalid={!!(errors.oldPassword && touchedFields.oldPassword)}
          errorText={errors.oldPassword?.message}
          required
          mt="6"
        >
          <Input
            id="oldPassword"
            placeholder="*********"
            type="password"
            autoComplete="current-password"
            {...register("oldPassword")}
          />
        </Field>
        <Field
          label={labels.newPassword}
          invalid={!!(errors.newPassword && touchedFields.newPassword)}
          errorText={errors.newPassword?.message}
          required
          mt="6"
        >
          <Input
            id="newPassword"
            placeholder="*********"
            type="password"
            autoComplete="new-password"
            {...register("newPassword")}
          />
        </Field>
        <Field
          label={labels.confirmPassword}
          invalid={!!(errors.confirmPassword && touchedFields.confirmPassword)}
          errorText={errors.confirmPassword?.message}
          required
          mt="6"
        >
          <Input
            id="confirmPassword"
            placeholder="*********"
            type="password"
            autoComplete="new-password"
            {...register("confirmPassword")}
          />
        </Field>
        <Separator mt={6} />
        <Button
          mt={6}
          loading={loading}
          type={"submit"}
          colorPalette={"primary"}
        >
          {labels.save}
        </Button>
      </form>
    </Skeleton>
  );
};

export default PasswordChangeForm;
