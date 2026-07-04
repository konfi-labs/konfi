"use client";

import BlogTagForm from "@/components/blog/BlogTagForm";
import { BlogTagTranslationForm } from "@/components/blog/BlogTagTranslationForm";
import AdminLoadingSkeleton from "@/components/layout/AdminLoadingSkeleton";
import { TranslationPanel } from "@/components/translations/TranslationPanel";
import { useBlogTag } from "@/hooks/useBlog";
import { useT } from "@/i18n/client";
import { Stack } from "@chakra-ui/react";
import { CustomHeading, EmptyState } from "@konfi/components";
import { BlogTag } from "@konfi/types";
import { ADMIN_BLOG_TAGS } from "@konfi/utils";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { getBlogTagTranslations } from "@konfi/firebase";
import { firestore } from "@/lib/firebase/clientApp";

export default function EditBlogTagPage() {
  const { t } = useT();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { data: tag, isLoading, error } = useBlogTag(params?.id);

  const handleSuccess = () => {
    router.push(ADMIN_BLOG_TAGS);
  };

  const handleCancel = () => {
    router.push(ADMIN_BLOG_TAGS);
  };

  if (isLoading) {
    return (
      <Stack gap={6}>
        <CustomHeading
          heading={t("blog.tags.editTitle")}
          breadcrumb={true}
          goBack={true}
          t={t}
        />
        <AdminLoadingSkeleton variant="fields" showHeader={false} rows={6} />
      </Stack>
    );
  }

  if (error || !tag) {
    return (
      <Stack gap={6}>
        <CustomHeading
          heading={t("blog.tags.editTitle")}
          breadcrumb={true}
          goBack={true}
          t={t}
        />
        <EmptyState
          title={t("blog.tags.notFound")}
          description={t("blog.tags.notFoundDescription")}
        />
      </Stack>
    );
  }

  return (
    <Stack gap={6}>
      <CustomHeading
        heading={t("blog.tags.editTitle")}
        breadcrumb={true}
        goBack={true}
        t={t}
      />

      <BlogTagForm
        tag={tag}
        onSuccess={handleSuccess}
        onCancel={handleCancel}
      />

      {tag && <TagTranslationsPanel tagId={tag.id} tag={tag} />}
    </Stack>
  );
}

function TagTranslationsPanel({ tagId, tag }: { tagId: string; tag: BlogTag }) {
  const { data: translations, mutate: mutateTranslations } = useSWR(
    tagId ? ["blogTagTranslations", tagId] : null,
    () => getBlogTagTranslations(firestore, tagId),
  );
  return (
    <TranslationPanel
      kind="blogTag"
      source={tag}
      translationRef={{ kind: "blogTag", entityId: tagId }}
      translations={translations}
      onMutate={mutateTranslations}
      renderForm={({ locale, translation, type }) => (
        <BlogTagTranslationForm
          locale={locale}
          blogTag={tag}
          type={type}
          translation={translation}
          mutateTranslations={mutateTranslations}
        />
      )}
    />
  );
}
