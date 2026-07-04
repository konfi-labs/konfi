"use client";

import { useAuth } from "./auth";
import { useTenantContext } from "./tenant";
import { firestore } from "@/lib/firebase/clientApp";
import { db, tenant } from "@konfi/firebase";
import type { ChangeLogEntry } from "@konfi/types";
import { onSnapshot, orderBy, Timestamp } from "firebase/firestore";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type ChangeDocument = Omit<ChangeLogEntry, "id" | "timestamp"> & {
  timestamp: Timestamp | Date | string | number | null | undefined;
};

interface ChangesContextValue {
  loading: boolean;
  changes: ChangeLogEntry[];
}

const ChangesContext = createContext<ChangesContextValue>({
  loading: true,
  changes: [],
});

export function ChangesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const tenantContext = useTenantContext();
  const [changes, setChanges] = useState<ChangeLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setChanges([]);
      setLoading(false);
      return;
    }

    const changesQuery = db.query<ChangeDocument>(
      firestore,
      "changes",
      10,
      undefined,
      tenant.queryConstraints(tenantContext, [orderBy("timestamp", "desc")]),
    );

    const unsubscribe = onSnapshot(
      changesQuery,
      (snapshot) => {
        const mapped = snapshot.docs.map((doc) => {
          const data = doc.data();
          const rawTimestamp = data.timestamp;
          let timestamp: Date;

          if (rawTimestamp instanceof Timestamp) {
            timestamp = rawTimestamp.toDate();
          } else if (rawTimestamp instanceof Date) {
            timestamp = rawTimestamp;
          } else if (
            typeof rawTimestamp === "number" ||
            typeof rawTimestamp === "string"
          ) {
            const parsed = new Date(rawTimestamp);
            timestamp = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
          } else {
            timestamp = new Date();
          }

          return {
            id: doc.id,
            before: data.before ?? null,
            after: data.after ?? null,
            changes: data.changes ?? [],
            descriptions: data.descriptions ?? {},
            timestamp,
            entityType: data.entityType,
            entityId: data.entityId,
            channelId: data.channelId,
          } as ChangeLogEntry;
        });

        setChanges(mapped);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching changes:", error);
        setChanges([]);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [tenantContext, user]);

  const value = useMemo(
    () => ({
      changes,
      loading,
    }),
    [changes, loading],
  );

  return (
    <ChangesContext.Provider value={value}>{children}</ChangesContext.Provider>
  );
}

export function useChanges() {
  return useContext(ChangesContext);
}
