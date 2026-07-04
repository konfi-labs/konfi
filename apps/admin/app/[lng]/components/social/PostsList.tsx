"use client";

import { useSocial } from "@/context/social";
import { deleteSocialPost, type SocialPostView } from "@/actions/social";
import { useT } from "@/i18n/client";
import { Badge, Flex, Text } from "@chakra-ui/react";
import {
  AlertDialog,
  DataTable,
  Empty,
  MaterialSymbol,
  MenuItem,
  toaster,
} from "@konfi/components";
import { createColumnHelper } from "@tanstack/react-table";
import { startTransition, useMemo, useState } from "react";
import Menu from "@/components/Menu";

function StatusBadge({ status }: { status: SocialPostView["status"] }) {
  const palette: Record<SocialPostView["status"], string> = {
    draft: "gray",
    scheduled: "blue",
    publishing: "orange",
    published: "green",
    partial: "orange",
    failed: "red",
  };
  return (
    <Badge colorPalette={palette[status] ?? "gray"} size="sm">
      {status}
    </Badge>
  );
}

export default function PostsList({
  onEdit,
}: {
  onEdit: (post: SocialPostView) => void;
}) {
  const { t, i18n } = useT();
  const { posts, loadingPosts, refreshPosts } = useSocial();
  const columnHelper = createColumnHelper<SocialPostView>();
  const [currentPost, setCurrentPost] = useState<SocialPostView | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  async function handleDelete() {
    if (!currentPost) return;
    try {
      await deleteSocialPost(currentPost.id);
      toaster.success({
        title: t("social.postDeleted", { defaultValue: "Post deleted" }),
      });
      refreshPosts();
    } catch (error) {
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        header: t("social.postName", { defaultValue: "Name" }),
        cell: (info) => (
          <Text fontWeight="medium" maxW="200px" truncate>
            {info.getValue()}
          </Text>
        ),
      }),
      columnHelper.accessor("content", {
        header: t("social.postContent", { defaultValue: "Content" }),
        cell: (info) => (
          <Text fontSize="sm" color="fg.muted" maxW="260px" truncate>
            {info.getValue()}
          </Text>
        ),
      }),
      columnHelper.accessor("targets", {
        header: t("social.postTargets", { defaultValue: "Targets" }),
        cell: (info) => (
          <Flex gap={1} flexWrap="wrap">
            {info.getValue().map((target) => (
              <Badge
                key={`${target.provider}:${target.targetId}`}
                colorPalette={
                  target.provider === "facebook" ? "blue" : "purple"
                }
                size="sm"
              >
                {target.provider === "facebook" ? "FB" : "IG"}
              </Badge>
            ))}
          </Flex>
        ),
      }),
      columnHelper.accessor("status", {
        header: t("common.status", { defaultValue: "Status" }),
        cell: (info) => <StatusBadge status={info.getValue()} />,
      }),
      columnHelper.accessor("scheduledAt", {
        header: t("social.scheduledAt", { defaultValue: "Scheduled" }),
        cell: (info) => {
          const value = info.getValue();
          if (!value) return <Text color="fg.muted">—</Text>;
          return (
            <Text fontSize="sm">
              {new Date(value).toLocaleString(i18n.resolvedLanguage)}
            </Text>
          );
        },
      }),
      columnHelper.accessor("updatedAt", {
        header: t("table.updatedAt", { defaultValue: "Updated" }),
        cell: (info) => (
          <Text fontSize="sm">
            {new Date(info.getValue()).toLocaleDateString(
              i18n.resolvedLanguage,
            )}
          </Text>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: t("table.actions", { defaultValue: "Actions" }),
        meta: { isNumeric: true },
        cell: (props) => (
          <Flex justify="end" gap={1} onClick={(e) => e.stopPropagation()}>
            <Menu
              icon={<MaterialSymbol>menu_open</MaterialSymbol>}
              ariaLabel={t("table.actions", { defaultValue: "Actions" })}
            >
              <MenuItem
                value="edit"
                onClick={() => onEdit(props.row.original)}
              >
                <MaterialSymbol>edit_square</MaterialSymbol>
                {t("common.edit", { defaultValue: "Edit" })}
              </MenuItem>
              <MenuItem
                value="delete"
                color="fg.error"
                _hover={{ bg: "bg.error", color: "fg.error" }}
                onClick={() => {
                  startTransition(() => {
                    setCurrentPost(props.row.original);
                    setShowDeleteDialog(true);
                  });
                }}
              >
                <MaterialSymbol>delete</MaterialSymbol>
                {t("social.delete", { defaultValue: "Delete" })}
              </MenuItem>
            </Menu>
          </Flex>
        ),
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- columnHelper, t, onEdit and handlers are stable refs; only data/locale changes need recomputation
    [posts, i18n.resolvedLanguage],
  );

  if (!loadingPosts && posts.length === 0) {
    return (
      <Empty
        icon="schedule_send"
        title={t("social.noPosts", { defaultValue: "No posts yet" })}
        description={t("social.noPostsDescription", {
          defaultValue: "Create your first post to get started.",
        })}
      />
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={posts}
        paginationType="uncontrolled"
        t={t}
        i18n={i18n}
      />
      <AlertDialog
        header={t("social.deletePostConfirmHeader", {
          defaultValue: "Delete this post?",
        })}
        handle={() => void handleDelete()}
        open={showDeleteDialog}
        setOpen={setShowDeleteDialog}
        t={t}
      >
        <Text>
          {t("social.deletePostConfirm", {
            defaultValue: "This will permanently delete the post.",
          })}
        </Text>
      </AlertDialog>
    </>
  );
}
