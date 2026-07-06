"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

type ColorScheme = "light" | "dark";
type ThemeAttribute = "class" | `data-${string}`;

export type ThemeProviderProps = {
  attribute?: ThemeAttribute | ThemeAttribute[];
  children?: ReactNode;
  defaultTheme?: string;
  disableTransitionOnChange?: boolean;
  enableColorScheme?: boolean;
  enableSystem?: boolean;
  forcedTheme?: string;
  nonce?: string;
  scriptProps?: Record<string, unknown>;
  storageKey?: string;
  themes?: string[];
  value?: Record<string, string>;
};

export type UseThemeProps = {
  forcedTheme?: string;
  resolvedTheme?: string;
  setTheme: Dispatch<SetStateAction<string>>;
  systemTheme?: ColorScheme;
  theme?: string;
  themes: string[];
};

const defaultThemes = ["light", "dark"];
const mediaQuery = "(prefers-color-scheme: dark)";
const colorSchemes = new Set<string>(defaultThemes);

const ThemeContext = createContext<UseThemeProps | undefined>(undefined);

function getSystemTheme(): ColorScheme {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia(mediaQuery).matches ? "dark" : "light";
}

function getStoredTheme(storageKey: string, defaultTheme: string): string {
  if (typeof window === "undefined") {
    return defaultTheme;
  }

  try {
    return window.localStorage.getItem(storageKey) ?? defaultTheme;
  } catch {
    return defaultTheme;
  }
}

function resolveTheme(
  theme: string,
  systemTheme: ColorScheme,
  enableSystem: boolean,
): string {
  if (theme === "system" && enableSystem) {
    return systemTheme;
  }

  return theme;
}

function disableTransitions(nonce?: string): () => void {
  const style = document.createElement("style");

  if (nonce) {
    style.setAttribute("nonce", nonce);
  }

  style.appendChild(
    document.createTextNode("*,*::before,*::after{transition:none!important}"),
  );
  document.head.appendChild(style);

  return () => {
    window.getComputedStyle(document.body);
    setTimeout(() => {
      style.remove();
    }, 1);
  };
}

function applyTheme({
  attribute,
  defaultTheme,
  disableTransitionOnChange,
  enableColorScheme,
  enableSystem,
  nonce,
  systemTheme,
  theme,
  themes,
  value,
}: Required<
  Pick<
    ThemeProviderProps,
    | "attribute"
    | "defaultTheme"
    | "disableTransitionOnChange"
    | "enableColorScheme"
    | "enableSystem"
    | "storageKey"
    | "themes"
  >
> &
  Pick<ThemeProviderProps, "nonce" | "value"> & {
    systemTheme: ColorScheme;
    theme: string;
  }): void {
  const root = document.documentElement;
  const cleanup = disableTransitionOnChange
    ? disableTransitions(nonce)
    : undefined;
  const resolvedTheme = resolveTheme(theme, systemTheme, enableSystem);
  const resolvedValue = value?.[resolvedTheme] ?? resolvedTheme;
  const attributes = Array.isArray(attribute) ? attribute : [attribute];
  const themeValues = themes.map(
    (themeName) => value?.[themeName] ?? themeName,
  );

  for (const item of attributes) {
    if (item === "class") {
      root.classList.remove(...themeValues);

      if (resolvedValue) {
        root.classList.add(resolvedValue);
      }
    } else if (resolvedValue) {
      root.setAttribute(item, resolvedValue);
    } else {
      root.removeAttribute(item);
    }
  }

  if (enableColorScheme) {
    const colorScheme = colorSchemes.has(resolvedTheme)
      ? resolvedTheme
      : colorSchemes.has(defaultTheme)
        ? defaultTheme
        : undefined;

    if (colorScheme) {
      root.style.colorScheme = colorScheme;
    } else {
      root.style.removeProperty("color-scheme");
    }
  }

  cleanup?.();
}

function ThemeProviderRoot({
  attribute = "data-theme",
  children,
  defaultTheme,
  disableTransitionOnChange = false,
  enableColorScheme = true,
  enableSystem = true,
  forcedTheme,
  nonce,
  storageKey = "theme",
  themes = defaultThemes,
  value,
}: ThemeProviderProps) {
  const resolvedDefaultTheme =
    defaultTheme ?? (enableSystem ? "system" : "light");
  const [theme, setThemeState] = useState(() =>
    getStoredTheme(storageKey, resolvedDefaultTheme),
  );
  const [systemTheme, setSystemTheme] = useState<ColorScheme>(() =>
    getSystemTheme(),
  );

  const setTheme = useCallback<Dispatch<SetStateAction<string>>>(
    (nextTheme) => {
      const updatedTheme =
        typeof nextTheme === "function" ? nextTheme(theme) : nextTheme;

      setThemeState(updatedTheme);

      try {
        window.localStorage.setItem(storageKey, updatedTheme);
      } catch {
        // localStorage can be unavailable in locked-down browser contexts.
      }
    },
    [storageKey, theme],
  );

  useEffect(() => {
    const media = window.matchMedia(mediaQuery);
    const handleChange = () => {
      setSystemTheme(getSystemTheme());
    };

    handleChange();
    media.addEventListener("change", handleChange);

    return () => {
      media.removeEventListener("change", handleChange);
    };
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey) {
        setThemeState(event.newValue ?? resolvedDefaultTheme);
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [resolvedDefaultTheme, storageKey]);

  useEffect(() => {
    applyTheme({
      attribute,
      defaultTheme: resolvedDefaultTheme,
      disableTransitionOnChange,
      enableColorScheme,
      enableSystem,
      nonce,
      storageKey,
      systemTheme,
      theme: forcedTheme ?? theme,
      themes,
      value,
    });
  }, [
    attribute,
    disableTransitionOnChange,
    enableColorScheme,
    enableSystem,
    forcedTheme,
    nonce,
    resolvedDefaultTheme,
    storageKey,
    systemTheme,
    theme,
    themes,
    value,
  ]);

  const contextValue = useMemo<UseThemeProps>(
    () => ({
      forcedTheme,
      resolvedTheme: resolveTheme(theme, systemTheme, enableSystem),
      setTheme,
      systemTheme: enableSystem ? systemTheme : undefined,
      theme,
      themes: enableSystem ? [...themes, "system"] : themes,
    }),
    [enableSystem, forcedTheme, setTheme, systemTheme, theme, themes],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function ThemeProvider(props: ThemeProviderProps) {
  const existingContext = useContext(ThemeContext);

  if (existingContext) {
    return <>{props.children}</>;
  }

  return <ThemeProviderRoot {...props} />;
}

export function useTheme(): UseThemeProps {
  return (
    useContext(ThemeContext) ?? {
      resolvedTheme: "light",
      setTheme: () => {},
      systemTheme: "light",
      theme: "light",
      themes: defaultThemes,
    }
  );
}
