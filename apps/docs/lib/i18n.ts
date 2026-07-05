export const locales = ["en", "pl", "de", "fr", "cs", "sk", "uk"] as const;

export type Locale = (typeof locales)[number];

export type LocaleDirection = "ltr" | "rtl";

type LocaleMetadata = {
  direction: LocaleDirection;
  name: string;
};

export type DocsDictionary = {
  footer: {
    copyright: string;
  };
  lastUpdated: string;
  layout: {
    editLink: string;
    feedback: string;
    themeSwitch: {
      dark: string;
      light: string;
      system: string;
    };
    toc: {
      backToTop: string;
      title: string;
    };
  };
  metadata: {
    description: string;
    template: string;
    title: string;
  };
  navbar: {
    logo: string;
  };
  pageActions: {
    chatGptPrompt: string;
    copied: string;
    copyPage: string;
    copyPageDescription: string;
    menuLabel: string;
    openInChatGPT: string;
    openInChatGPTDescription: string;
  };
  search: {
    emptyResult: string;
    errorText: string;
    loading: string;
    placeholder: string;
  };
  storyFrame: {
    loadingExample: string;
    openExample: string;
  };
};

export const defaultLocale: Locale = "en";

export const localeMetadata: Record<Locale, LocaleMetadata> = {
  cs: {
    direction: "ltr",
    name: "Čeština",
  },
  de: {
    direction: "ltr",
    name: "Deutsch",
  },
  en: {
    direction: "ltr",
    name: "English",
  },
  fr: {
    direction: "ltr",
    name: "Français",
  },
  pl: {
    direction: "ltr",
    name: "Polski",
  },
  sk: {
    direction: "ltr",
    name: "Slovenčina",
  },
  uk: {
    direction: "ltr",
    name: "Українська",
  },
};

const dictionaries = {
  cs: () => import("./locales/cs.json").then((module) => module.default),
  de: () => import("./locales/de.json").then((module) => module.default),
  en: () => import("./locales/en.json").then((module) => module.default),
  fr: () => import("./locales/fr.json").then((module) => module.default),
  pl: () => import("./locales/pl.json").then((module) => module.default),
  sk: () => import("./locales/sk.json").then((module) => module.default),
  uk: () => import("./locales/uk.json").then((module) => module.default),
} satisfies Record<Locale, () => Promise<DocsDictionary>>;

export function isLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale);
}

export function getDirection(locale: Locale): LocaleDirection {
  return localeMetadata[locale].direction;
}

export function getLayoutLocales() {
  return locales.map((locale) => ({
    locale,
    name: localeMetadata[locale].name,
  }));
}

export function getDictionary(locale: Locale): Promise<DocsDictionary> {
  return dictionaries[locale]();
}
