"use client";

import { useTenantContext } from "@/context/tenant";
import { firestore } from "@/lib/firebase/clientApp";
import { db, tenant, update } from "@konfi/firebase";
import { Notification } from "@konfi/types";
import { getCountFromServer, getDocs, where } from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "./auth";

interface INotification {
  loadingNotifications: boolean;
  loadNotifications: () => Promise<void>;
  notifications: Notification[] | null;
  notificationsCount: number;
  archiveNotification: (documentId: string) => void;
}

const NotificationsContext = createContext<INotification>({
  loadingNotifications: true,
  loadNotifications: () => Promise.resolve(),
  notifications: null,
  notificationsCount: 0,
  archiveNotification: () => {},
});

const NotificationsProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const [notifications, setNotifications] = useState<Notification[] | null>(
    null,
  );
  const [notificationsCount, setNotificationsCount] = useState<number>(0);
  const { user } = useAuth();
  const tenantContext = useTenantContext();

  const getNotificationsQuery = useCallback(() => {
    if (!user) {
      return null;
    }

    return db.query<Notification>(firestore, "/notifications", 99, undefined, [
      ...tenant.queryConstraints(tenantContext, [
        where("archived", "==", false),
      ]),
    ]);
  }, [tenantContext, user]);

  const refreshNotificationsCount = useCallback(async () => {
    const notificationsQuery = getNotificationsQuery();

    if (!notificationsQuery) {
      setNotificationsCount(0);
      setLoadingNotifications(false);
      return;
    }

    try {
      setLoadingNotifications(true);
      const snapshot = await getCountFromServer(notificationsQuery);
      setNotificationsCount(snapshot.data().count);
    } catch (error) {
      console.error("Error fetching notifications count:", error);
      setNotificationsCount(0);
    } finally {
      setLoadingNotifications(false);
    }
  }, [getNotificationsQuery]);

  useEffect(() => {
    void refreshNotificationsCount();
  }, [refreshNotificationsCount]);

  const loadNotifications = useCallback(async () => {
    const notificationsQuery = getNotificationsQuery();

    if (!notificationsQuery) {
      setNotifications(null);
      return;
    }

    try {
      setLoadingNotifications(true);
      const snapshot = await getDocs(notificationsQuery);
      const nextNotifications = snapshot.docs.map(
        (doc) => doc.data() as Notification,
      );
      setNotifications(nextNotifications);
      setNotificationsCount(nextNotifications.length);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      setNotifications(null);
    } finally {
      setLoadingNotifications(false);
    }
  }, [getNotificationsQuery]);

  const archiveNotification = useCallback(
    (documentId: string) => {
      const docRef = db.doc<Notification>(
        firestore,
        `/notifications`,
        documentId,
      );
      void update<Partial<Notification>>(
        { archived: true },
        docRef,
        tenantContext,
      )
        .then(() => {
          setNotifications((currentNotifications) =>
            currentNotifications
              ? currentNotifications.filter(
                  (notification) => notification.id !== documentId,
                )
              : currentNotifications,
          );
          setNotificationsCount((currentCount) =>
            Math.max(0, currentCount - 1),
          );
        })
        .catch((error) => {
          console.error(error);
        });
    },
    [tenantContext],
  );

  const value = useMemo(
    () => ({
      loadingNotifications,
      loadNotifications,
      notifications,
      notificationsCount,
      archiveNotification,
    }),
    [
      archiveNotification,
      loadNotifications,
      loadingNotifications,
      notifications,
      notificationsCount,
    ],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
};

const useNotifications = () => useContext(NotificationsContext);

export { NotificationsProvider, useNotifications };
