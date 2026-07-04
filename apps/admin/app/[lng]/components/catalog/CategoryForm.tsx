import { revalidateTagCache } from "@/actions";
import { ensureEntityTranslationsAction } from "@/actions/managed-translations";
import {
  assertSaasRuntimeQuotaAction,
  recordSaasRuntimeQuotaUsageAction,
} from "@/actions/saas-runtime-quotas";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { CreateToasterReturn } from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import { CustomDialog, FormController, toaster } from "@konfi/components";
import { create, db, getCategoryTranslations, update } from "@konfi/firebase";
import {
  Category,
  CategoryCreate,
  CategoryUpdate,
  Channel,
  FormTypes,
  TenantContext,
} from "@konfi/types";
import {
  CategoryCreateSchema,
  categoryForm,
  CategoryUpdateSchema,
  generateKeywords,
  getIconByFormType,
  toSlug,
} from "@konfi/utils";
import { useCatalog } from "context/catalog";
import { useChannels } from "context/channels";
import { isNull, isUndefined } from "es-toolkit";
import { Timestamp } from "firebase/firestore";
import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { useForm } from "react-hook-form";
import { InferType } from "yup";
import useSWR from "swr";
import { By } from "../form/field-controllers/By";
import Generate from "../form/field-controllers/Generate";
import { ToChannel } from "../form/field-controllers/ToChannel";
import { TranslationPanel } from "../translations/TranslationPanel";
import { CategoryTranslationForm } from "./CategoryTranslationForm";
import type { TFunction } from "i18next";

type CreateInput = InferType<typeof CategoryCreateSchema>;
type UpdateInput = InferType<typeof CategoryUpdateSchema>;

export const CategoryForm = ({
  category,
  prefillCategory,
  type,
  open,
  setOpen,
}: {
  category?: Category;
  prefillCategory?: Partial<CreateInput>;
  type: keyof typeof FormTypes;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}) => {
  const { t, i18n } = useT();
  const {
    categories,
    categoryInputSearchResults,
    refreshCategories,
    searchCategoriesInput,
  } = useCatalog();
  const { channel } = useChannels();
  const tenantContext = useTenantContext();
  const label = `${t(`FormTypes.${type}`, { defaultValue: type })} ${t("categories.category", { defaultValue: "Category" })}`;
  const CreateSchemaYupResolver = yupResolver(CategoryCreateSchema);
  const UpdateSchemaYupResolver = yupResolver(CategoryUpdateSchema);

  const { data: translations, mutate: mutateTranslations } = useSWR(
    category && channel?.id ? [category, channel.id] : null,
    ([category, channelId]) =>
      getCategoryTranslations(firestore, channelId, category.id),
  );

  const CreateForm = useForm({
    defaultValues: initialValuesCreate(prefillCategory),
    resolver: CreateSchemaYupResolver,
    disabled: type !== "CREATE",
  });

  const UpdateForm = useForm({
    defaultValues: category && initialValuesUpdate(category),
    resolver: UpdateSchemaYupResolver,
    disabled: type !== "UPDATE",
  });

  const DuplicateForm = useForm({
    defaultValues: category && initialValuesDuplicate(category),
    resolver: CreateSchemaYupResolver,
    disabled: type !== "DUPLICATE",
  });

  const parentCategoryOptions = useMemo(
    () =>
      parentCategoryCandidates({
        category,
        categories: [
          ...(categories ?? []),
          ...(categoryInputSearchResults ?? []),
          ...(category?.path ?? []),
        ],
      }),
    [categories, category, categoryInputSearchResults],
  );

  const searchParentCategories = useCallback(
    async (searchKey: string) => {
      const results = await searchCategoriesInput(searchKey);

      return parentCategoryCandidates({
        category,
        categories: results ?? [],
      });
    },
    [category, searchCategoriesInput],
  );

  // Reset forms when open state or category changes
  useEffect(() => {
    if (type === "CREATE") {
      CreateForm.reset(initialValuesCreate(prefillCategory));
    } else if (type === "UPDATE" && category) {
      UpdateForm.reset(initialValuesUpdate(category));
    } else if (type === "DUPLICATE" && category) {
      DuplicateForm.reset(initialValuesDuplicate(category));
    }
  }, [
    CreateForm,
    UpdateForm,
    DuplicateForm,
    open,
    category,
    prefillCategory,
    type,
  ]);

  if (isNull(channel)) return null;

  if (type === "CREATE" && CreateForm.formState.disabled) return null;
  if (type === "UPDATE" && UpdateForm.formState.disabled) return null;
  if (type === "DUPLICATE" && DuplicateForm.formState.disabled) return null;

  return (
    <CustomDialog header={label} open={open} setOpen={setOpen}>
      {category && channel.id && translations && (
        <TranslationPanel
          kind="category"
          source={category}
          translationRef={{
            kind: "category",
            channelId: channel.id,
            entityId: category.id,
          }}
          translations={translations}
          onMutate={mutateTranslations}
          renderForm={({ locale, translation, type }) => (
            <CategoryTranslationForm
              key={locale}
              channelId={channel.id}
              category={category}
              locale={locale}
              type={type}
              translation={translation}
              mutateTranslations={mutateTranslations}
            />
          )}
        />
      )}
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
        formData={categoryForm(t)}
        searchResults={{ categories: parentCategoryOptions }}
        searchFn={{ categories: searchParentCategories }}
        update={type === "UPDATE"}
        handleSubmit={async (data) =>
          type === "CREATE" || type === "DUPLICATE"
            ? await handleCreateCategory(
                data,
                refreshCategories,
                channel.id,
                toaster,
                t,
                tenantContext,
              )
            : !isUndefined(category)
              ? await handleUpdateCategory(
                  category.id,
                  data,
                  refreshCategories,
                  channel.id,
                  toaster,
                  t,
                  tenantContext,
                )
              : toaster.error({
                  title: t("error.somethingWrong", {
                    defaultValue: "Something went wrong",
                  }),
                  description: t("error.categoryNotFound", {
                    defaultValue: "Category not found for editing",
                  }),
                  duration: 3000,
                })
        }
        By={type === "UPDATE" ? <By update={true} /> : <By />}
        ToChannel={type === "DUPLICATE" && <ToChannel />}
        Generate={Generate}
        t={t}
        i18n={i18n}
      />
    </CustomDialog>
  );
};

const initialValuesCreate = (prefill?: Partial<CreateInput>) => {
  const values: CreateInput = {
    name: prefill?.name ?? "",
    description: prefill?.description ?? "",
    parentId: prefill?.parentId ?? null,
    seo: {
      slug: prefill?.seo?.slug ?? "",
      title: prefill?.seo?.title ?? "",
      description: prefill?.seo?.description ?? "",
    },
    createdBy: {
      id: prefill?.createdBy?.id ?? "",
      name: prefill?.createdBy?.name ?? "",
    },
  };
  return values;
};

const handleCreateCategory = async (
  data: CreateInput,
  refreshCategories: () => void,
  channelId: Channel["id"],
  toaster: CreateToasterReturn,
  t: TFunction,
  tenantContext: TenantContext,
) => {
  try {
    await assertSaasRuntimeQuotaAction({
      operation: "admin.category.create",
      resource: "categories",
    });

    const category: CategoryCreate = {
      id: "",
      name: data.name,
      description: data.description,
      parentId: data.parentId ?? null,
      seo: {
        slug: toSlug(data.seo?.slug || ""),
        title: data.seo?.title ?? "",
        description: data.seo?.description ?? "",
      },
      createdBy: {
        id: data.createdBy.id,
        name: data.createdBy.name,
      },
      createdAt: Timestamp.now(),
      updatedBy: {
        id: data.createdBy.id,
        name: data.createdBy.name,
      },
      updatedAt: Timestamp.now(),
      keywords: generateKeywords(data.name),
    };
    const _channelId = !isUndefined(data?.toChannel?.id)
      ? data?.toChannel?.id
      : channelId;
    const categoryId = await create(
      firestore,
      category,
      undefined,
      db.collection(firestore, "/channels/" + _channelId + "/categories"),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      tenantContext,
    );
    if (categoryId) {
      void ensureEntityTranslationsAction({
        kind: "category",
        channelId: _channelId,
        entityId: categoryId,
      })
        .then((result) => {
          if (!result.ok) {
            toaster.warning({
              title: t("translations.managed.toasts.autoWarning", {
                defaultValue: "Created, but auto-translation failed",
              }),
            });
          }
        })
        .catch((error) => {
          console.error("[CategoryForm] Auto-translation failed", error);
          toaster.warning({
            title: t("translations.managed.toasts.autoWarning", {
              defaultValue: "Created, but auto-translation failed",
            }),
          });
        });
    }
    if (channelId === _channelId) refreshCategories();
    toaster.success({
      title: t("category.created", { defaultValue: "Category created" }),
      description: t("category.createdDescription", {
        defaultValue: "Successfully created new category",
      }),
    });
    runCategoryPostWriteTask(
      "record create quota usage",
      recordSaasRuntimeQuotaUsageAction({
        operation: "admin.category.create",
        resource: "categories",
      }),
    );
    runCategoryPostWriteTask(
      "revalidate categorized card products",
      revalidateTagCache("categorizedCardProducts"),
    );
  } catch (error) {
    console.error(error);
    toaster.error({
      title: t("error.somethingWrong", {
        defaultValue: "Something went wrong",
      }),
      description: t("category.notCreated", {
        defaultValue: "Category was not created, error code: {{error}}",
        error,
      }),
    });
  }
};

const initialValuesUpdate = (category?: Category) => {
  if (isUndefined(category))
    throw "category was not provided to initialValuesUpdate";
  const values: UpdateInput = {
    name: category.name,
    description: category.description,
    parentId: category.parentId ?? null,
    seo: category.seo,
    updatedBy: category.updatedBy,
  };
  return values;
};

const handleUpdateCategory = async (
  categoryId: string,
  data: UpdateInput,
  refreshCategories: () => void,
  channelId: Channel["id"],
  toaster: CreateToasterReturn,
  t: TFunction,
  tenantContext: TenantContext,
) => {
  try {
    const category: CategoryUpdate = {
      name: data.name,
      parentId: data.parentId ?? null,
      seo: {
        slug: toSlug(data.seo?.slug || ""),
        title: data.seo?.title ?? "",
        description: data.seo?.description ?? "",
      },
      description: data.description,
      updatedBy: {
        id: data.updatedBy.id,
        name: data.updatedBy.name,
      },
      updatedAt: Timestamp.now(),
      keywords: generateKeywords(data.name),
    };
    await update(
      category,
      db.doc(firestore, "/channels/" + channelId + "/categories", categoryId),
      tenantContext,
    );
    refreshCategories();
    toaster.success({
      title: t("category.updated", { defaultValue: "Category updated" }),
      description: t("category.updatedDescription", {
        defaultValue: "Successfully updated category {{name}}",
        name: data.name,
      }),
    });
    runCategoryPostWriteTask(
      "revalidate categorized card products",
      revalidateTagCache("categorizedCardProducts"),
    );
  } catch (error) {
    console.error(error);
    toaster.error({
      title: t("error.somethingWrong", {
        defaultValue: "Something went wrong",
      }),
      description: t("category.notUpdated", {
        defaultValue: "Category was not updated, error code: {{error}}",
        error,
      }),
    });
  }
};

const initialValuesDuplicate = (category?: Category) => {
  if (isUndefined(category))
    throw "category was not provided to initialValuesUpdate";
  const values: CreateInput = {
    name: category.name ?? "",
    description: category.description ?? "",
    parentId: category.parentId ?? null,
    seo: {
      slug: category.seo.slug ?? "",
      title: category.seo.title ?? "",
      description: category.seo.description ?? "",
    },
    createdBy: {
      id: "",
      name: "",
    },
  };
  return values;
};

function parentCategoryCandidates(input: {
  category?: Category;
  categories: Pick<Category, "id" | "name" | "parentId" | "path">[];
}): Pick<Category, "id" | "name" | "parentId" | "path">[] {
  const currentCategoryId = input.category?.id;
  const excludedIds = new Set(currentCategoryId ? [currentCategoryId] : []);
  let didAddCategory = true;

  while (didAddCategory) {
    didAddCategory = false;

    for (const category of input.categories) {
      if (
        currentCategoryId &&
        category.path?.some((segment) => segment.id === currentCategoryId)
      ) {
        excludedIds.add(category.id);
        continue;
      }

      if (
        category.parentId &&
        excludedIds.has(category.parentId) &&
        !excludedIds.has(category.id)
      ) {
        excludedIds.add(category.id);
        didAddCategory = true;
      }
    }
  }

  return Array.from(
    new Map(
      input.categories
        .filter((category) => !excludedIds.has(category.id))
        .map((category) => [category.id, category]),
    ).values(),
  ).toSorted((left, right) => left.name.localeCompare(right.name));
}

function runCategoryPostWriteTask(label: string, task: Promise<unknown>) {
  void task.catch((error) => {
    console.error(`[CategoryForm] Failed to ${label}`, error);
  });
}
