"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export const FEATURE_PREVIEW_IDS = [
  "spotColorAuthoring",
  "stickersImposition",
] as const;

export type FeaturePreviewId = (typeof FEATURE_PREVIEW_IDS)[number];

const STORAGE_KEY = "admin.featurePreview.flags";
const LEGACY_SESSION_STORAGE_KEY = STORAGE_KEY;

function isFeaturePreviewAvailable(_id: FeaturePreviewId): boolean {
  return true;
}

function applyAvailableFlags(
  flags: Record<FeaturePreviewId, boolean>,
): Record<FeaturePreviewId, boolean> {
  return FEATURE_PREVIEW_IDS.reduce<Record<FeaturePreviewId, boolean>>(
    (availableFlags, id) => ({
      ...availableFlags,
      [id]: isFeaturePreviewAvailable(id) ? flags[id] : false,
    }),
    flags,
  );
}

function readFlags(): Record<FeaturePreviewId, boolean> {
  const defaults: Record<FeaturePreviewId, boolean> = {
    spotColorAuthoring: false,
    stickersImposition: false,
  };
  if (typeof window === "undefined") return applyAvailableFlags(defaults);

  try {
    const localFlags = localStorage.getItem(STORAGE_KEY);
    const legacySessionFlags = sessionStorage.getItem(
      LEGACY_SESSION_STORAGE_KEY,
    );
    const raw = localFlags ?? legacySessionFlags;

    if (!raw) return applyAvailableFlags(defaults);

    const flags = {
      ...defaults,
      ...(JSON.parse(raw) as Record<string, boolean>),
    };
    const availableFlags = applyAvailableFlags(flags);

    if (!localFlags && legacySessionFlags) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(availableFlags));
        sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
      } catch (error) {
        console.error("Error migrating feature preview flags:", error);
      }
    }

    return availableFlags;
  } catch {
    return applyAvailableFlags(defaults);
  }
}

function writeFlags(flags: Record<FeaturePreviewId, boolean>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
  } catch (error) {
    console.error("Error writing feature preview flags:", error);
  }
}

interface FeaturePreviewContextValue {
  flags: Record<FeaturePreviewId, boolean>;
  isEnabled: (id: FeaturePreviewId) => boolean;
  toggle: (id: FeaturePreviewId) => void;
  openDialog: () => void;
  closeDialog: () => void;
  isDialogOpen: boolean;
}

const FeaturePreviewContext = createContext<FeaturePreviewContextValue>({
  flags: {
    spotColorAuthoring: false,
    stickersImposition: false,
  },
  isEnabled: () => false,
  toggle: () => {},
  openDialog: () => {},
  closeDialog: () => {},
  isDialogOpen: false,
});

export function FeaturePreviewProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [flags, setFlags] = useState<Record<FeaturePreviewId, boolean>>(() =>
    readFlags(),
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const isEnabled = useCallback(
    (id: FeaturePreviewId) =>
      isFeaturePreviewAvailable(id) && (flags[id] ?? false),
    [flags],
  );

  const toggle = useCallback((id: FeaturePreviewId) => {
    if (!isFeaturePreviewAvailable(id)) return;

    setFlags((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      writeFlags(next);
      return next;
    });
  }, []);

  const openDialog = useCallback(() => setIsDialogOpen(true), []);
  const closeDialog = useCallback(() => setIsDialogOpen(false), []);

  const value = useMemo<FeaturePreviewContextValue>(
    () => ({ flags, isEnabled, toggle, openDialog, closeDialog, isDialogOpen }),
    [flags, isEnabled, toggle, openDialog, closeDialog, isDialogOpen],
  );

  return (
    <FeaturePreviewContext.Provider value={value}>
      {children}
    </FeaturePreviewContext.Provider>
  );
}

export function useFeaturePreview() {
  return useContext(FeaturePreviewContext);
}

export { isFeaturePreviewAvailable };
