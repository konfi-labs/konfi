"use server";

import { headers } from "next/headers";
import { createServerI18n } from "./server";
import { fallbackLng, headerName } from "./settings";

export async function getT(
  ns?: string | string[],
  options?: { keyPrefix?: string },
) {
  "use server";
  const headerList = await headers();
  const lng = headerList.get(headerName);
  const i18next = await createServerI18n(lng, ns);
  const resolvedLanguage =
    i18next.resolvedLanguage ?? i18next.language ?? fallbackLng;

  return {
    t: i18next.getFixedT(
      resolvedLanguage,
      Array.isArray(ns) ? ns[0] : ns,
      options?.keyPrefix,
    ),
    i18n: i18next,
  };
}
