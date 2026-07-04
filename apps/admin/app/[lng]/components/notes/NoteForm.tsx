import { generateAdminText } from "@/actions/ai";
import { createNote, updateNote } from "@/actions/notes";
import { useT } from "@/i18n/client";
import { yupResolver } from "@hookform/resolvers/yup";
import { FormController, toaster } from "@konfi/components";
import { MODELS } from "@konfi/firebase";
import {
  FormTypes,
  Note,
  NoteCategory,
  NoteEntityType,
  NotePriority,
} from "@konfi/types";
import {
  getIconByFormType,
  getNoteCategoryOptions,
  getNotePriorityOptions,
  noteCreateForm,
  NoteCreateSchema,
  noteUpdateForm,
  NoteUpdateSchema,
} from "@konfi/utils";
import { useChannels } from "context/channels";
import { useConfiguration } from "context/configuration";
import { isUndefined } from "es-toolkit";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import * as yup from "yup";
import Drawer from "../Drawer";
import { By } from "../form/field-controllers/By";
import { ToChannel } from "../form/field-controllers/ToChannel";

type CreateInput = yup.InferType<typeof NoteCreateSchema>;
type UpdateInput = yup.InferType<typeof NoteUpdateSchema>;

interface SelectOption {
  label: string;
  value: string;
}

interface FormProps {
  note?: Note;
  type: keyof typeof FormTypes;
  asDrawer?: boolean;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  setOptimisticNote?: (action: Partial<Note>) => void;
  entityId?: Note["entityId"];
  entityType?: NoteEntityType;
}

const NoteForm = ({
  note,
  type,
  asDrawer = false,
  open = false,
  setOpen,
  setOptimisticNote,
  entityId,
  entityType,
}: FormProps) => {
  const { t, i18n } = useT();
  const [_, setIsSubmitting] = useState(false);
  const { filteredMembers, supportTaxonomySettings } = useConfiguration();
  const { channel } = useChannels();
  const noteCategoryOptions = useMemo(
    () => getNoteCategoryOptions(supportTaxonomySettings, t),
    [supportTaxonomySettings, t],
  );
  const notePriorityOptions = useMemo(
    () => getNotePriorityOptions(supportTaxonomySettings, t),
    [supportTaxonomySettings, t],
  );

  const carriedOutByOptions: SelectOption[] = useMemo(
    () =>
      filteredMembers
        ? filteredMembers.map(
            (member) =>
              ({
                label: member.name,
                value: member.name,
              }) as SelectOption,
          )
        : [],
    [filteredMembers],
  );

  const label = `${t(`FormTypes.${type}`)} ${t(`notes.note`, { defaultValue: "Note" })}`;

  // Form setup
  const createFormResolver = yupResolver(NoteCreateSchema);
  const updateFormResolver = yupResolver(NoteUpdateSchema);

  const CreateForm = useForm({
    defaultValues: initialValuesCreate(entityId, entityType, channel?.id),
    resolver: createFormResolver,
  });

  const UpdateForm = useForm({
    defaultValues: note ? initialValuesUpdate(note) : undefined,
    resolver: updateFormResolver,
  });

  const DuplicateForm = useForm({
    defaultValues: note ? initialValuesDuplicate(note, channel?.id) : undefined,
    resolver: createFormResolver,
  });

  // Reset form when opened
  useEffect(() => {
    if (open) {
      if (type === "CREATE") {
        CreateForm.reset(
          initialValuesCreate(entityId, entityType, channel?.id),
        );
      } else if (type === "UPDATE" && note) {
        UpdateForm.reset(initialValuesUpdate(note));
      } else if (type === "DUPLICATE" && note) {
        DuplicateForm.reset(initialValuesDuplicate(note, channel?.id));
      }
    }
  }, [
    open,
    type,
    note,
    entityId,
    entityType,
    channel?.id,
    CreateForm,
    UpdateForm,
    DuplicateForm,
  ]);

  // Handle form submissions
  const handleSubmitCreate = async (data: CreateInput) => {
    setIsSubmitting(true);

    try {
      const noteName =
        data.name ||
        (await generateAdminText({
          systemPrompt: `
          Create a short title for a note in language: ${i18n.resolvedLanguage}. Return only the title.
        `,
          context: data.content,
          modelId: MODELS.GEMINI_3_FLASH_LITE,
        }));

      if (process.env.NODE_ENV === "development") {
        console.log("Creating note:", {
          ...data,
          name: noteName,
        });
        return;
      }

      await createNote({
        ...data,
        name: noteName,
      });
      toaster.success({
        title: t("toasts.note.created"),
        description: t("toasts.note.createdDescription"),
      });

      if (setOpen) {
        setOpen(false);
      }
    } catch (error) {
      console.error("Error creating note:", error);
      toaster.error({
        title: t("errors.somethingWentWrong"),
        description: t("toasts.note.notCreated"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitUpdate = async (note: Note, data: UpdateInput) => {
    if (!note) return;
    setIsSubmitting(true);

    try {
      if (process.env.NODE_ENV === "development") {
        console.log("Updating note:", data);
        return;
      }

      // Optimistically update UI if needed
      if (setOptimisticNote) {
        setOptimisticNote({
          ...data,
          channelId: data.toChannel?.id,
        });
      }

      await updateNote(note.id, data);
      toaster.success({
        title: t("toasts.note.updated"),
        description: t("toasts.note.updatedDescription"),
      });

      if (setOpen) {
        setOpen(false);
      }
    } catch (error) {
      console.error("Error updating note:", error);
      toaster.error({
        title: t("errors.somethingWentWrong"),
        description: t("toasts.note.notUpdated"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const _FormController = (
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
      formData={
        type === "UPDATE"
          ? noteUpdateForm(
              carriedOutByOptions,
              t,
              noteCategoryOptions,
              notePriorityOptions,
            )
          : noteCreateForm(
              carriedOutByOptions,
              t,
              noteCategoryOptions,
              notePriorityOptions,
            )
      }
      update={type === "UPDATE"}
      handleSubmit={async (data) =>
        type === "CREATE" || type === "DUPLICATE"
          ? await handleSubmitCreate(data)
          : !isUndefined(note)
            ? await handleSubmitUpdate(note, data)
            : toaster.error({
                title: t("errors.somethingWentWrong"),
                description: t("errors.note.notFound"),
                duration: 3000,
              })
      }
      By={<By update={type === "UPDATE"} />}
      ToChannel={<ToChannel />}
      t={t}
      i18n={i18n}
    />
  );

  return asDrawer ? (
    <Drawer
      header={label}
      size={"xl"}
      closeOnOverlayClick={false}
      open={open}
      setOpen={setOpen}
      lazyMount
      unmountOnExit
    >
      {_FormController}
    </Drawer>
  ) : (
    _FormController
  );
};

// Helper functions for forms
export const initialValuesCreate = (
  entityId?: string,
  entityType?: NoteEntityType,
  channelId?: string,
) => {
  const values: CreateInput = {
    name: "",
    content: "",
    category: (entityType as unknown as NoteCategory) ?? NoteCategory.GENERAL,
    priority: NotePriority.MEDIUM,
    toChannel: channelId ? { id: channelId } : undefined,
    entityId: entityId || "",
    entityType: entityType,
    dueDate: "",
    completed: false,
    createdBy: {
      id: "",
      name: "",
    },
    carriedOutBy: [],
  };
  return values;
};

export const initialValuesUpdate = (note: Note) => {
  const values: UpdateInput = {
    name: note.name || "",
    content: note.content || "",
    category: note.category || NoteCategory.GENERAL,
    priority: note.priority || NotePriority.MEDIUM,
    toChannel: note.channelId ? { id: note.channelId } : undefined,
    entityId: note.entityId || "",
    entityType: note.entityType,
    dueDate: note.dueDate || "",
    completed: note.completed || false,
    updatedBy: note.updatedBy ?? {
      id: "",
      name: "",
    },
    carriedOutBy: note.carriedOutBy || [],
  };
  return values;
};

export const initialValuesDuplicate = (note: Note, channelId?: string) => {
  const values: CreateInput = {
    name: note.name || "",
    content: note.content || "",
    category: note.category || NoteCategory.GENERAL,
    priority: note.priority || NotePriority.MEDIUM,
    toChannel: channelId
      ? { id: channelId }
      : note.channelId
        ? { id: note.channelId }
        : undefined,
    entityId: note.entityId || "",
    entityType: note.entityType,
    dueDate: note.dueDate || "",
    completed: false, // Always reset to false when duplicating
    createdBy: {
      id: "",
      name: "",
    },
    carriedOutBy: note.carriedOutBy || [],
  };
  return values;
};

export default NoteForm;
