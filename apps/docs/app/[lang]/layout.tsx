import { Footer, LastUpdated, Layout, Navbar } from "nextra-theme-docs";
import { Head, Search } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  getDictionary,
  getDirection,
  getLayoutLocales,
  isLocale,
  locales,
} from "../../lib/i18n";
import "nextra-theme-docs/style.css";
import "../globals.css";

type LayoutParams = {
  lang: string;
};

type RootLayoutProps = {
  children: ReactNode;
  params: Promise<LayoutParams>;
};

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<LayoutParams>;
}): Promise<Metadata> {
  const { lang } = await params;

  if (!isLocale(lang)) {
    notFound();
  }

  const dictionary = await getDictionary(lang);

  return {
    title: {
      default: dictionary.metadata.title,
      template: dictionary.metadata.template,
    },
    description: dictionary.metadata.description,
  };
}

export default async function RootLayout({
  children,
  params,
}: RootLayoutProps) {
  const { lang } = await params;

  if (!isLocale(lang)) {
    notFound();
  }

  const dictionary = await getDictionary(lang);
  const navbar = (
    <Navbar
      logo={
        <Image
          alt="Konfi"
          className="konfi-docs-logo"
          height={20}
          priority
          src="/assets/logo.svg"
          width={96}
        />
      }
      projectLink="https://github.com/konfi-labs/konfi"
    />
  );
  const footer = (
    <Footer>
      {new Date().getFullYear()} © {dictionary.footer.copyright}
    </Footer>
  );
  const lastUpdated = <LastUpdated>{dictionary.lastUpdated}</LastUpdated>;
  const search = (
    <Search
      emptyResult={dictionary.search.emptyResult}
      errorText={dictionary.search.errorText}
      loading={dictionary.search.loading}
      placeholder={dictionary.search.placeholder}
    />
  );

  return (
    <html lang={lang} dir={getDirection(lang)} suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          navbar={navbar}
          pageMap={await getPageMap(`/${lang}`)}
          docsRepositoryBase="https://github.com/konfi-labs/konfi/tree/main/apps/docs"
          copyPageButton={false}
          editLink={dictionary.layout.editLink}
          feedback={{
            content: dictionary.layout.feedback,
            labels: "docs-feedback",
          }}
          footer={footer}
          i18n={getLayoutLocales()}
          lastUpdated={lastUpdated}
          search={search}
          sidebar={{ autoCollapse: true, defaultMenuCollapseLevel: 2 }}
          themeSwitch={dictionary.layout.themeSwitch}
          toc={dictionary.layout.toc}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
