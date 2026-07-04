"use client";

import BlogTagForm from "@/components/blog/BlogTagForm";
import { useT } from "@/i18n/client";
import { Stack } from "@chakra-ui/react";
import { CustomHeading } from "@konfi/components";
import { ADMIN_BLOG_TAGS, ADMIN_BLOG_TAGS_EDIT } from "@konfi/utils";
import { useRouter } from "next/navigation";

export default function CreateBlogTagPage() {
  const { t } = useT();
  const router = useRouter();

  const handleSuccess = (tagId: string) => {
    // Redirect to edit page where user can add translations
    router.push(ADMIN_BLOG_TAGS_EDIT(tagId));
  };

  const handleCancel = () => {
    router.push(ADMIN_BLOG_TAGS);
  };

  return (
    <Stack gap={6}>
      <CustomHeading
        heading={t("blog.tags.createTitle")}
        breadcrumb={true}
        goBack={true}
        t={t}
      />

      <BlogTagForm onSuccess={handleSuccess} onCancel={handleCancel} />
    </Stack>
  );
}
