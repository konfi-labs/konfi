import { FormData, SelectOption } from "@konfi/types";
import type { TFunction } from "i18next";
import {
  getComplaintStatusOptions,
  getNoteCategoryOptions,
  getNotePriorityOptions,
} from "../support-taxonomy";

export const complaintForm = (
  orderItemIdsOptions: SelectOption[],
  carriedOutByOptions: SelectOption[],
  t: TFunction,
  complaintStatusOptions: SelectOption[] = getComplaintStatusOptions(null, t),
) => {
  const complaintFormData: FormData = {
    allowMultiple: true,
    allowToggle: true,
    sections: [
      {
        fieldArray: false,
        heading: t("forms.complaint.headings.basicInformation", {
          defaultValue: "Basic Information",
        }),
        isDefaultExpanded: true,
        fields: [
          {
            name: "orderItemIds",
            label: t("forms.complaint.labels.complaintItems", {
              defaultValue: "Complaint Items",
            }),
            isRequired: true,
            placeholder: t(
              "forms.complaint.placeholders.selectComplaintItems",
              { defaultValue: "Select complaint items..." },
            ),
            type: "multiSelect",
            options: orderItemIdsOptions,
          },
          {
            name: "description",
            label: t("forms.complaint.labels.description", {
              defaultValue: "Description",
            }),
            isRequired: false,
            placeholder: t("forms.complaint.placeholders.description", {
              defaultValue: "Description",
            }),
            type: "textarea",
            mdxPreview: true,
            watch: true,
          },
          {
            name: "status",
            label: t("forms.complaint.labels.status", {
              defaultValue: "Status",
            }),
            isRequired: true,
            placeholder: t("forms.complaint.placeholders.status", {
              defaultValue: "Status",
            }),
            type: "select",
            options: complaintStatusOptions,
            enumName: "ComplaintStatus",
          },
          {
            name: "carriedOutBy",
            label: t("forms.complaint.labels.carriedOutBy", {
              defaultValue: "Carried Out By",
            }),
            isRequired: true,
            placeholder: t("forms.complaint.placeholders.selectCarriedOutBy", {
              defaultValue: "Select carried out by...",
            }),
            type: "multiSelect",
            options: carriedOutByOptions,
          },
        ],
      },
    ],
  };
  return complaintFormData;
};

export const noteCreateForm = (
  carriedOutByOptions: SelectOption[],
  t: TFunction,
  noteCategoryOptions: SelectOption[] = getNoteCategoryOptions(null, t),
  notePriorityOptions: SelectOption[] = getNotePriorityOptions(null, t),
) => {
  const noteCreateFormData: FormData = {
    allowMultiple: false,
    allowToggle: true,
    sections: [
      {
        fieldArray: false,
        heading: t("forms.note.headings.basicInformation", {
          defaultValue: "Basic Information",
        }),
        isDefaultExpanded: true,
        stackDirection: "column",
        fields: [
          {
            name: "name",
            label: t("forms.note.labels.title", { defaultValue: "Title" }),
            isRequired: false,
            placeholder: t("forms.note.placeholders.title", {
              defaultValue: "Title",
            }),
          },
          {
            name: "content",
            label: t("forms.note.labels.description", {
              defaultValue: "Description",
            }),
            isRequired: true,
            placeholder: t("forms.note.placeholders.description", {
              defaultValue: "Description",
            }),
            type: "textarea",
            mdxPreview: true,
            watch: true,
          },
          {
            name: "category",
            label: t("forms.note.labels.category", {
              defaultValue: "Category",
            }),
            isRequired: true,
            placeholder: t("forms.note.placeholders.selectCategory", {
              defaultValue: "Select category...",
            }),
            type: "select",
            options: noteCategoryOptions,
            enumName: "NoteCategory",
          },
          {
            name: "priority",
            label: t("forms.note.labels.priority", {
              defaultValue: "Priority",
            }),
            isRequired: true,
            placeholder: t("forms.note.placeholders.selectPriority", {
              defaultValue: "Select priority...",
            }),
            type: "select",
            options: notePriorityOptions,
            enumName: "NotePriority",
          },
          {
            name: "dueDate",
            label: t("forms.note.labels.date", { defaultValue: "Date" }),
            isRequired: true,
            placeholder: t("forms.note.placeholders.date", {
              defaultValue: "Date",
            }),
            type: "date",
          },
          {
            name: "carriedOutBy",
            label: t("forms.note.labels.for", { defaultValue: "For" }),
            isRequired: true,
            placeholder: t("forms.note.placeholders.selectPeople", {
              defaultValue: "Select people...",
            }),
            type: "multiSelect",
            options: carriedOutByOptions,
          },
        ],
      },
    ],
  };
  return noteCreateFormData;
};

export const noteUpdateForm = (
  carriedOutByOptions: SelectOption[],
  t: TFunction,
  noteCategoryOptions: SelectOption[] = getNoteCategoryOptions(null, t),
  notePriorityOptions: SelectOption[] = getNotePriorityOptions(null, t),
) => {
  const noteUpdateFormData: FormData = {
    allowMultiple: false,
    allowToggle: true,
    sections: [
      {
        fieldArray: false,
        heading: t("forms.note.headings.basicInformation", {
          defaultValue: "Basic Information",
        }),
        isDefaultExpanded: true,
        stackDirection: "column",
        fields: [
          {
            name: "name",
            label: t("forms.note.labels.title", { defaultValue: "Title" }),
            isRequired: false,
            placeholder: t("forms.note.placeholders.title", {
              defaultValue: "Title",
            }),
          },
          {
            name: "content",
            label: t("forms.note.labels.description", {
              defaultValue: "Description",
            }),
            isRequired: true,
            placeholder: t("forms.note.placeholders.description", {
              defaultValue: "Description",
            }),
            type: "textarea",
            mdxPreview: true,
            watch: true,
          },
          {
            name: "category",
            label: t("forms.note.labels.category", {
              defaultValue: "Category",
            }),
            isRequired: true,
            placeholder: t("forms.note.placeholders.selectCategory", {
              defaultValue: "Select category...",
            }),
            type: "select",
            options: noteCategoryOptions,
            enumName: "NoteCategory",
          },
          {
            name: "priority",
            label: t("forms.note.labels.priority", {
              defaultValue: "Priority",
            }),
            isRequired: true,
            placeholder: t("forms.note.placeholders.selectPriority", {
              defaultValue: "Select priority...",
            }),
            type: "select",
            options: notePriorityOptions,
            enumName: "NotePriority",
          },
          {
            name: "dueDate",
            label: t("forms.note.labels.date", { defaultValue: "Date" }),
            isRequired: true,
            placeholder: t("forms.note.placeholders.date", {
              defaultValue: "Date",
            }),
            type: "date",
          },
          {
            name: "completed",
            label: t("forms.note.labels.completed", {
              defaultValue: "Completed",
            }),
            isRequired: false,
            placeholder: t("forms.note.placeholders.completed", {
              defaultValue: "Completed",
            }),
            type: "checkbox",
          },
          {
            name: "carriedOutBy",
            label: t("forms.note.labels.for", { defaultValue: "For" }),
            isRequired: true,
            placeholder: t("forms.note.placeholders.selectPeople", {
              defaultValue: "Select people...",
            }),
            type: "multiSelect",
            options: carriedOutByOptions,
          },
        ],
      },
    ],
  };
  return noteUpdateFormData;
};
