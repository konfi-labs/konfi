import { PageMarkdown } from "@/components/PageMarkdown";
import { fetchMetadata, fetchPageContent } from "@/lib/firebase/serverApp";
import { Skeleton } from "@chakra-ui/react";
import { Locale } from "@konfi/types";
import { T_STORE_REASONS_FOR_REJECTIONS } from "@konfi/utils";
import { Metadata } from "next";
import { Suspense } from "react";

type Params = Promise<{ id: string; lng: Locale }>;

export default async function Page({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton w={"100%"} h={"100vh"} />}>
      <ReasonsForRejectionsPageContent params={params} />
    </Suspense>
  );
}

async function ReasonsForRejectionsPageContent({ params }: { params: Params }) {
  const { lng } = await params;
  const source = await fetchPageContent(T_STORE_REASONS_FOR_REJECTIONS, lng);

  return <PageMarkdown source={source} />;
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { lng } = await params;
  return await fetchMetadata(T_STORE_REASONS_FOR_REJECTIONS, lng);
}
