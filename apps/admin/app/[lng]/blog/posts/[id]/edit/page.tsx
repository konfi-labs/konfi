"use client";

import BlogPostForm from "@/components/blog/BlogPostForm";
import { BlogPostTranslationForm } from "@/components/blog/BlogPostTranslationForm";
import AdminLoadingSkeleton from "@/components/layout/AdminLoadingSkeleton";
import { TranslationPanel } from "@/components/translations/TranslationPanel";
import { useBlogPost } from "@/hooks/useBlog";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { Stack } from "@chakra-ui/react";
import { CustomHeading, EmptyState } from "@konfi/components";
import { getBlogPostTranslations } from "@konfi/firebase";
import { BlogPost } from "@konfi/types";
import { ADMIN_BLOG_POSTS } from "@konfi/utils";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";

export default function EditBlogPostPage() {
  const { t } = useT();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { data: post, isLoading, error } = useBlogPost(params?.id);

  const handleSuccess = () => {
    router.push(ADMIN_BLOG_POSTS);
  };

  const handleCancel = () => {
    router.push(ADMIN_BLOG_POSTS);
  };

  if (isLoading) {
    return (
      <Stack gap={6}>
        <CustomHeading
          heading={t("blog.posts.editTitle")}
          breadcrumb={true}
          goBack={true}
          t={t}
        />
        <AdminLoadingSkeleton variant="fields" showHeader={false} rows={6} />
      </Stack>
    );
  }

  if (error || !post) {
    return (
      <Stack gap={6}>
        <CustomHeading
          heading={t("blog.posts.editTitle")}
          breadcrumb={true}
          goBack={true}
          t={t}
        />
        <EmptyState
          title={t("blog.posts.notFound")}
          description={t("blog.posts.notFoundDescription")}
        />
      </Stack>
    );
  }

  return (
    <Stack gap={6}>
      <CustomHeading
        heading={t("blog.posts.editTitle")}
        breadcrumb={true}
        goBack={true}
        t={t}
      />

      <BlogPostForm
        post={post}
        onSuccess={handleSuccess}
        onCancel={handleCancel}
      />

      {post && <PostTranslationsPanel postId={post.id} post={post} />}
    </Stack>
  );
}

function PostTranslationsPanel({
  postId,
  post,
}: {
  postId: string;
  post: BlogPost;
}) {
  const { data: translations, mutate: mutateTranslations } = useSWR(
    postId ? ["blogPostTranslations", postId] : null,
    () => getBlogPostTranslations(firestore, postId),
  );
  return (
    <TranslationPanel
      kind="blogPost"
      source={post}
      translationRef={{ kind: "blogPost", entityId: postId }}
      translations={translations}
      onMutate={mutateTranslations}
      renderForm={({ locale, translation, type }) => (
        <BlogPostTranslationForm
          locale={locale}
          blogPost={post}
          type={type}
          translation={translation}
          mutateTranslations={mutateTranslations}
        />
      )}
    />
  );
}
