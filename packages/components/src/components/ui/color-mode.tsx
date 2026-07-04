"use client";

import type { IconButtonProps, SpanProps } from "@chakra-ui/react";
import { ClientOnly, IconButton, Skeleton, Span } from "@chakra-ui/react";
import * as React from "react";
import { MaterialSymbol } from "../shared/MaterialSymbol";

type ColorModeAttribute = "class" | `data-${string}`;
type ThemePreference = ColorMode | "system";

export interface ColorModeProviderProps {
  attribute?: ColorModeAttribute | ColorModeAttribute[];
  children?: React.ReactNode;
  defaultTheme?: ThemePreference;
  disableTransitionOnChange?: boolean;
  enableColorScheme?: boolean;
  enableSystem?: boolean;
  forcedTheme?: ColorMode;
  storageKey?: string;
  themes?: string[];
  value?: Record<string, string>;
}

interface ColorModeStoreConfig {
  attribute: ColorModeAttribute | ColorModeAttribute[];
  defaultTheme: ThemePreference;
  disableTransitionOnChange: boolean;
  enableColorScheme: boolean;
  enableSystem: boolean;
  forcedTheme?: ColorMode;
  storageKey: string;
  themes: string[];
  value?: Record<string, string>;
}

const SYSTEM_THEME_MEDIA = "(prefers-color-scheme: dark)";
const DEFAULT_THEMES = ["light", "dark"];
const DEFAULT_CONFIG: ColorModeStoreConfig = {
  attribute: "class",
  defaultTheme: "system",
  disableTransitionOnChange: true,
  enableColorScheme: true,
  enableSystem: true,
  forcedTheme: undefined,
  storageKey: "theme",
  themes: [...DEFAULT_THEMES],
  value: undefined,
};

const defaultColorModeContext: UseColorModeReturn = {
  colorMode: "light",
  setColorMode: () => {},
  toggleColorMode: () => {},
};

const ColorModeContext = React.createContext<UseColorModeReturn>(
  defaultColorModeContext,
);

const colorModeListeners = new Set<() => void>();

let currentConfig = DEFAULT_CONFIG;
let currentSystemMode: ColorMode = "light";
let currentResolvedMode: ColorMode = "light";
let currentPreference: ThemePreference = DEFAULT_CONFIG.defaultTheme;
let globalListenersAttached = false;

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

export function ColorModeProvider(props: ColorModeProviderProps) {
  const config = React.useMemo<ColorModeStoreConfig>(
    () => ({
      attribute: props.attribute ?? "class",
      defaultTheme:
        props.defaultTheme ??
        (props.enableSystem === false ? "light" : "system"),
      disableTransitionOnChange: props.disableTransitionOnChange ?? true,
      enableColorScheme: props.enableColorScheme ?? true,
      enableSystem: props.enableSystem ?? true,
      forcedTheme: props.forcedTheme,
      storageKey: props.storageKey ?? "theme",
      themes: props.themes ? [...props.themes] : [...DEFAULT_THEMES],
      value: props.value,
    }),
    [
      props.attribute,
      props.defaultTheme,
      props.disableTransitionOnChange,
      props.enableColorScheme,
      props.enableSystem,
      props.forcedTheme,
      props.storageKey,
      props.themes,
      props.value,
    ],
  );

  const colorMode = React.useSyncExternalStore(
    subscribeToColorMode,
    getResolvedColorMode,
    getResolvedColorMode,
  );

  useIsomorphicLayoutEffect(() => {
    syncColorModeStore(config);
  }, [config]);

  const setColorMode = React.useCallback((nextColorMode: ColorMode) => {
    if (currentConfig.forcedTheme) {
      return;
    }

    updateColorModePreference(nextColorMode, { persist: true });
  }, []);

  const toggleColorMode = React.useCallback(() => {
    setColorMode(colorMode === "dark" ? "light" : "dark");
  }, [colorMode, setColorMode]);

  const contextValue = React.useMemo<UseColorModeReturn>(
    () => ({
      colorMode,
      setColorMode,
      toggleColorMode,
    }),
    [colorMode, setColorMode, toggleColorMode],
  );

  return (
    <ColorModeContext.Provider value={contextValue}>
      {props.children}
    </ColorModeContext.Provider>
  );
}

export type ColorMode = "light" | "dark";

export interface UseColorModeReturn {
  colorMode: ColorMode;
  setColorMode: (colorMode: ColorMode) => void;
  toggleColorMode: () => void;
}

export function useColorMode(): UseColorModeReturn {
  return React.useContext(ColorModeContext);
}

export function useColorModeValue<T>(light: T, dark: T) {
  const { colorMode } = useColorMode();
  return colorMode === "dark" ? dark : light;
}

export function ColorModeIcon() {
  const { colorMode } = useColorMode();
  return colorMode === "dark" ? (
    <MaterialSymbol>dark_mode</MaterialSymbol>
  ) : (
    <MaterialSymbol>light_mode</MaterialSymbol>
  );
}

interface ColorModeButtonProps extends Omit<IconButtonProps, "aria-label"> {
  electronToggleColorMode?: () => Promise<boolean>;
}

export const ColorModeButton = React.forwardRef<
  HTMLButtonElement,
  ColorModeButtonProps
>(function ColorModeButton(props, ref) {
  const { toggleColorMode, setColorMode } = useColorMode();
  return (
    <ClientOnly fallback={<Skeleton boxSize="9" />}>
      <IconButton
        onClick={async () => {
          if (props.electronToggleColorMode) {
            // When in Electron, toggle native theme and sync with the result
            const isDark = await props.electronToggleColorMode();
            setColorMode(isDark ? "dark" : "light");
          } else {
            // When not in Electron, just toggle Chakra UI theme
            toggleColorMode();
          }
        }}
        variant="ghost"
        aria-label="Toggle color mode"
        ref={ref}
        {...props}
        css={{
          _icon: {
            width: "5",
            height: "5",
          },
        }}
      >
        <ColorModeIcon />
      </IconButton>
    </ClientOnly>
  );
});

export const LightMode = React.forwardRef<HTMLSpanElement, SpanProps>(
  function LightMode(props, ref) {
    return (
      <Span
        color="fg"
        display="contents"
        className="chakra-theme light"
        colorPalette="gray"
        colorScheme="light"
        ref={ref}
        {...props}
      />
    );
  },
);

export const DarkMode = React.forwardRef<HTMLSpanElement, SpanProps>(
  function DarkMode(props, ref) {
    return (
      <Span
        color="fg"
        display="contents"
        className="chakra-theme dark"
        colorPalette="gray"
        colorScheme="dark"
        ref={ref}
        {...props}
      />
    );
  },
);

function subscribeToColorMode(listener: () => void) {
  colorModeListeners.add(listener);

  return () => {
    colorModeListeners.delete(listener);
  };
}

function emitColorModeChange() {
  colorModeListeners.forEach((listener) => {
    listener();
  });
}

function getResolvedColorMode(): ColorMode {
  return currentResolvedMode;
}

function syncColorModeStore(config: ColorModeStoreConfig) {
  currentConfig = config;

  if (!canUseDOM()) {
    currentResolvedMode = resolveColorMode(
      getFallbackPreference(config),
      "light",
      config.forcedTheme,
    );
    emitColorModeChange();
    return;
  }

  attachGlobalColorModeListeners();

  currentSystemMode = getSystemColorMode();
  currentPreference =
    getStoredPreference(config) ?? getFallbackPreference(config);
  currentResolvedMode = resolveColorMode(
    currentPreference,
    currentSystemMode,
    config.forcedTheme,
  );

  applyColorModeToDocument(currentResolvedMode, config);
  emitColorModeChange();
}

function updateColorModePreference(
  preference: ThemePreference,
  options?: { persist?: boolean },
) {
  currentPreference = preference;
  currentSystemMode = getSystemColorMode();
  currentResolvedMode = resolveColorMode(
    currentPreference,
    currentSystemMode,
    currentConfig.forcedTheme,
  );

  if (options?.persist && canUseDOM()) {
    try {
      window.localStorage.setItem(currentConfig.storageKey, preference);
    } catch {
      // Ignore storage access failures (private mode, blocked storage, etc.)
    }
  }

  applyColorModeToDocument(currentResolvedMode, currentConfig);
  emitColorModeChange();
}

function attachGlobalColorModeListeners() {
  if (!canUseDOM() || globalListenersAttached) {
    return;
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key && event.key !== currentConfig.storageKey) {
      return;
    }

    const nextPreference =
      normalizePreference(event.newValue, currentConfig.enableSystem) ??
      getFallbackPreference(currentConfig);

    updateColorModePreference(nextPreference);
  };

  const mediaQuery = window.matchMedia(SYSTEM_THEME_MEDIA);
  const handleSystemThemeChange = () => {
    const nextSystemMode = getSystemColorMode();

    if (
      currentSystemMode === nextSystemMode &&
      currentResolvedMode ===
        resolveColorMode(
          currentPreference,
          nextSystemMode,
          currentConfig.forcedTheme,
        )
    ) {
      return;
    }

    currentSystemMode = nextSystemMode;
    currentResolvedMode = resolveColorMode(
      currentPreference,
      currentSystemMode,
      currentConfig.forcedTheme,
    );
    applyColorModeToDocument(currentResolvedMode, currentConfig);
    emitColorModeChange();
  };

  window.addEventListener("storage", handleStorage);

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", handleSystemThemeChange);
  } else {
    mediaQuery.addListener(handleSystemThemeChange);
  }

  globalListenersAttached = true;
}

function canUseDOM() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function getSystemColorMode(): ColorMode {
  if (!canUseDOM() || typeof window.matchMedia !== "function") {
    return "light";
  }

  return window.matchMedia(SYSTEM_THEME_MEDIA).matches ? "dark" : "light";
}

function getFallbackPreference(config: ColorModeStoreConfig): ThemePreference {
  if (config.defaultTheme === "light" || config.defaultTheme === "dark") {
    return config.defaultTheme;
  }

  return config.enableSystem ? "system" : "light";
}

function getStoredPreference(
  config: ColorModeStoreConfig,
): ThemePreference | undefined {
  if (!canUseDOM()) {
    return undefined;
  }

  try {
    return normalizePreference(
      window.localStorage.getItem(config.storageKey),
      config.enableSystem,
    );
  } catch {
    return undefined;
  }
}

function normalizePreference(
  preference: string | null,
  enableSystem: boolean,
): ThemePreference | undefined {
  if (preference === "light" || preference === "dark") {
    return preference;
  }

  if (preference === "system" && enableSystem) {
    return preference;
  }

  return undefined;
}

function resolveColorMode(
  preference: ThemePreference,
  systemMode: ColorMode,
  forcedTheme?: ColorMode,
): ColorMode {
  if (forcedTheme) {
    return forcedTheme;
  }

  return preference === "system" ? systemMode : preference;
}

function applyColorModeToDocument(
  colorMode: ColorMode,
  config: ColorModeStoreConfig,
) {
  if (!canUseDOM()) {
    return;
  }

  const apply = () => {
    const attributes = Array.isArray(config.attribute)
      ? config.attribute
      : [config.attribute];

    attributes.forEach((attribute) => {
      applyColorModeAttribute(attribute, colorMode, config);
    });

    if (config.enableColorScheme) {
      document.documentElement.style.colorScheme = colorMode;
    } else {
      document.documentElement.style.removeProperty("color-scheme");
    }
  };

  if (!config.disableTransitionOnChange) {
    apply();
    return;
  }

  const cleanup = disableTransitions();
  apply();
  cleanup();
}

function applyColorModeAttribute(
  attribute: ColorModeAttribute,
  colorMode: ColorMode,
  config: ColorModeStoreConfig,
) {
  const root = document.documentElement;

  if (attribute === "class") {
    const classNamesToRemove = getThemeClassNames(config);
    if (classNamesToRemove.length > 0) {
      root.classList.remove(...classNamesToRemove);
    }

    const className = config.value?.[colorMode] ?? colorMode;
    if (className) {
      root.classList.add(className);
    }

    return;
  }

  const attributeValue = config.value?.[colorMode] ?? colorMode;
  if (attributeValue) {
    root.setAttribute(attribute, attributeValue);
  } else {
    root.removeAttribute(attribute);
  }
}

function getThemeClassNames(config: ColorModeStoreConfig) {
  const themes = config.themes.length > 0 ? config.themes : DEFAULT_THEMES;

  return themes
    .filter((theme) => theme !== "system")
    .map((theme) => config.value?.[theme] ?? theme)
    .filter((theme): theme is string => Boolean(theme));
}

function disableTransitions() {
  const style = document.createElement("style");
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}",
    ),
  );

  document.head.appendChild(style);

  return () => {
    void window.getComputedStyle(document.body);
    window.setTimeout(() => {
      document.head.removeChild(style);
    }, 1);
  };
}
