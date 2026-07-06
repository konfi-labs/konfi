"use client";

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type SyntheticEvent,
} from "react";
import cs from "../lib/locales/cs.json";
import de from "../lib/locales/de.json";
import en from "../lib/locales/en.json";
import fr from "../lib/locales/fr.json";
import pl from "../lib/locales/pl.json";
import sk from "../lib/locales/sk.json";
import uk from "../lib/locales/uk.json";
import type { DocsDictionary, Locale } from "../lib/i18n";
import { useDocsLocale } from "./docs-locale-provider";

type StoryFrameProps = {
  id: string;
  title: string;
  height?: number;
  globals?: string;
  storybookBaseUrl?: string;
  viewMode?: "story" | "docs";
};

type StoryFrameLabels = DocsDictionary["storyFrame"];
type StoryFrameTheme = "dark" | "light";
type DocumentThemeState = {
  ready: boolean;
  theme: StoryFrameTheme;
};
const colorSchemeQuery = "(prefers-color-scheme: dark)";
const frameBackground = {
  dark: "#09090b",
  light: "#ffffff",
} satisfies Record<StoryFrameTheme, string>;

const storyFrameLabels = {
  cs: cs.storyFrame,
  de: de.storyFrame,
  en: en.storyFrame,
  fr: fr.storyFrame,
  pl: pl.storyFrame,
  sk: sk.storyFrame,
  uk: uk.storyFrame,
} satisfies Record<Locale, StoryFrameLabels>;

function getStorybookBaseUrl(storybookBaseUrl?: string) {
  const baseUrl = (
    storybookBaseUrl ??
    process.env.NEXT_PUBLIC_STORYBOOK_URL ??
    "/storybook"
  ).replace(/\/$/, "");

  if (/^https?:\/\//.test(baseUrl) || baseUrl.startsWith("/")) {
    return baseUrl;
  }

  return `/${baseUrl.replace(/^\.\//, "")}`;
}

function getStoryFrameTheme(theme: string | undefined): StoryFrameTheme {
  return theme === "dark" ? "dark" : "light";
}

function readDocumentTheme(): StoryFrameTheme {
  if (typeof document === "undefined") {
    return "light";
  }

  const root = document.documentElement;
  const theme = root.getAttribute("data-theme");

  if (
    theme === "dark" ||
    root.classList.contains("dark") ||
    root.style.colorScheme === "dark"
  ) {
    return "dark";
  }

  if (
    theme === "light" ||
    root.classList.contains("light") ||
    root.style.colorScheme === "light"
  ) {
    return "light";
  }

  return window.matchMedia(colorSchemeQuery).matches ? "dark" : "light";
}

function useDocumentTheme() {
  const [state, setState] = useState<DocumentThemeState>({
    ready: false,
    theme: "light",
  });

  useEffect(() => {
    const syncTheme = () => {
      setState({
        ready: true,
        theme: readDocumentTheme(),
      });
    };
    const media = window.matchMedia(colorSchemeQuery);
    const observer = new MutationObserver(syncTheme);

    syncTheme();
    observer.observe(document.documentElement, {
      attributeFilter: ["class", "data-theme", "style"],
      attributes: true,
    });
    media.addEventListener("change", syncTheme);

    return () => {
      observer.disconnect();
      media.removeEventListener("change", syncTheme);
    };
  }, []);

  return state;
}

function getThemedGlobals(globals: string | undefined, theme: StoryFrameTheme) {
  const entries = (globals ?? "")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => !entry.startsWith("theme:"));

  return [`theme:${theme}`, ...entries].join(";");
}

function getStoryUrl({
  globals,
  id,
  storybookBaseUrl,
  theme,
  viewMode = "story",
}: StoryFrameProps & { theme: StoryFrameTheme }) {
  const params = new URLSearchParams({
    id,
    viewMode,
  });
  const themedGlobals = getThemedGlobals(globals, theme);

  params.set("globals", themedGlobals);

  return `${getStorybookBaseUrl(storybookBaseUrl)}/iframe.html?${params.toString()}`;
}

export function StoryFrame(props: StoryFrameProps) {
  const { height = 420, title } = props;
  const locale = useDocsLocale();
  const documentTheme = useDocumentTheme();
  const [loadedStoryUrl, setLoadedStoryUrl] = useState<string | null>(null);
  const labels = storyFrameLabels[locale];
  const theme = getStoryFrameTheme(documentTheme.theme);
  const storyUrl = useMemo(
    () => (documentTheme.ready ? getStoryUrl({ ...props, theme }) : ""),
    [
      documentTheme.ready,
      props.globals,
      props.id,
      props.storybookBaseUrl,
      props.viewMode,
      theme,
    ],
  );
  const frameStyle = {
    "--konfi-story-frame-height": `${height}px`,
  } as CSSProperties;
  const loaded = Boolean(storyUrl && loadedStoryUrl === storyUrl);

  function handleFrameLoad(event: SyntheticEvent<HTMLIFrameElement>) {
    const iframe = event.currentTarget;
    const loadedUrl = storyUrl;

    try {
      const iframeDocument = iframe.contentDocument;
      const background = frameBackground[theme];

      if (iframeDocument) {
        iframeDocument.documentElement.style.background = background;
        iframeDocument.documentElement.style.colorScheme = theme;

        if (iframeDocument.body) {
          iframeDocument.body.style.background = background;
        }
      }
    } catch {
      // Cross-origin Storybook URLs cannot be styled from the docs page.
    }

    window.setTimeout(() => {
      window.requestAnimationFrame(() => {
        setLoadedStoryUrl(loadedUrl);
      });
    }, 120);
  }

  return (
    <figure
      className="konfi-story-frame"
      data-loaded={loaded ? "true" : "false"}
      style={frameStyle}
    >
      <div
        className="konfi-story-frame__stage"
        aria-busy={loaded ? "false" : "true"}
      >
        {storyUrl ? (
          <iframe
            allow="clipboard-write"
            className="konfi-story-frame__iframe"
            height={height}
            loading="lazy"
            onLoad={handleFrameLoad}
            src={storyUrl}
            title={title}
          />
        ) : null}
        <div className="konfi-story-frame__loading" role="status">
          <span className="konfi-story-frame__spinner" aria-hidden="true" />
          <span>{labels.loadingExample}</span>
        </div>
      </div>
      <figcaption className="konfi-story-frame__caption">
        <span>{title}</span>
        {storyUrl ? (
          <a href={storyUrl} rel="noreferrer" target="_blank">
            {labels.openExample}
          </a>
        ) : null}
      </figcaption>
    </figure>
  );
}
