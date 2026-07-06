"use client";

import { createContext, useContext, type ReactNode } from "react";
import { defaultLocale, isLocale, type Locale } from "../lib/i18n";

const DocsLocaleContext = createContext<Locale>(defaultLocale);

type DocsLocaleProviderProps = {
  children: ReactNode;
  locale?: unknown;
};

export function DocsLocaleProvider({
  children,
  locale,
}: DocsLocaleProviderProps) {
  const value =
    typeof locale === "string" && isLocale(locale) ? locale : defaultLocale;

  return (
    <DocsLocaleContext.Provider value={value}>
      {children}
    </DocsLocaleContext.Provider>
  );
}

export function useDocsLocale() {
  return useContext(DocsLocaleContext);
}
