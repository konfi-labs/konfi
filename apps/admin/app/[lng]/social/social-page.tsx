"use client";

import { useT } from "@/i18n/client";
import { useSocial } from "@/context/social";
import { type SocialPostView } from "@/actions/social";
import { Button, Flex, Heading, Separator, Spacer, Tabs } from "@chakra-ui/react";
import {
  CustomHeading,
  Empty,
  MaterialSymbol,
  RefreshButton,
} from "@konfi/components";
import ConnectionCard from "@/components/social/ConnectionCard";
import PostsList from "@/components/social/PostsList";
import PostsCalendar from "@/components/social/PostsCalendar";
import PostComposer from "@/components/social/PostComposer";
import { useState } from "react";

export default function SocialPage() {
  const { t } = useT();
  const { posts, loadingPosts, refreshPosts } = useSocial();

  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<SocialPostView | null>(null);

  function handleNewPost() {
    setEditingPost(null);
    setComposerOpen(true);
  }

  function handleEditPost(post: SocialPostView) {
    setEditingPost(post);
    setComposerOpen(true);
  }

  return (
    <>
      <CustomHeading
        heading={t("ROUTES.social", { defaultValue: "Social media" })}
        mb="8"
        breadcrumb={true}
        goBack={true}
        t={t}
      />

      <Heading my={"4"} size={"md"}>
        {t("social.connectionSection", { defaultValue: "Connection" })}
      </Heading>
      <ConnectionCard />

      <Separator my={"6"} />

      <Heading my={"4"} size={"md"}>
        {t("social.postsSection", { defaultValue: "Posts" })}
      </Heading>

      <Flex flexDir={["column", "row"]} gap={["2", "2"]} align={["stretch", "center"]}>
        <Spacer />
        <RefreshButton
          w={["100%", "auto"]}
          label={t("social.refreshPosts", { defaultValue: "Refresh posts" })}
          refreshFunction={() => refreshPosts()}
        />
        <Button
          colorPalette="primary"
          variant="solid"
          w={["100%", "auto"]}
          onClick={handleNewPost}
        >
          <MaterialSymbol>add</MaterialSymbol>
          {t("social.newPost", { defaultValue: "New post" })}
        </Button>
      </Flex>

      <Tabs.Root defaultValue="list" variant="enclosed" mt={4}>
        <Tabs.List>
          <Tabs.Trigger value="list">
            <MaterialSymbol>list</MaterialSymbol>
            {t("social.viewList", { defaultValue: "List" })}
          </Tabs.Trigger>
          <Tabs.Trigger value="calendar">
            <MaterialSymbol>calendar_month</MaterialSymbol>
            {t("social.viewCalendar", { defaultValue: "Calendar" })}
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="list" pt={4}>
          {!loadingPosts && posts.length === 0 ? (
            <Empty
              icon={"schedule_send"}
              title={t("social.noPosts", { defaultValue: "No posts yet" })}
              description={t("social.noPostsDescription", {
                defaultValue: "Create your first post to get started.",
              })}
            />
          ) : (
            <PostsList onEdit={handleEditPost} />
          )}
        </Tabs.Content>
        <Tabs.Content value="calendar" pt={4}>
          <PostsCalendar onEdit={handleEditPost} />
        </Tabs.Content>
      </Tabs.Root>

      <PostComposer
        open={composerOpen}
        setOpen={setComposerOpen}
        post={editingPost}
        onSuccess={() => refreshPosts()}
      />
    </>
  );
}
