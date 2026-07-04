"use client";

import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { toaster } from "@konfi/components/ui/toaster";
import { db, tenant, update } from "@konfi/firebase";
import { Note } from "@konfi/types";
import { getCountFromServer, onSnapshot, where } from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "./auth";
import { useChannels } from "./channels";

interface INote {
  loadingNotes: boolean;
  loadNotes: () => void;
  notes: Note[] | null;
  notesCount: number;
  completeNote: (documentId: string) => void;
  updateCarriedOutBy: (noteId: string, carriedOutBy: string[]) => Promise<void>;
}

const NotesContext = createContext<INote>({
  loadingNotes: true,
  loadNotes: () => {},
  notes: null,
  notesCount: 0,
  completeNote: () => {},
  updateCarriedOutBy: () => Promise.resolve(),
});

const NotesProvider = ({ children }: { children: React.ReactNode }) => {
  const { t } = useT();
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [notesCount, setNotesCount] = useState<number>(0);
  const { user } = useAuth();
  const { channel } = useChannels();
  const tenantContext = useTenantContext();
  const [notesListEnabled, setNotesListEnabled] = useState(false);

  const getNotesQuery = useCallback(() => {
    if (!user || !channel) {
      return null;
    }

    return db.query<Note>(
      firestore,
      "/notes",
      99,
      undefined,
      tenant.queryConstraints(tenantContext, [
        where("completed", "==", false),
        where("channelId", "==", channel.id),
      ]),
    );
  }, [channel, tenantContext, user]);

  const refreshNotesCount = useCallback(async () => {
    const notesQuery = getNotesQuery();

    if (!notesQuery) {
      setNotesCount(0);
      setLoadingNotes(false);
      return;
    }

    try {
      setLoadingNotes(true);
      const snapshot = await getCountFromServer(notesQuery);
      setNotesCount(snapshot.data().count);
    } catch (error) {
      console.error("Error fetching notes count:", error);
      setNotesCount(0);
    } finally {
      setLoadingNotes(false);
    }
  }, [getNotesQuery]);

  useEffect(() => {
    void refreshNotesCount();
  }, [refreshNotesCount]);

  const loadNotes = useCallback(() => {
    setNotesListEnabled(true);
  }, []);

  useEffect(() => {
    if (!notesListEnabled) {
      return;
    }

    const notesQuery = getNotesQuery();
    if (!notesQuery) {
      setNotes(null);
      return;
    }

    setLoadingNotes(true);
    const unsubscribe = onSnapshot(
      notesQuery,
      (querySnap) => {
        const nextNotes = querySnap.docs.map((doc) => doc.data() as Note);
        setNotes(nextNotes);
        setNotesCount(nextNotes.length);
        setLoadingNotes(false);
      },
      (error) => {
        console.error("Error fetching notes:", error);
        setLoadingNotes(false);
        setNotes(null);
      },
    );
    return () => unsubscribe();
  }, [getNotesQuery, notesListEnabled]);

  const completeNote = useCallback(
    (documentId: string) => {
      const docRef = db.doc<Note>(firestore, `/notes`, documentId);
      void update<Partial<Note>>({ completed: true }, docRef, tenantContext)
        .then(() => {
          if (!notesListEnabled) {
            void refreshNotesCount();
          }
        })
        .catch((error) => {
          console.error(error);
        });
    },
    [notesListEnabled, refreshNotesCount, tenantContext],
  );

  const updateCarriedOutBy = useCallback(
    async (noteId: string, carriedOutBy: string[]) => {
      try {
        await update(
          {
            carriedOutBy,
          },
          db.doc(firestore, `notes`, noteId),
          tenantContext,
        );
        toaster.create({
          title: t("notes.assigneesUpdated", {
            defaultValue: "Assignees Updated",
          }),
          description: t("notes.assigneesUpdatedDescription", {
            defaultValue: "Assignees have been updated.",
          }),
          type: "success",
        });
      } catch (error) {
        console.error(error);
        toaster.create({
          title: t("common.error", { defaultValue: "Error" }),
          description: t("notes.assigneesUpdateError", {
            defaultValue: "An error occurred while updating assignees.",
          }),
          type: "error",
        });
      }
    },
    [t, tenantContext],
  );

  const value = useMemo(
    () => ({
      loadingNotes,
      loadNotes,
      notes,
      notesCount,
      completeNote,
      updateCarriedOutBy,
    }),
    [
      completeNote,
      loadNotes,
      loadingNotes,
      notes,
      notesCount,
      updateCarriedOutBy,
    ],
  );

  return (
    <NotesContext.Provider value={value}>{children}</NotesContext.Provider>
  );
};

const useNotes = () => {
  const context = useContext(NotesContext);
  const { loadNotes } = context;

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  return context;
};

const useNotesCount = () => {
  const { loadingNotes, notesCount } = useContext(NotesContext);
  return { loadingNotes, notesCount };
};

export { NotesProvider, useNotes, useNotesCount };
