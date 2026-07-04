"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "./auth";
import type { MetaConnectionStatus, SocialPostView } from "@/actions/social";
import { getMetaConnectionStatus, listSocialPosts } from "@/actions/social";

interface ISocial {
  loading: boolean;
  metaStatus: MetaConnectionStatus | null;
  refresh: () => void;
  posts: SocialPostView[];
  loadingPosts: boolean;
  refreshPosts: (range?: { from: number; to: number }) => void;
}

const SocialContext = createContext<ISocial>({
  loading: true,
  metaStatus: null,
  refresh: () => {},
  posts: [],
  loadingPosts: false,
  refreshPosts: () => {},
});

const SocialProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const [loading, setLoading] = useState(true);
  const [metaStatus, setMetaStatus] = useState<MetaConnectionStatus | null>(
    null,
  );
  const [dirtyRefresh, setDirtyRefresh] = useState(false);
  const [posts, setPosts] = useState<SocialPostView[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [postsRange, setPostsRange] = useState<
    { from: number; to: number } | undefined
  >(undefined);
  const [dirtyPostsRefresh, setDirtyPostsRefresh] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    setLoading(true);

    getMetaConnectionStatus()
      .then((status) => {
        if (!cancelled) {
          setMetaStatus(status);
        }
      })
      .catch((error) => {
        console.error("Failed to load Meta connection status:", error);
        if (!cancelled) {
          setMetaStatus(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dirtyRefresh, user]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    setLoadingPosts(true);

    listSocialPosts(postsRange)
      .then((result) => {
        if (!cancelled) {
          setPosts(result);
        }
      })
      .catch((error) => {
        console.error("Failed to load social posts:", error);
        if (!cancelled) {
          setPosts([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingPosts(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dirtyPostsRefresh, postsRange, user]);

  const refresh = useCallback(
    () => setDirtyRefresh((previous) => !previous),
    [],
  );

  const refreshPosts = useCallback(
    (range?: { from: number; to: number }) => {
      setPostsRange(range);
      setDirtyPostsRefresh((previous) => !previous);
    },
    [],
  );

  const value = useMemo(
    () => ({
      loading,
      metaStatus,
      refresh,
      posts,
      loadingPosts,
      refreshPosts,
    }),
    [loading, metaStatus, refresh, posts, loadingPosts, refreshPosts],
  );

  return (
    <SocialContext.Provider value={value}>{children}</SocialContext.Provider>
  );
};

const useSocial = () => useContext(SocialContext);

export { SocialProvider, useSocial };
