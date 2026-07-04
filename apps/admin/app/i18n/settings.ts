import { DEFAULT_LOCALE, Locale } from "@konfi/types";

export const fallbackLng = DEFAULT_LOCALE;
export const languages: string[] = Object.values(Locale);
export const defaultNS = "translation";
export const cookieName = "i18next";
export const headerName = "x-i18next-current-language";
