import { useT } from "@/i18n/client";
import { getCategoryAgentDraftForCreate } from "@/actions/category-agent";
import {
  Button,
  Flex,
  Heading,
  HStack,
  Separator,
  Skeleton,
  Spacer,
  Text,
} from "@chakra-ui/react";
import {
  AlertDialog,
  DataTable,
  MaterialSymbol,
  MenuItem,
  RefreshButton,
  SearchInput,
} from "@konfi/components";
import { Category } from "@konfi/types";
import { ColumnDef, createColumnHelper } from "@tanstack/react-table";
import { useCatalog } from "context/catalog";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { startTransition, useEffect, useMemo, useState } from "react";
import useSWRImmutable from "swr/immutable";
import { CatalogTranslationManager } from "./CatalogTranslationManager";
import { CategoryForm } from "./CategoryForm";

const Menu = dynamic(() => import("../Menu"), {
  loading: () => <Skeleton />,
  ssr: false,
});

const Categories = () => {
  const { t, i18n } = useT();
  const {
    loadingCategories,
    categoriesPageIndex,
    setCategoriesPageIndex,
    categorySearchResults,
    cleanCategoriesSearchResults,
    categories,
    categoriesCount,
    showCategories,
    refreshCategories,
    dirtyRefreshCategories,
    searchCategories,
    removeCategory,
  } = useCatalog();
  const columHelper = createColumnHelper<Category>();
  const searchParams = useSearchParams();
  const agentRunId = searchParams.get("agentRunId");
  const isCreateCategoryQuery =
    Boolean(agentRunId) ||
    searchParams.get("create") === "category" ||
    searchParams.get("type") === "create-new";
  const { data: agentCategoryResult } = useSWRImmutable(
    agentRunId ? ["category-agent-draft", agentRunId] : null,
    ([, currentAgentRunId]) =>
      getCategoryAgentDraftForCreate(currentAgentRunId),
  );
  const prefillCategory = useMemo(
    () =>
      agentCategoryResult?.success && agentCategoryResult.readyForCreate
        ? agentCategoryResult.category
        : undefined,
    [agentCategoryResult],
  );
  const data = useMemo<Category[] | undefined>(
    () =>
      categorySearchResults
        ? categorySearchResults?.map((category) => category)
        : categories?.map((category) => category),
    [categories, categorySearchResults],
  );
  const [showCreateForm, setShowCreateForm] = useState(isCreateCategoryQuery);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showDuplicateForm, setShowDuplicateForm] = useState(false);
  const [currentCategory, setCurrentCategory] = useState<Category | null>(null);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);

  useEffect(() => {
    if (isCreateCategoryQuery) {
      setShowCreateForm(true);
    }
  }, [isCreateCategoryQuery]);

  function handleCreateFormOpen() {
    startTransition(() => {
      setShowCreateForm(true);
    });
  }

  function handleUpdateFormOpen(category: Category) {
    startTransition(() => {
      setCurrentCategory(category);
      setShowUpdateForm(true);
    });
  }

  function handleDuplicateFormOpen(category: Category) {
    startTransition(() => {
      setCurrentCategory(category);
      setShowDuplicateForm(true);
    });
  }

  function handleRemove(category: Category) {
    startTransition(() => {
      setCurrentCategory(category);
      setShowRemoveDialog(true);
    });
  }

  const columns = useMemo<ColumnDef<Category, any>[]>(
    () => [
      columHelper.accessor("name", {
        cell: (info) => info.getValue(),
        header: t("categories.name", { defaultValue: "Name" }),
      }),
      columHelper.accessor("description", {
        cell: (info) => info.getValue(),
        header: t("categories.description", { defaultValue: "Description" }),
      }),
      columHelper.display({
        id: "translations",
        cell: (props) => (
          <CatalogTranslationManager
            kind="category"
            source={props.row.original}
          />
        ),
        header: t("translations.managed.tableHeader", {
          defaultValue: "Translations",
        }),
      }),
      columHelper.accessor("createdAt", {
        cell: (info) =>
          info.getValue().toDate().toLocaleDateString(i18n.resolvedLanguage),
        header: t("categories.createdAt", { defaultValue: "Created at" }),
      }),
      columHelper.display({
        id: "actions",
        cell: (props) => (
          <Menu
            icon={<MaterialSymbol>menu_open</MaterialSymbol>}
            ariaLabel={t("table.actions", { defaultValue: "Actions" })}
          >
            <MenuItem
              value={"update-form"}
              onClick={() => handleUpdateFormOpen(props.row.original)}
            >
              <MaterialSymbol>edit_square</MaterialSymbol>
              {t("categories.edit", { defaultValue: "Edit Category" })}
            </MenuItem>
            <MenuItem
              value={"duplicate-form"}
              onClick={() => handleDuplicateFormOpen(props.row.original)}
            >
              <MaterialSymbol>content_copy</MaterialSymbol>
              {t("categories.duplicate", {
                defaultValue: "Duplicate Category",
              })}
            </MenuItem>
            <MenuItem
              value={"deactivate-modal"}
              onClick={() => handleRemove(props.row.original)}
              color="fg.error"
              _hover={{ bg: "bg.error", color: "fg.error" }}
            >
              <MaterialSymbol>delete</MaterialSymbol>
              {t("categories.delete", { defaultValue: "Delete Category" })}
            </MenuItem>
          </Menu>
        ),
        meta: {
          isNumeric: true,
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data],
  );

  return (
    <>
      <Heading my={"4"} size={"md"}>
        {t("categories.heading", { defaultValue: "Categories" })}
      </Heading>
      <Flex flexDir={["column", "row"]} gap={["2", "0"]}>
        <SearchInput
          placeholder={t("categories.searchPlaceholder", {
            defaultValue: "Search categories by name...",
          })}
          searchFn={searchCategories}
          cleanFn={cleanCategoriesSearchResults}
          searchResults={categorySearchResults}
          t={t}
        />
        <Spacer />
        <HStack gap={2}>
          <RefreshButton
            w={["100%", "auto"]}
            label={t("categories.refresh", {
              defaultValue: "Refresh Categories",
            })}
            refreshFunction={refreshCategories}
          />
          <Button
            colorPalette={"primary"}
            variant={"solid"}
            onClick={() => handleCreateFormOpen()}
          >
            <MaterialSymbol>add</MaterialSymbol>
            {t("categories.add", { defaultValue: "Add Category" })}
          </Button>
        </HStack>
      </Flex>
      <Separator my={"6"} />
      {data && !(data.length <= 0) && (
        <DataTable
          columns={columns}
          data={data}
          paginationType={categorySearchResults ? "uncontrolled" : "controlled"}
          show={showCategories}
          itemsCount={
            categorySearchResults
              ? categorySearchResults.length
              : categoriesCount
          }
          loading={loadingCategories}
          refreshFlag={dirtyRefreshCategories}
          defaultPageIndex={categoriesPageIndex}
          setPageIndex={setCategoriesPageIndex}
          enablePageSizeSelection
          t={t}
          i18n={i18n}
        />
      )}
      <CategoryForm
        prefillCategory={prefillCategory}
        type={"CREATE"}
        open={showCreateForm}
        setOpen={setShowCreateForm}
      />
      <CategoryForm
        category={currentCategory!}
        type={"UPDATE"}
        open={showUpdateForm}
        setOpen={setShowUpdateForm}
      />
      <CategoryForm
        category={currentCategory!}
        type={"DUPLICATE"}
        open={showDuplicateForm}
        setOpen={setShowDuplicateForm}
      />
      <AlertDialog
        header={t("categories.deleteConfirmHeader", {
          defaultValue: "Are you sure you want to delete the category?",
        })}
        handle={() => removeCategory(currentCategory!.id)}
        open={showRemoveDialog}
        setOpen={setShowRemoveDialog}
        t={t}
      >
        <Text>
          {t("categories.deleteConfirmText", {
            defaultValue:
              "Before deleting the category, make sure no products depend on it.",
          })}
        </Text>
      </AlertDialog>
    </>
  );
};

export default Categories;
