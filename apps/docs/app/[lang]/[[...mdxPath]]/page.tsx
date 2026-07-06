import { generateStaticParamsFor, importPage } from "nextra/pages";
import { notFound } from "next/navigation";
import { useMDXComponents as getMDXComponents } from "../../../mdx-components";
import { isLocale, type Locale } from "../../../lib/i18n";
import type { ComponentType, ReactNode } from "react";

type PageParams = {
  lang: string;
  mdxPath?: string[];
};

type PageProps = {
  params: Promise<PageParams>;
};

type MdxWrapperProps = {
  children: ReactNode;
  locale?: Locale;
  metadata: unknown;
  sourceCode: unknown;
  toc: unknown;
};

export const generateStaticParams = generateStaticParamsFor("mdxPath", "lang");

export async function generateMetadata({ params }: PageProps) {
  const { lang, mdxPath } = await params;

  if (!isLocale(lang)) {
    notFound();
  }

  const { metadata } = await importPage(mdxPath, lang);

  return metadata;
}

const Wrapper = getMDXComponents().wrapper as
  | ComponentType<MdxWrapperProps>
  | undefined;

export default async function Page(props: PageProps) {
  const params = await props.params;

  if (!isLocale(params.lang)) {
    notFound();
  }

  const {
    default: MDXContent,
    toc,
    metadata,
    sourceCode,
  } = await importPage(params.mdxPath, params.lang);

  const content = <MDXContent {...props} params={params} />;

  if (!Wrapper) {
    return content;
  }

  return (
    <Wrapper
      toc={toc}
      metadata={metadata}
      sourceCode={sourceCode}
      locale={params.lang}
    >
      {content}
    </Wrapper>
  );
}
