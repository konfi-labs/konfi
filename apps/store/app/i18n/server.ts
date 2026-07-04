import { createInstance } from "i18next";
import type { i18n, ResourceKey } from "i18next";
import resourcesToBackend from "i18next-resources-to-backend";
import { defaultNS, fallbackLng, languages } from "./settings";

function normalizeLanguage(language: string | null | undefined) {
  const languageCode = language?.split("-")[0] ?? fallbackLng;

  return languages.includes(languageCode) ? languageCode : fallbackLng;
}

function loadResource(language: string, namespace: string) {
  const resolvedLanguage = normalizeLanguage(language);
  return import(`./locales/${resolvedLanguage}/${namespace}.json`).then(
    (module) => module.default as ResourceKey,
  );
}

export async function createServerI18n(
  language: string | null | undefined,
  namespace?: string | string[],
): Promise<i18n> {
  const resolvedLanguage = normalizeLanguage(language);
  const namespaces = namespace
    ? Array.isArray(namespace)
      ? namespace
      : [namespace]
    : [defaultNS];
  const instance = createInstance();

  await instance.use(resourcesToBackend(loadResource)).init({
    supportedLngs: languages,
    fallbackLng,
    lng: resolvedLanguage,
    fallbackNS: defaultNS,
    defaultNS,
    ns: namespaces,
    preload: [resolvedLanguage],
  });

  return instance;
}
