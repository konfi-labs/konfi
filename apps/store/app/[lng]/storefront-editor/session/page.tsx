import type { Metadata } from "next";
import { DEFAULT_LOCALE, Locale } from "@konfi/types";
import StorefrontEditorSessionBridge from "./StorefrontEditorSessionBridge";

type Params = Promise<{ lng: string }>;

const supportedLocales = new Set<string>(Object.values(Locale));

const normalizeLocale = (lng: string): Locale =>
  supportedLocales.has(lng) ? (lng as Locale) : DEFAULT_LOCALE;

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false,
  },
};

export default async function Page({ params }: { params: Params }) {
  const { lng } = await params;

  return <StorefrontEditorSessionBridge lng={normalizeLocale(lng)} />;
}
