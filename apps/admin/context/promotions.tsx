"use client";

import { Campaign, Promotion } from "@konfi/types";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { deactivate, init, removeDoc } from "@/lib/helpers";
import { useAuth } from "./auth";

interface IPromotions {
  loadingPromotions: boolean;
  promotions: Promotion[] | null;
  refreshPromotions: () => void;
  removePromotion: (documentId: string) => void;
  deactivatePromotion: (documentId: string) => void;
  loadingCampaigns: boolean;
  campaigns: Campaign[] | null;
  refreshCampaigns: () => void;
  removeCampaign: (documentId: string) => void;
}

const PromotionsContext = createContext<IPromotions>({
  loadingPromotions: true,
  promotions: null,
  refreshPromotions: () => { },
  removePromotion: () => { },
  deactivatePromotion: () => { },
  loadingCampaigns: true,
  campaigns: null,
  refreshCampaigns: () => { },
  removeCampaign: () => { },
});

const PromotionsProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const [loadingPromotions, setLoadingPromotions] = useState(true);
  const [promotions, setPromotions] = useState<Promotion[] | null>(null);
  const [dirtyRefreshPromotions, setDirtyRefreshPromotions] =
    useState<boolean>(false);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [dirtyRefreshCampaigns, setDirtyRefreshCampaigns] =
    useState<boolean>(false);
  const { user } = useAuth();

  useEffect(() => {
    setLoadingPromotions(loadingCampaigns);
  }, [loadingCampaigns]);

  useEffect(() => {
    if (!user) return;
    init(
      setLoadingPromotions,
      "promotions",
      99,
      setPromotions,
      undefined,
      "No promotions",
    );
  }, [dirtyRefreshPromotions, user]);

  useEffect(() => {
    if (!user) return;
    init(
      setLoadingCampaigns,
      "campaigns",
      99,
      setCampaigns,
      undefined,
      "No campaigns",
    );
  }, [dirtyRefreshCampaigns, user]);

  const refreshPromotions = useCallback(
    () => setDirtyRefreshPromotions((previous) => !previous),
    [],
  );
  const removePromotion = useCallback(
    (documentId: string) =>
      removeDoc(
        setLoadingPromotions,
        "/promotions",
        documentId,
        refreshPromotions,
      ),
    [refreshPromotions],
  );
  const deactivatePromotion = useCallback(
    (documentId: string) =>
      deactivate<Promotion>(
        setLoadingPromotions,
        "/promotions",
        documentId,
        refreshPromotions,
      ),
    [refreshPromotions],
  );

  const refreshCampaigns = useCallback(
    () => setDirtyRefreshCampaigns((previous) => !previous),
    [],
  );
  const removeCampaign = useCallback(
    (documentId: string) =>
      removeDoc(
        setLoadingCampaigns,
        "/campaigns",
        documentId,
        refreshCampaigns,
      ),
    [refreshCampaigns],
  );

  const value = useMemo(
    () => ({
      loadingPromotions,
      promotions,
      refreshPromotions,
      removePromotion,
      deactivatePromotion,
      loadingCampaigns,
      campaigns,
      refreshCampaigns,
      removeCampaign,
    }),
    [
      loadingPromotions,
      promotions,
      refreshPromotions,
      removePromotion,
      deactivatePromotion,
      loadingCampaigns,
      campaigns,
      refreshCampaigns,
      removeCampaign,
    ],
  );

  return (
    <PromotionsContext.Provider value={value}>
      {children}
    </PromotionsContext.Provider>
  );
};

const usePromotions = () => useContext(PromotionsContext);

export { PromotionsProvider, usePromotions };
