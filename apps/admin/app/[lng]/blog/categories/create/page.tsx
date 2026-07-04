"use client";

import BlogCategoryForm from "@/components/blog/BlogCategoryForm";
import { useT } from "@/i18n/client";
import { Stack } from "@chakra-ui/react";
import { CustomHeading } from "@konfi/components";
import {
  ADMIN_BLOG_CATEGORIES,
  ADMIN_BLOG_CATEGORIES_EDIT,
} from "@konfi/utils";
import { useRouter } from "next/navigation";

export default function CreateBlogCategoryPage() {
  const { t } = useT();
  const router = useRouter();

  const handleSuccess = (categoryId: string) => {
    // Redirect to edit page where user can add translations
    router.push(ADMIN_BLOG_CATEGORIES_EDIT(categoryId));
  };

  const handleCancel = () => {
    router.push(ADMIN_BLOG_CATEGORIES);
  };

  return (
    <Stack gap={6}>
      <CustomHeading
        heading={t("blog.categories.create")}
        breadcrumb={true}
        goBack={true}
        t={t}
      />

      <BlogCategoryForm onSuccess={handleSuccess} onCancel={handleCancel} />
    </Stack>
  );
}
