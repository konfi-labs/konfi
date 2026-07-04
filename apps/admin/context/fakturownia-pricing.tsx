"use client";

import {
  getFakturowniaPriceListById,
  searchFakturowniaClients,
  type FakturowniaPriceList,
  type FakturowniaPriceListPosition,
} from "@/actions/fakturownia";
import { useT } from "@/i18n/client";
import { toaster } from "@konfi/components";
import type { Client } from "@konfi/fakturownia/client/models";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import useSWR, { useSWRConfig } from "swr";

export interface FakturowniaPricingState {
  buyerNip?: string;
  client?: Client | null;
  priceList?: FakturowniaPriceList | null;
  positionMap: Map<string, FakturowniaPriceListPosition>;
  loading: boolean;
  setBuyerNip: (nip?: string) => void;
  resolveClientByNip: (nip?: string) => Promise<void>;
  computeGrossOverride: (baseGrossMinor: number, productId?: string) => number;
  hasOverride: (productId?: string) => boolean;
  clearClient: () => void;
}

const defaultState: FakturowniaPricingState = {
  buyerNip: undefined,
  client: null,
  priceList: null,
  positionMap: new Map<string, FakturowniaPriceListPosition>(),
  loading: false,
  setBuyerNip: () => {
    /* noop */
  },
  resolveClientByNip: async () => {
    /* noop */
  },
  computeGrossOverride: (v) => v,
  hasOverride: () => false,
  clearClient: () => {
    /* noop */
  },
};

const FakturowniaPricingContext =
  createContext<FakturowniaPricingState>(defaultState);

export const FakturowniaPricingProvider = ({
  children,
}: React.PropsWithChildren) => {
  const { t } = useT(["fakturownia", "translation"]);
  const [buyerNip, setBuyerNip] = useState<string | undefined>(undefined);
  const { mutate } = useSWRConfig();

  const normalizeNip = (value?: string) =>
    value ? value.replace(/\D/g, "").trim() : "";

  // SWR: clients by NIP
  const nipKey =
    buyerNip && buyerNip.length >= 3
      ? (["fk-clients", buyerNip] as const)
      : null;
  const {
    data: clientsData,
    isValidating: clientsLoading,
    error: clientsError,
  } = useSWR<Client[]>(
    nipKey,
    async (key) => {
      const [, rawNip] = key as [string, string];
      const list = await searchFakturowniaClients(String(rawNip));
      return list ?? [];
    },
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      dedupingInterval: 15000,
    },
  );

  // Pick exact match (by taxNo/registerNumber); use first when multiple
  const client: Client | null = useMemo(() => {
    if (!buyerNip || !clientsData?.length) return null;
    const normalized = buyerNip.toLowerCase();
    const exact = clientsData.filter((c) => {
      const taxNo = (c.taxNo || "").replace(/\D/g, "").toLowerCase();
      const reg = (c.registerNumber || "").replace(/\D/g, "").toLowerCase();
      return taxNo === normalized || reg === normalized;
    });
    return exact[0] ?? null;
  }, [buyerNip, clientsData]);

  // Toast control for client resolution
  const lastClientIdRef = useRef<number | undefined>(undefined);
  const warnedMultipleRef = useRef<string | undefined>(undefined);
  const lastNipRef = useRef<string | undefined>(undefined);

  useMemo(() => {
    if (!nipKey) return undefined;
    if (clientsError) {
      toaster.create({
        title: t("fakturownia.priceList.resolveFailed", {
          defaultValue: "Client resolution failed",
        }),
        type: "error",
        meta: { closable: true },
      });
      return undefined;
    }
    if (!clientsData) return undefined;
    const normalized = (buyerNip || "").toLowerCase();
    const exactMatches = clientsData.filter((c) => {
      const taxNo = (c.taxNo || "").replace(/\D/g, "").toLowerCase();
      const reg = (c.registerNumber || "").replace(/\D/g, "").toLowerCase();
      return taxNo === normalized || reg === normalized;
    });
    if (exactMatches.length === 0) {
      if (lastClientIdRef.current !== undefined) {
        toaster.create({
          title: t("fakturownia.priceList.noClient", {
            defaultValue: "No matching client in Fakturownia",
          }),
          type: "info",
          meta: { closable: true },
        });
      }
      lastClientIdRef.current = undefined;
      warnedMultipleRef.current = undefined;
      return undefined;
    }
    if (exactMatches.length > 1 && warnedMultipleRef.current !== buyerNip) {
      toaster.create({
        title: t("fakturownia.priceList.multipleClients", {
          defaultValue: "Multiple clients found for NIP",
        }),
        description: t("fakturownia.priceList.usingFirst", {
          defaultValue: "Using the first match",
        }),
        type: "warning",
        meta: { closable: true },
      });
      warnedMultipleRef.current = buyerNip;
    }
    const currentId = exactMatches[0]?.id ?? undefined;
    if (currentId && currentId !== lastClientIdRef.current) {
      lastClientIdRef.current = currentId;
    }
    return undefined;
  }, [buyerNip, clientsData, clientsError, nipKey, t]);

  // SWR: price list by client's priceListId
  const priceListId = (client as unknown as { priceListId?: number | string })
    ?.priceListId;
  const plKey = priceListId ? (["fk-pl", String(priceListId)] as const) : null;
  const {
    data: priceList,
    isValidating: plLoading,
    error: plError,
  } = useSWR<FakturowniaPriceList | undefined>(
    plKey,
    async (key) => {
      const [, rawId] = key as [string, string];
      const pl = await getFakturowniaPriceListById(String(rawId));
      return pl;
    },
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      dedupingInterval: 30000,
    },
  );

  // Track last used keys for manual cache purge when client is cleared
  useEffect(() => {
    if (nipKey) {
      lastNipRef.current = nipKey[1];
    }
  }, [nipKey]);

  // Toast control for price list
  const lastPlIdRef = useRef<string | undefined>(undefined);
  useMemo(() => {
    if (!plKey) {
      // Only inform about missing price list when a client is actually resolved
      if (lastPlIdRef.current !== undefined && client) {
        toaster.create({
          title: t("fakturownia.priceList.noneForClient", {
            defaultValue: "Client has no price list",
          }),
          type: "info",
          meta: { closable: true },
        });
      }
      lastPlIdRef.current = undefined;
      return undefined;
    }
    const currentId = plKey[1];
    if (plError) {
      toaster.create({
        title: t("fakturownia.priceList.loadFailed", {
          defaultValue: "Failed to load price list",
        }),
        type: "error",
        meta: { closable: true },
      });
      return undefined;
    }
    if (priceList === undefined) {
      if (lastPlIdRef.current !== undefined) {
        toaster.create({
          title: t("fakturownia.priceList.notFound", {
            defaultValue: "Price list not found",
          }),
          type: "warning",
          meta: { closable: true },
        });
      }
      lastPlIdRef.current = undefined;
      return undefined;
    }
    if (currentId !== lastPlIdRef.current) {
      toaster.create({
        title: t("fakturownia.priceList.loaded", {
          defaultValue: "Price list loaded",
        }),
        description: priceList?.name || `#${priceList?.id}`,
        type: "success",
        meta: { closable: true },
      });
      lastPlIdRef.current = currentId;
    }
    return undefined;
  }, [plKey, priceList, plError, t, client]);

  // Proactively purge price list cache when client is cleared to avoid any consumer using raw SWR elsewhere
  useEffect(() => {
    if (!client) {
      const lastPl = lastPlIdRef.current;
      const lastNip = lastNipRef.current;
      if (lastPl) {
        void mutate(["fk-pl", lastPl], undefined, {
          revalidate: false,
          populateCache: false,
        });
      }
      if (lastNip) {
        void mutate(["fk-clients", lastNip], undefined, {
          revalidate: false,
          populateCache: false,
        });
      }
    }
  }, [client, mutate]);

  // If buyerNip is cleared (undefined, empty string, or <3 chars) ensure internal state is fully reset
  useEffect(() => {
    const nipActive = Boolean(buyerNip && buyerNip.length >= 3);
    if (!nipActive) {
      // Clear refs and cached price list/client data proactively
      const lastPl = lastPlIdRef.current;
      const lastNip = lastNipRef.current;
      if (lastPl) {
        void mutate(["fk-pl", lastPl], undefined, {
          revalidate: false,
          populateCache: false,
        });
      }
      if (lastNip) {
        void mutate(["fk-clients", lastNip], undefined, {
          revalidate: false,
          populateCache: false,
        });
      }
      lastClientIdRef.current = undefined;
      warnedMultipleRef.current = undefined;
      lastPlIdRef.current = undefined;
      lastNipRef.current = undefined;
    }
  }, [buyerNip, mutate]);

  // Build override map
  const positionMap = useMemo(() => {
    // If no resolved client, ignore any previously loaded price list
    if (!client) return new Map<string, FakturowniaPriceListPosition>();
    const map = new Map<string, FakturowniaPriceListPosition>();
    if (priceList?.positions && Array.isArray(priceList.positions)) {
      for (const pos of priceList.positions) {
        if (!pos || !pos.productId) continue;
        map.set(String(pos.productId), pos);
      }
    }
    return map;
  }, [priceList, client]);

  const computeGrossOverride = useCallback(
    (baseGrossMinor: number, productId?: string): number => {
      // Require a resolved client to apply overrides
      if (!client || !productId || !priceList || positionMap.size === 0)
        return baseGrossMinor;
      const entry = positionMap.get(String(productId));
      if (!entry) return baseGrossMinor;
      if (
        typeof entry.priceGross === "number" &&
        Number.isFinite(entry.priceGross)
      ) {
        const minor = Math.round(entry.priceGross * 100);
        return minor > 0 ? minor : baseGrossMinor;
      }
      if (
        entry.usePercentage &&
        typeof entry.percentage === "number" &&
        Number.isFinite(entry.percentage)
      ) {
        const discount = Math.max(0, Math.min(100, entry.percentage));
        const factor = 1 - discount / 100;
        const minor = Math.round(baseGrossMinor * factor);
        return minor > 0 ? minor : baseGrossMinor;
      }
      return baseGrossMinor;
    },
    [positionMap, priceList],
  );

  const hasOverride = useCallback(
    (productId?: string) => {
      if (!client || !productId || positionMap.size === 0) return false;
      return positionMap.has(String(productId));
    },
    [positionMap, client],
  );

  const value: FakturowniaPricingState = {
    buyerNip,
    client,
    // Ensure price list is only exposed when a client is resolved
    priceList: client ? (priceList ?? null) : null,
    positionMap,
    loading: Boolean(clientsLoading || plLoading),
    setBuyerNip: (nip?: string) => setBuyerNip(normalizeNip(nip)),
    resolveClientByNip: async (nip?: string) => {
      setBuyerNip(normalizeNip(nip));
    },
    computeGrossOverride,
    hasOverride,
    clearClient: () => {
      // Clear buyer NIP and any cached data; effects above handle actual cache purging
      setBuyerNip(undefined);
      lastClientIdRef.current = undefined;
      warnedMultipleRef.current = undefined;
      lastPlIdRef.current = undefined;
      lastNipRef.current = undefined;
    },
  };

  return (
    <FakturowniaPricingContext.Provider value={value}>
      {children}
    </FakturowniaPricingContext.Provider>
  );
};

export const useFakturowniaPricing = () =>
  useContext(FakturowniaPricingContext);
