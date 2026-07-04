import i18next from "i18next";
import type { ResourceKey } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import resourcesToBackend from "i18next-resources-to-backend";
import { initReactI18next } from "react-i18next/initReactI18next";
import { fallbackLng, languages, defaultNS } from "./settings";

const runsOnServerSide = typeof window === "undefined";

function loadResource(language: string, namespace: string) {
  const resolvedLanguage = normalizeLanguage(language);
  return import(`./locales/${resolvedLanguage}/${namespace}.json`).then(
    (module) => module.default as ResourceKey,
  );
}

function normalizeLanguage(language: string) {
  const languageCode = language.split("-")[0] ?? fallbackLng;

  return languages.includes(languageCode) ? languageCode : fallbackLng;
}

i18next
  .use(initReactI18next)
  .use(LanguageDetector)
  .use(resourcesToBackend(loadResource))
  .init({
    // debug: true,
    supportedLngs: languages,
    fallbackLng,
    lng: undefined, // let detect the language on client side
    fallbackNS: defaultNS,
    defaultNS,
    react: {
      nsMode: "fallback",
    },
    detection: {
      order: ["path", "htmlTag", "cookie", "navigator"],
    },
    preload: runsOnServerSide ? languages : [],
  });

export default i18next;
