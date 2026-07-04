"use client";

import { revalidateTagCache } from "@/actions";
import { ManagedTranslationStatusIndicator } from "@/components/translations/ManagedTranslationStatusIndicator";
import { useT } from "@/i18n/client";
import { Badge, IconButton, Table } from "@chakra-ui/react";
import { AlertDialog, Empty, MaterialSymbol, toaster } from "@konfi/components";
import { deleteBlogPost } from "@konfi/firebase";
import { BlogPost, BlogPostStatus } from "@konfi/types";
import { ADMIN_BLOG_POSTS_EDIT } from "@konfi/utils";
import { isEmpty } from "es-toolkit/compat";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface BlogPostsTableProps {
  posts: BlogPost[];
  isLoading: boolean;
  lng: string;
  onPostDeleted?: (postId: string) => void;
}

function formatTimestamp(timestamp: unknown): string {
  if (!timestamp) return "-";
  const date =
    typeof timestamp === "object" &&
    timestamp !== null &&
    "toDate" in timestamp &&
    typeof timestamp.toDate === "function"
      ? timestamp.toDate()
      : new Date(timestamp as string | number | Date);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export default function BlogPostsTable({
  posts,
  isLoading,
  lng,
  onPostDeleted,
}: BlogPostsTableProps) {
  const { t } = useT();
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [postToDelete, setPostToDelete] = useState<BlogPost | null>(null);

  const handleEdit = (post: BlogPost) => {
    router.push(ADMIN_BLOG_POSTS_EDIT(post.id));
  };

  const handleDeleteClick = (post: BlogPost) => {
    setPostToDelete(post);
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async () => {
    if (!postToDelete) return;

    try {
      await deleteBlogPost(postToDelete.id, revalidateTagCache);

      toaster.create({
        title: t("blog.posts.messages.deleteSuccess"),
        type: "success",
      });

      if (onPostDeleted) {
        onPostDeleted(postToDelete.id);
      }
    } catch (error) {
      console.error("Error deleting blog post:", error);
      toaster.create({
        title: t("blog.posts.messages.deleteError"),
        type: "error",
      });
    } finally {
      setShowDeleteDialog(false);
      setPostToDelete(null);
    }
  };

  if (isLoading) {
    return (
      <Table.Root size="sm">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>
              {t("blog.posts.table.title")}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("blog.posts.table.status")}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("blog.posts.table.createdBy")}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("blog.posts.table.publishedAt")}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("blog.posts.table.views")}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("translations.managed.tableHeader", {
                defaultValue: "Translations",
              })}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("blog.posts.table.actions")}
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

  if (isEmpty(posts)) {
    return (
      <Table.Root size="sm">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>
              {t("blog.posts.table.title")}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("blog.posts.table.status")}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("blog.posts.table.createdBy")}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("blog.posts.table.publishedAt")}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("blog.posts.table.views")}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("translations.managed.tableHeader", {
                defaultValue: "Translations",
              })}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("blog.posts.table.actions")}
            </Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row>
            <Table.Cell colSpan={7} textAlign="center" py={8}>
              <Empty
                title={t("blog.posts.empty.title")}
                description={t("blog.posts.empty.description")}
                icon="article"
              />
            </Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table.Root>
    );
  }

  const getStatusBadge = (status: BlogPostStatus) => {
    switch (status) {
      case BlogPostStatus.PUBLISHED:
        return <Badge colorScheme="green">{t("blog.status.published")}</Badge>;
      case BlogPostStatus.DRAFT:
        return <Badge colorScheme="gray">{t("blog.status.draft")}</Badge>;
      case BlogPostStatus.SCHEDULED:
        return <Badge colorScheme="blue">{t("blog.status.scheduled")}</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <Table.Root size="sm">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeader>{t("blog.posts.table.title")}</Table.ColumnHeader>
          <Table.ColumnHeader>
            {t("blog.posts.table.status")}
          </Table.ColumnHeader>
          <Table.ColumnHeader>
            {t("blog.posts.table.createdBy")}
          </Table.ColumnHeader>
          <Table.ColumnHeader>
            {t("blog.posts.table.publishedAt")}
          </Table.ColumnHeader>
          <Table.ColumnHeader>{t("blog.posts.table.views")}</Table.ColumnHeader>
          <Table.ColumnHeader>
            {t("translations.managed.tableHeader", {
              defaultValue: "Translations",
            })}
          </Table.ColumnHeader>
          <Table.ColumnHeader>
            {t("blog.posts.table.actions")}
          </Table.ColumnHeader>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {posts.map((post) => (
          <Table.Row key={post.id}>
            <Table.Cell>
              <div>
                <div className="font-medium">{post.title}</div>
                <div className="text-sm text-gray-500 truncate max-w-xs">
                  {post.excerpt}
                </div>
              </div>
            </Table.Cell>
            <Table.Cell minW={"150px"}>
              {getStatusBadge(post.status)}
            </Table.Cell>
            <Table.Cell minW={"150px"}>
              {post.createdBy?.name || t("common.unknown")}
            </Table.Cell>
            <Table.Cell minW={"150px"}>
              {formatTimestamp(post.publishedAt)}
            </Table.Cell>
            <Table.Cell minW={"150px"}>{post.views || 0}</Table.Cell>
            <Table.Cell minW={"150px"}>
              <ManagedTranslationStatusIndicator
                kind="blogPost"
                source={post}
              />
            </Table.Cell>
            <Table.Cell minW={"150px"}>
              <div className="flex items-center gap-2">
                <IconButton
                  size="sm"
                  variant="ghost"
                  aria-label={t("common.edit")}
                  onClick={() => handleEdit(post)}
                >
                  <MaterialSymbol>edit</MaterialSymbol>
                </IconButton>
                <IconButton
                  size="sm"
                  variant="ghost"
                  aria-label={t("common.delete")}
                  colorScheme="red"
                  onClick={() => handleDeleteClick(post)}
                >
                  <MaterialSymbol>delete</MaterialSymbol>
                </IconButton>
              </div>
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>

      <AlertDialog
        header={t("blog.posts.confirmDelete")}
        handle={handleDeleteConfirm}
        open={showDeleteDialog}
        setOpen={setShowDeleteDialog}
        t={t}
      >
        {postToDelete && (
          <div>
            <p>{t("blog.posts.deleteConfirmMessage")}</p>
            <p>
              <strong>{postToDelete.title}</strong>
            </p>
          </div>
        )}
      </AlertDialog>
    </Table.Root>
  );
}
