import { useT } from "@/i18n/client";
import { createChannelAction, updateChannelAction } from "@/actions/channels";
import { CreateToasterReturn } from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import { CustomDialog, FormController, toaster } from "@konfi/components";
import { Channel, CurrencyEnum, FormTypes } from "@konfi/types";
import {
  ChannelCreateSchema,
  channelForm,
  ChannelUpdateSchema,
  getIconByFormType,
} from "@konfi/utils";
import { useChannels } from "context/channels";
import { useConfiguration } from "context/configuration";
import { isNull, isUndefined } from "es-toolkit";
import { Dispatch, SetStateAction, useEffect } from "react";
import { useForm } from "react-hook-form";
import { InferType } from "yup";
import { By } from "../form/field-controllers/By";

type CreateInput = InferType<typeof ChannelCreateSchema>;
type UpdateInput = InferType<typeof ChannelUpdateSchema>;

export const ChannelForm = ({
  channel,
  type,
  open,
  setOpen,
}: {
  channel?: Channel;
  type: keyof typeof FormTypes;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}) => {
  const { t, i18n } = useT();
  const { refreshChannels } = useChannels();
  const label = `${t(`FormTypes.${type}`)} Kanał`;
  const { channel: _channel } = useChannels();
  const { warehousesAsOptions } = useConfiguration();
  const CreateSchemaYupResolver = yupResolver(ChannelCreateSchema);
  const UpdateSchemaYupResolver = yupResolver(ChannelUpdateSchema);

  const CreateForm = useForm({
    defaultValues: initialValuesCreate(),
    resolver: CreateSchemaYupResolver,
    disabled: type !== "CREATE",
  });

  const UpdateForm = useForm({
    defaultValues: channel && initialValuesUpdate(channel),
    resolver: UpdateSchemaYupResolver,
    disabled: type !== "UPDATE",
  });

  const DuplicateForm = useForm({
    defaultValues: channel && initialValuesDuplicate(channel),
    resolver: CreateSchemaYupResolver,
    disabled: type !== "DUPLICATE",
  });

  // Reset forms when open state or channel changes
  useEffect(() => {
    if (type === "CREATE") {
      CreateForm.reset(initialValuesCreate());
    } else if (type === "UPDATE" && channel) {
      UpdateForm.reset(initialValuesUpdate(channel));
    } else if (type === "DUPLICATE" && channel) {
      DuplicateForm.reset(initialValuesDuplicate(channel));
    }
  }, [CreateForm, UpdateForm, DuplicateForm, open, channel, type]);

  if (type !== "CREATE" && isNull(_channel)) return null;
  if (isNull(warehousesAsOptions)) return null;

  if (type === "CREATE" && CreateForm.formState.disabled) return null;
  if (type === "UPDATE" && UpdateForm.formState.disabled) return null;
  if (type === "DUPLICATE" && DuplicateForm.formState.disabled) return null;

  return (
    <CustomDialog header={label} open={open} setOpen={setOpen}>
      <FormController
        methods={
          type === "CREATE"
            ? CreateForm
            : type === "UPDATE"
              ? UpdateForm
              : DuplicateForm
        }
        buttonLeftIcon={getIconByFormType(type)}
        buttonLabel={label}
        formData={channelForm(warehousesAsOptions, t)}
        update={type === "UPDATE"}
        handleSubmit={async (data) =>
          type === "CREATE" || type === "DUPLICATE"
            ? await handleCreateChannel(data, refreshChannels, toaster)
            : !isUndefined(channel)
              ? await handleUpdateChannel(
                  channel.id,
                  data,
                  refreshChannels,
                  toaster,
                )
              : toaster.error({
                  title: t("errors.somethingWentWrong"),
                  description: t("errors.channel.notFound"),
                  duration: 3000,
                })
        }
        By={<By update={type === "UPDATE"} />}
        t={t}
        i18n={i18n}
      />
    </CustomDialog>
  );
};

const initialValuesCreate = () => {
  const values: CreateInput = {
    name: "",
    currency: CurrencyEnum.PLN,
    warehouses: [],
    createdBy: {
      id: "",
      name: "",
    },
    notifications: {
      email: "",
      emails: [],
      enabledTypes: [],
    },
  };
  return values;
};

const handleCreateChannel = async (
  data: CreateInput,
  refreshChannels: () => void,
  notifier: CreateToasterReturn,
) => {
  try {
    await createChannelAction({
      name: data.name,
      currency: data.currency,
      warehouses: data.warehouses,
      createdBy: {
        id: data.createdBy.id,
        name: data.createdBy.name,
      },
      notifications: data.notifications,
    });
    refreshChannels();
    notifier.success({
      title: "Sukces",
      description: `Pomyślnie utworzono nowy kanał`,
    });
  } catch (error) {
    console.error(error);
    notifier.error({
      title: "Coś poszło nie tak",
      description: `Kanał nie został utworzony, kod błędu: ${error}`,
    });
  }
};

const initialValuesUpdate = (channel?: Channel) => {
  if (isUndefined(channel))
    throw "channel was not provided to initialValuesUpdate";
  const values: UpdateInput = {
    name: channel.name,
    currency: channel.currency,
    warehouses: channel.warehouses,
    updatedBy: channel.updatedBy,
    notifications: channel.notifications || {
      email: "",
      emails: [],
      enabledTypes: [],
    },
  };
  return values;
};

const handleUpdateChannel = async (
  channelId: string,
  data: UpdateInput,
  refreshChannels: () => void,
  notifier: CreateToasterReturn,
) => {
  try {
    await updateChannelAction(channelId, {
      name: data.name,
      currency: data.currency,
      warehouses: data.warehouses,
      updatedBy: {
        id: data.updatedBy.id,
        name: data.updatedBy.name,
      },
      notifications: data.notifications,
    });
    refreshChannels();
    notifier.success({
      title: "Kanał edytowany",
      description: `Pomyślnie edytowano Kanał ${data.name}`,
    });
  } catch (error) {
    console.error(error);
    notifier.error({
      title: "Coś poszło nie tak",
      description: `Kanał nie został edytowany, kod błędu: ${error}`,
    });
  }
};

const initialValuesDuplicate = (channel?: Channel) => {
  if (isUndefined(channel))
    throw "channel was not provided to initialValuesUpdate";
  const values: CreateInput = {
    name: channel.name ?? "",
    currency: channel.currency ?? CurrencyEnum.PLN,
    warehouses: channel.warehouses ?? [],
    createdBy: {
      id: "",
      name: "",
    },
    notifications: channel.notifications || {
      email: "",
      emails: [],
      enabledTypes: [],
    },
  };
  return values;
};
