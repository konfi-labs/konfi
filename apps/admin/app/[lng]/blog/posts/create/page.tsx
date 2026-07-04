"use client";

import BlogPostForm from "@/components/blog/BlogPostForm";
import { useT } from "@/i18n/client";
import { Stack } from "@chakra-ui/react";
import { CustomHeading } from "@konfi/components";
import { ADMIN_BLOG_POSTS, ADMIN_BLOG_POSTS_EDIT } from "@konfi/utils";
import { useRouter } from "next/navigation";

export default function CreateBlogPostPage() {
  const { t } = useT();
  const router = useRouter();

  const handleSuccess = (postId: string) => {
    // Redirect to edit page where user can add translations
    router.push(ADMIN_BLOG_POSTS_EDIT(postId));
  };

  const handleCancel = () => {
    router.push(ADMIN_BLOG_POSTS);
  };

  return (
    <Stack gap={6}>
      <CustomHeading
        heading={t("blog.posts.createTitle")}
        breadcrumb={true}
        goBack={true}
        t={t}
      />

      <BlogPostForm onSuccess={handleSuccess} onCancel={handleCancel} />
    </Stack>
  );
}
