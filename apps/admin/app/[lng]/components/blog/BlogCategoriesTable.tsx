"use client";

import { revalidateTagCache } from "@/actions";
import { ManagedTranslationStatusIndicator } from "@/components/translations/ManagedTranslationStatusIndicator";
import { useT } from "@/i18n/client";
import { IconButton, Table } from "@chakra-ui/react";
import { AlertDialog, Empty, MaterialSymbol, toaster } from "@konfi/components";
import { deleteBlogCategory } from "@konfi/firebase";
import { BlogCategory } from "@konfi/types";
import { ADMIN_BLOG_CATEGORIES_EDIT } from "@konfi/utils";
import { isEmpty } from "es-toolkit/compat";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface BlogCategoriesTableProps {
  categories: BlogCategory[];
  isLoading: boolean;
  onCategoryDeleted?: (categoryId: string) => void;
}

export default function BlogCategoriesTable({
  categories,
  isLoading,
  onCategoryDeleted,
}: BlogCategoriesTableProps) {
  const { t } = useT();
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<BlogCategory | null>(
    null,
  );

  const handleEdit = (category: BlogCategory) => {
    router.push(ADMIN_BLOG_CATEGORIES_EDIT(category.id));
  };

  const handleDeleteClick = (category: BlogCategory) => {
    setCategoryToDelete(category);
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async () => {
    if (!categoryToDelete) return;

    try {
      await deleteBlogCategory(categoryToDelete.id, revalidateTagCache);

      toaster.create({
        title: t("blog.categories.messages.deleteSuccess"),
        type: "success",
      });

      if (onCategoryDeleted) {
        onCategoryDeleted(categoryToDelete.id);
      }
    } catch (error) {
      console.error("Error deleting blog category:", error);
      toaster.create({
        title: t("blog.categories.messages.deleteError"),
        type: "error",
      });
    } finally {
      setShowDeleteDialog(false);
      setCategoryToDelete(null);
    }
  };

  if (isLoading) {
    return (
      <Table.Root size="sm">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>
              {t("blog.categories.table.name")}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("blog.categories.table.slug")}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("blog.categories.table.postsCount")}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("translations.managed.tableHeader", {
                defaultValue: "Translations",
              })}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("blog.categories.table.actions")}
            </Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {[...Array(5)].map((_, index) => (
            <Table.Row key={index}>
              <Table.Cell>
                <div className="h-4 bg-gray-200 rounded animate-pulse" />
              </Table.Cell>
              <Table.Cell>
                <div className="h-4 bg-gray-200 rounded animate-pulse" />
              </Table.Cell>
              <Table.Cell>
                <div className="h-4 bg-gray-200 rounded animate-pulse" />
              </Table.Cell>
              <Table.Cell>
                <div className="h-4 bg-gray-200 rounded animate-pulse" />
              </Table.Cell>
              <Table.Cell>
                <div className="h-4 bg-gray-200 rounded animate-pulse" />
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    );
  }

  if (isEmpty(categories)) {
    return (
      <Table.Root size="sm">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>
              {t("blog.categories.table.name")}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("blog.categories.table.slug")}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("blog.categories.table.postsCount")}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("translations.managed.tableHeader", {
                defaultValue: "Translations",
              })}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("blog.categories.table.actions")}
            </Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row>
            <Table.Cell colSpan={5} textAlign="center" py={8}>
              <Empty
                title={t("blog.categories.empty.title")}
                description={t("blog.categories.empty.description")}
                icon="folder"
              />
            </Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table.Root>
    );
  }

  return (
    <Table.Root size="sm">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeader>
            {t("blog.categories.table.name")}
          </Table.ColumnHeader>
          <Table.ColumnHeader>
            {t("blog.categories.table.slug")}
          </Table.ColumnHeader>
          <Table.ColumnHeader>
            {t("blog.categories.table.postsCount")}
          </Table.ColumnHeader>
          <Table.ColumnHeader>
            {t("translations.managed.tableHeader", {
              defaultValue: "Translations",
            })}
          </Table.ColumnHeader>
          <Table.ColumnHeader>
            {t("blog.categories.table.actions")}
          </Table.ColumnHeader>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {categories.map((category) => (
          <Table.Row key={category.id}>
            <Table.Cell>
              <div>
                <div className="font-medium">{category.name}</div>
                {category.description && (
                  <div className="text-sm text-gray-500 truncate max-w-xs">
                    {category.description}
                  </div>
                )}
              </div>
            </Table.Cell>
            <Table.Cell minW={"200px"}>
              <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                {category.slug}
              </code>
            </Table.Cell>
            <Table.Cell minW={"150px"}>
              <span className="text-sm text-gray-600">
                {category.postCount || 0}
              </span>
            </Table.Cell>
            <Table.Cell minW={"150px"}>
              <ManagedTranslationStatusIndicator
                kind="blogCategory"
                source={category}
              />
            </Table.Cell>
            <Table.Cell minW={"150px"}>
              <div className="flex items-center gap-2">
                <IconButton
                  size="sm"
                  variant="ghost"
                  aria-label={t("common.edit")}
                  onClick={() => handleEdit(category)}
                >
                  <MaterialSymbol>edit</MaterialSymbol>
                </IconButton>
                <IconButton
                  size="sm"
                  variant="ghost"
                  aria-label={t("common.delete")}
                  colorScheme="red"
                  onClick={() => handleDeleteClick(category)}
                >
                  <MaterialSymbol>delete</MaterialSymbol>
                </IconButton>
              </div>
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>

      <AlertDialog
        header={t("blog.categories.confirmDelete")}
        handle={handleDeleteConfirm}
        open={showDeleteDialog}
        setOpen={setShowDeleteDialog}
        t={t}
      >
        {categoryToDelete && (
          <div>
            <p>{t("blog.categories.deleteConfirmMessage")}</p>
            <p>
              <strong>{categoryToDelete.name}</strong>
            </p>
          </div>
        )}
      </AlertDialog>
    </Table.Root>
  );
}
