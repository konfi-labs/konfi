import i18next from "@/i18n/i18next";
import AdminLoadingSkeleton from "@/components/layout/AdminLoadingSkeleton";
import { Metadata } from "next";
import { Suspense } from "react";
import NotesPage from "./notes-page";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default function Page(props: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AdminLoadingSkeleton variant="table" rows={8} />}>
      <NotesPageWithSearchParams searchParams={props.searchParams} />
    </Suspense>
  );
}

async function NotesPageWithSearchParams({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const resolvedSearchParams = await searchParams;

  return (
    <NotesPage
      searchParamsCurrentNote={resolvedSearchParams.currentNote}
      searchParamsChannelId={resolvedSearchParams.channelId as string}
      searchParamsMemberEmail={resolvedSearchParams.memberEmail as string}
    />
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");
  return {
    title: t("ROUTES.notes"),
  };
}
