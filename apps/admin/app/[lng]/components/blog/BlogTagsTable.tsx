"use client";

import { revalidateTagCache } from "@/actions";
import { ManagedTranslationStatusIndicator } from "@/components/translations/ManagedTranslationStatusIndicator";
import { useT } from "@/i18n/client";
import { IconButton, Table } from "@chakra-ui/react";
import { AlertDialog, Empty, MaterialSymbol, toaster } from "@konfi/components";
import { deleteBlogTag } from "@konfi/firebase";
import { BlogTag } from "@konfi/types";
import { ADMIN_BLOG_TAGS_EDIT } from "@konfi/utils";
import { isEmpty } from "es-toolkit/compat";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface BlogTagsTableProps {
  tags: BlogTag[];
  isLoading: boolean;
  onTagDeleted?: (tagId: string) => void;
  counts?: Record<string, number>;
  isLoadingCounts?: boolean;
  countsError?: Error;
}

export default function BlogTagsTable({
  tags,
  isLoading,
  onTagDeleted,
  counts,
  isLoadingCounts,
  countsError,
}: BlogTagsTableProps) {
  const { t } = useT();
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<BlogTag | null>(null);

  const handleEdit = (tag: BlogTag) => {
    router.push(ADMIN_BLOG_TAGS_EDIT(tag.id));
  };

  const handleDeleteClick = (tag: BlogTag) => {
    setTagToDelete(tag);
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async () => {
    if (!tagToDelete) return;

    try {
      await deleteBlogTag(tagToDelete.id, revalidateTagCache);

      toaster.create({
        title: t("blog.tags.messages.deleteSuccess"),
        type: "success",
      });

      if (onTagDeleted) {
        onTagDeleted(tagToDelete.id);
      }
    } catch (error) {
      console.error("Error deleting blog tag:", error);
      toaster.create({
        title: t("blog.tags.messages.deleteError"),
        type: "error",
      });
    } finally {
      setShowDeleteDialog(false);
      setTagToDelete(null);
    }
  };

  if (isLoading) {
    return (
      <Table.Root size="sm">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>{t("blog.tags.table.name")}</Table.ColumnHeader>
            <Table.ColumnHeader>{t("blog.tags.table.slug")}</Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("blog.tags.table.postsCount")}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("translations.managed.tableHeader", {
                defaultValue: "Translations",
              })}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("blog.tags.table.actions")}
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

  if (isEmpty(tags)) {
    return (
      <Table.Root size="sm">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>{t("blog.tags.table.name")}</Table.ColumnHeader>
            <Table.ColumnHeader>{t("blog.tags.table.slug")}</Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("blog.tags.table.postsCount")}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("translations.managed.tableHeader", {
                defaultValue: "Translations",
              })}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("blog.tags.table.actions")}
            </Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row>
            <Table.Cell colSpan={5} textAlign="center" py={8}>
              <Empty
                title={t("blog.tags.empty.title")}
                description={t("blog.tags.empty.description")}
                icon="label"
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
          <Table.ColumnHeader>{t("blog.tags.table.name")}</Table.ColumnHeader>
          <Table.ColumnHeader>{t("blog.tags.table.slug")}</Table.ColumnHeader>
          <Table.ColumnHeader>
            {t("blog.tags.table.postsCount")}
          </Table.ColumnHeader>
          <Table.ColumnHeader>
            {t("translations.managed.tableHeader", {
              defaultValue: "Translations",
            })}
          </Table.ColumnHeader>
          <Table.ColumnHeader>
            {t("blog.tags.table.actions")}
          </Table.ColumnHeader>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {tags.map((tag) => (
          <Table.Row key={tag.id}>
            <Table.Cell>
              <div>
                <div className="font-medium">{tag.name}</div>
                {tag.description && (
                  <div className="text-sm text-gray-500 truncate max-w-xs">
                    {tag.description}
                  </div>
                )}
              </div>
            </Table.Cell>
            <Table.Cell>
              <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                {tag.slug}
              </code>
            </Table.Cell>
            <Table.Cell>
              {isLoadingCounts ? (
                <div className="h-4 w-12 bg-gray-200 rounded animate-pulse" />
              ) : countsError ? (
                <span className="text-sm text-red-600">-</span>
              ) : (
                <span className="text-sm text-gray-600">
                  {counts?.[tag.id] || 0} {t("common.posts")}
                </span>
              )}
            </Table.Cell>
            <Table.Cell minW={"150px"}>
              <ManagedTranslationStatusIndicator kind="blogTag" source={tag} />
            </Table.Cell>
            <Table.Cell minW={"150px"}>
              <div className="flex items-center gap-2">
                <IconButton
                  size="sm"
                  variant="ghost"
                  aria-label={t("common.edit")}
                  onClick={() => handleEdit(tag)}
                >
                  <MaterialSymbol>edit</MaterialSymbol>
                </IconButton>
                <IconButton
                  size="sm"
                  variant="ghost"
                  aria-label={t("common.delete")}
                  colorScheme="red"
                  onClick={() => handleDeleteClick(tag)}
                >
                  <MaterialSymbol>delete</MaterialSymbol>
                </IconButton>
              </div>
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>

      <AlertDialog
        header={t("blog.tags.confirmDelete")}
        handle={handleDeleteConfirm}
        open={showDeleteDialog}
        setOpen={setShowDeleteDialog}
        t={t}
      >
        {tagToDelete && (
          <div>
            <p>{t("blog.tags.deleteConfirmMessage")}</p>
            <p>
              <strong>{tagToDelete.name}</strong>
            </p>
          </div>
        )}
      </AlertDialog>
    </Table.Root>
  );
}
