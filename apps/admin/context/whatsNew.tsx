"use client";

import type { WhatsNewChange } from "@/lib/whats-new/types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "./auth";

interface WhatsNewContextValue {
  loading: boolean;
  changes: WhatsNewChange[];
  hasUnseenChanges: boolean;
  markAsSeen: () => void;
  openDialog: () => void;
  closeDialog: () => void;
  isDialogOpen: boolean;
}

const WhatsNewContext = createContext<WhatsNewContextValue>({
  loading: true,
  changes: [],
  hasUnseenChanges: false,
  markAsSeen: () => {},
  openDialog: () => {},
  closeDialog: () => {},
  isDialogOpen: false,
});

interface WhatsNewSummary {
  hasChanges: boolean;
  latestId: string | null;
}

const STORAGE_KEY = "admin.whatsNew.lastSeenId";

function getStoredId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.error("Error reading stored id:", error);
    return null;
  }
}

function setStoredId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch (error) {
    console.error("Error storing id:", error);
  }
}

function parseWhatsNewChanges(data: unknown): WhatsNewChange[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((change: unknown) => {
    const c = change as Record<string, unknown>;
    return {
      id: c.id as string,
      timestamp: c.timestamp as string,
      title: (c.title as Record<string, string>) ?? {},
      description: (c.description as Record<string, string>) ?? {},
      imageUrl: c.imageUrl as string | undefined,
      seoSuggestionCount:
        typeof c.seoSuggestionCount === "number"
          ? c.seoSuggestionCount
          : undefined,
      campaignProposalCount:
        typeof c.campaignProposalCount === "number"
          ? c.campaignProposalCount
          : undefined,
      highlightFeatures:
        (c.highlightFeatures as WhatsNewChange["highlightFeatures"]) ?? [],
      kind: c.kind as WhatsNewChange["kind"],
      source: c.source as WhatsNewChange["source"],
    };
  });
}

async function fetchWhatsNewSummary(): Promise<WhatsNewSummary> {
  const response = await fetch("/api/whats-new?summary=1");
  if (!response.ok) {
    throw new Error("Failed to fetch changes summary");
  }

  const data = (await response.json()) as Partial<WhatsNewSummary>;
  return {
    hasChanges: data.hasChanges === true,
    latestId: typeof data.latestId === "string" ? data.latestId : null,
  };
}

async function fetchWhatsNewChanges(): Promise<WhatsNewChange[]> {
  const response = await fetch("/api/whats-new");
  if (!response.ok) {
    throw new Error("Failed to fetch changes");
  }

  return parseWhatsNewChanges(await response.json());
}

export function WhatsNewProvider({ children }: { children: React.ReactNode }) {
  const { user, initialLoading, isAdminClient } = useAuth();
  const [changes, setChanges] = useState<WhatsNewChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [autoOpenedChangeId, setAutoOpenedChangeId] = useState<string | null>(
    null,
  );
  const [lastSeenId, setLastSeenId] = useState<string | null>(() =>
    getStoredId(),
  );
  const [latestChangeId, setLatestChangeId] = useState<string | null>(null);
  const changesRequestRef = useRef<Promise<WhatsNewChange[]> | null>(null);

  const loadChanges = useCallback(async () => {
    if (changes.length > 0) {
      return changes;
    }

    if (changesRequestRef.current) {
      return await changesRequestRef.current;
    }

    setLoading(true);
    changesRequestRef.current = fetchWhatsNewChanges()
      .then((parsedChanges) => {
        setChanges(parsedChanges);
        setLatestChangeId(parsedChanges[0]?.id ?? null);
        return parsedChanges;
      })
      .catch((error) => {
        console.error("Error fetching changes:", error);
        setChanges([]);
        return [];
      })
      .finally(() => {
        changesRequestRef.current = null;
        setLoading(false);
      });

    return await changesRequestRef.current;
  }, [changes]);

  useEffect(() => {
    async function fetchSummary() {
      try {
        const summary = await fetchWhatsNewSummary();
        setLatestChangeId(summary.latestId);
      } catch (error) {
        console.error("Error fetching changes summary:", error);
        setLatestChangeId(null);
        setChanges([]);
      } finally {
        setLoading(false);
      }
    }

    if (initialLoading) {
      return;
    }

    if (!user || !isAdminClient) {
      setChanges([]);
      setLatestChangeId(null);
      setAutoOpenedChangeId(null);
      changesRequestRef.current = null;

      if (!user) {
        setLastSeenId(null);
      }

      setLoading(false);
      return;
    }

    setLoading(true);
    setLastSeenId(getStoredId());
    setChanges([]);
    changesRequestRef.current = null;
    void fetchSummary();
  }, [initialLoading, isAdminClient, user]);

  const hasUnseenChanges = useMemo(() => {
    if (!latestChangeId) return false;
    if (!lastSeenId) return true;
    return latestChangeId !== lastSeenId;
  }, [latestChangeId, lastSeenId]);

  const markAsSeen = useCallback(() => {
    if (latestChangeId) {
      setStoredId(latestChangeId);
      setLastSeenId(latestChangeId);
    }
  }, [latestChangeId]);

  useEffect(() => {
    if (
      !user ||
      loading ||
      isDialogOpen ||
      !hasUnseenChanges ||
      !latestChangeId
    ) {
      return;
    }

    if (autoOpenedChangeId === latestChangeId) {
      return;
    }

    void loadChanges().then(() => {
      setIsDialogOpen(true);
      setAutoOpenedChangeId(latestChangeId);
    });
  }, [
    user,
    loading,
    isDialogOpen,
    hasUnseenChanges,
    latestChangeId,
    autoOpenedChangeId,
    loadChanges,
  ]);

  const openDialog = useCallback(() => {
    setIsDialogOpen(true);
    void loadChanges();
  }, [loadChanges]);

  const closeDialog = useCallback(() => {
    setIsDialogOpen(false);
    markAsSeen();
  }, [markAsSeen]);

  const value = useMemo(
    () => ({
      changes,
      loading,
      hasUnseenChanges,
      markAsSeen,
      openDialog,
      closeDialog,
      isDialogOpen,
    }),
    [
      changes,
      loading,
      hasUnseenChanges,
      markAsSeen,
      openDialog,
      closeDialog,
      isDialogOpen,
    ],
  );

  return (
    <WhatsNewContext.Provider value={value}>
      {children}
    </WhatsNewContext.Provider>
  );
}

export function useWhatsNew() {
  return useContext(WhatsNewContext);
}
