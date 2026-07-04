import { app } from "electron";

/**
 * Menu translations for all supported languages
 */
type SupportedLocale = "en" | "pl";
type MenuKey =
  | "checkForUpdates"
  | "copyLink"
  | "editMenu"
  | "fileMenu"
  | "learnMore"
  | "openLink"
  | "speechMenu"
  | "viewMenu"
  | "windowMenu"
  | "fileAlreadyExists"
  | "fileAlreadyExistsMessage"
  | "fileAlreadyExistsDetail"
  | "cancel"
  | "replace"
  | "fileAlreadyExistsInTemp"
  | "fileAlreadyExistsInTempMessage";

export const DEFAULT_LOCALE: SupportedLocale = "pl";

const menuTranslations: Record<SupportedLocale, Record<MenuKey, string>> = {
  en: {
    checkForUpdates: "Check for Updates...",
    copyLink: "Copy Link",
    editMenu: "Edit",
    fileMenu: "File",
    learnMore: "Learn More",
    openLink: "Open Link",
    speechMenu: "Speech",
    viewMenu: "View",
    windowMenu: "Window",
    fileAlreadyExists: "File Already Exists",
    fileAlreadyExistsMessage: 'The file "{0}" already exists.',
    fileAlreadyExistsDetail: "Do you want to replace it?",
    cancel: "Cancel",
    replace: "Replace",
    fileAlreadyExistsInTemp: "File Already Exists",
    fileAlreadyExistsInTempMessage:
      'The file "{0}" already exists in temporary folder.',
  },
  pl: {
    checkForUpdates: "Sprawdź aktualizacje...",
    copyLink: "Kopiuj link",
    editMenu: "Edycja",
    fileMenu: "Plik",
    learnMore: "Dowiedz się więcej",
    openLink: "Otwórz link",
    speechMenu: "Mowa",
    viewMenu: "Widok",
    windowMenu: "Okno",
    fileAlreadyExists: "Plik już istnieje",
    fileAlreadyExistsMessage: 'Plik "{0}" już istnieje.',
    fileAlreadyExistsDetail: "Czy chcesz go zastąpić?",
    cancel: "Anuluj",
    replace: "Zastąp",
    fileAlreadyExistsInTemp: "Plik już istnieje",
    fileAlreadyExistsInTempMessage:
      'Plik "{0}" już istnieje w folderze tymczasowym.',
  },
};

/**
 * Type guard to check if a string is a supported locale
 */
function isSupportedLocale(locale: string): locale is SupportedLocale {
  return locale === "en" || locale === "pl";
}

/**
 * Returns the localized menu label for a given key.
 * @param {MenuKey} key - The menu item key to translate.
 * @returns {string} The translated label for the current OS locale, or English as fallback.
 */

export function getMenuLabel(key: MenuKey, ...args: string[]): string {
  // Get OS locale (e.g., 'en-US', 'en_US' -> 'en')
  const osLocale = app.getLocale().split(/[-_]/)[0];
  // Check if the locale is supported, fallback to default
  const locale: SupportedLocale = isSupportedLocale(osLocale)
    ? osLocale
    : DEFAULT_LOCALE;

  let translation =
    menuTranslations[locale][key] ??
    menuTranslations[DEFAULT_LOCALE][key] ??
    key;

  // Replace placeholders {0}, {1}, etc. with provided arguments
  args.forEach((arg, index) => {
    translation = translation.replace(`{${index}}`, arg);
  });

  return translation;
}
