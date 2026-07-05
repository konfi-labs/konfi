import { useMDXComponents as getNextraComponents } from "nextra-theme-docs";
import type { MDXComponents } from "mdx/types";
import type { ComponentType, ReactNode } from "react";
import { CopyPageActions } from "./components/copy-page-actions";
import { DocsLocaleProvider } from "./components/docs-locale-provider";
import type { Locale } from "./lib/i18n";

const defaultComponents = getNextraComponents();
const DefaultWrapper = defaultComponents.wrapper as
  | ComponentType<NextraWrapperProps>
  | undefined;

type NextraWrapperProps = {
  children: ReactNode;
  locale?: Locale;
  sourceCode?: string;
  [key: string]: unknown;
};

function DocsWrapper({
  children,
  locale,
  sourceCode,
  ...props
}: NextraWrapperProps) {
  const pageChildren = (
    <DocsLocaleProvider locale={locale}>
      {sourceCode ? <CopyPageActions sourceCode={sourceCode} /> : null}
      {children}
    </DocsLocaleProvider>
  );

  if (!DefaultWrapper) {
    return pageChildren;
  }

  return (
    <DefaultWrapper {...props} sourceCode={sourceCode}>
      {pageChildren}
    </DefaultWrapper>
  );
}

export function useMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultComponents,
    wrapper: DocsWrapper,
    ...components,
  };
}
