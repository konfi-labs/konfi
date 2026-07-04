import { useT } from "@/i18n/client";
import { Button, chakra } from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import { MultiOptionSelectFieldController, toaster } from "@konfi/components";
import { CarriedOutBySchema } from "@konfi/utils";
import { useConfigurationMembers } from "context/configuration";
import { useMemo } from "react";
import {
  Controller,
  FormProvider,
  SubmitHandler,
  useForm,
} from "react-hook-form";
import { InferType } from "yup";

type Inputs = InferType<typeof CarriedOutBySchema>;

const CarriedOutByForm = ({
  carriedOutBy,
  updateCarriedOutBy,
}: {
  carriedOutBy?: string[];
  updateCarriedOutBy?: (carriedOutBy: string[]) => void;
}) => {
  const { filteredMembers } = useConfigurationMembers();
  const { t } = useT();
  const carriedOutByOptions = useMemo(
    () =>
      filteredMembers
        ? filteredMembers?.map((member) => ({
            label: member.name,
            value: member.name,
          }))
        : [],
    [filteredMembers],
  );
  const formMethods = useForm({
    defaultValues: {
      carriedOutBy: carriedOutBy || [],
    },
    resolver: yupResolver(CarriedOutBySchema),
  });
  const { control, handleSubmit } = formMethods;
  const onSubmit: SubmitHandler<Inputs> = (data) => {
    if (!updateCarriedOutBy) {
      toaster.error({
        title: t("error.general", { defaultValue: "Error" }),
        description: t("carried_out_by.update_failed", {
          defaultValue: "Failed to update executors",
        }),
      });
      return;
    }
    updateCarriedOutBy(data.carriedOutBy);
  };

  return (
    <FormProvider {...formMethods}>
      <chakra.form
        onSubmit={handleSubmit(onSubmit)}
        w={["100%", "100%", "100%", "100%"]}
      >
        <Controller
          name={"carriedOutBy"}
          control={control}
          render={({ field }) => (
            <MultiOptionSelectFieldController
              _field={{
                name: field.name,
                placeholder: t("admin.selectExecutors"),
              }}
              options={carriedOutByOptions}
              t={t}
            />
          )}
        />
        <Button
          mt={"4"}
          mb={"2"}
          display={"block"}
          type="submit"
          colorPalette={"primary"}
          w={"100%"}
        >
          {carriedOutBy ? t("common.update") : t("common.add")}
        </Button>
      </chakra.form>
    </FormProvider>
  );
};

export default CarriedOutByForm;
