"use client";

import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { deactivate, init, search, show } from "@/lib/helpers";
import { toaster } from "@konfi/components";
import { db, getDoc, update } from "@konfi/firebase";
import { Supplier } from "@konfi/types";
import {
  arrayRemove,
  DocumentSnapshot,
  endBefore,
  limitToLast,
  orderBy,
  startAfter,
  where,
} from "firebase/firestore";
import {
  createContext,
  Dispatch,
  SetStateAction,
  useContext,
  useEffect,
  useState,
} from "react";
import { useAuth } from "./auth";

interface ISuppliers {
  loadingSuppliers: boolean;
  pageIndex: number;
  setPageIndex: Dispatch<SetStateAction<number>>;
  suppliers: Supplier[] | null;
  suppliersCount: number;
  suppliersSearchResults: Supplier[] | null;
  suppliersInputSearchResults: Supplier[] | null;
  cleanSuppliersSearchResults: () => void;
  showSuppliers: (
    type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST",
    limit: number,
  ) => Promise<void>;
  searchSuppliers: (searchKey: string) => Promise<Supplier[] | undefined>;
  searchSuppliersInput: (searchKey: string) => Promise<Supplier[] | undefined>;
  refreshSuppliers: () => void;
  dirtyRefreshSuppliers: boolean;
  deactivateSupplier: (documentId: string) => void;
  unlinkProductFromSupplier: (
    productId: string,
    supplierId: string,
  ) => Promise<void>;
}

const SuppliersContext = createContext<ISuppliers>({
  loadingSuppliers: true,
  pageIndex: 0,
  setPageIndex: () => {},
  suppliers: null,
  suppliersCount: 0,
  suppliersSearchResults: null,
  suppliersInputSearchResults: null,
  cleanSuppliersSearchResults: () => null,
  showSuppliers: async () => {},
  searchSuppliers: async () => undefined,
  searchSuppliersInput: async () => undefined,
  refreshSuppliers: () => null,
  dirtyRefreshSuppliers: false,
  deactivateSupplier: () => null,
  unlinkProductFromSupplier: async () => {},
});

const SuppliersProvider = ({ children }: { children: React.ReactNode }) => {
  const { t } = useT();
  const [loadingSuppliers, setLoadingSuppliers] = useState<boolean>(true);
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [suppliersCount, setSuppliersCount] = useState<number>(0);
  const [latestSupplier, setLatestSupplier] =
    useState<DocumentSnapshot<Supplier> | null>(null);
  const [suppliersSearchResults, setSuppliersSearchResults] = useState<
    Supplier[] | null
  >(null);
  const [suppliersInputSearchResults, setSuppliersInputSearchResults] =
    useState<Supplier[] | null>(null);
  const [pageIndex, setPageIndex] = useState<number>(0);
  const [dirtyRefreshSuppliers, setDirtyRefreshSuppliers] =
    useState<boolean>(false);
  const { user } = useAuth();
  const tenantContext = useTenantContext();

  useEffect(() => {
    if (!user) return;
    init(
      setLoadingSuppliers,
      "suppliers",
      10,
      setSuppliers,
      setLatestSupplier,
      t("common.noSuppliers", { defaultValue: "No suppliers" }),
      undefined,
      [where("active", "==", true)],
      setSuppliersCount,
      undefined,
      undefined,
      tenantContext,
    );
    setPageIndex(0);
  }, [dirtyRefreshSuppliers, tenantContext, user]);

  const showSuppliers = async (
    type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST",
    limit: number,
  ): Promise<void> =>
    show(
      type,
      setLoadingSuppliers,
      "/suppliers",
      limit,
      type === "NEXT" ? latestSupplier : undefined,
      setLatestSupplier,
      setSuppliers,
      type === "PREVIOUS"
        ? [endBefore(suppliers?.[0].createdAt), limitToLast(limit)]
        : type === "LAST"
          ? [
              orderBy("createdAt", "desc"),
              limitToLast(limit),
              where("active", "==", true),
            ]
          : [
              startAfter(latestSupplier),
              orderBy("createdAt"),
              where("active", "==", true),
            ],
      tenantContext,
    );

  const searchSuppliers = async (searchKey: string) => {
    const result = await search(
      setLoadingSuppliers,
      "/suppliers",
      searchKey,
      setSuppliersSearchResults,
      [where("active", "==", true)],
      tenantContext,
    );
    return result as Supplier[];
  };

  const searchSuppliersInput = async (searchKey: string) => {
    if (searchKey.length > 2) {
      const result = await search(
        setLoadingSuppliers,
        "suppliers",
        searchKey,
        setSuppliersInputSearchResults,
        [where("active", "==", true)],
        tenantContext,
      );
      return result as Supplier[];
    }
  };

  const cleanSuppliersSearchResults = () => setSuppliersSearchResults(null);

  const refreshSuppliers = () =>
    setDirtyRefreshSuppliers(!dirtyRefreshSuppliers);

  const deactivateSupplier = (documentId: string) =>
    deactivate(setLoadingSuppliers, "suppliers", documentId, refreshSuppliers);

  async function unlinkProductFromSupplier(
    productId: string,
    supplierId: string,
  ) {
    try {
      const supplierRef = db.doc<Partial<Supplier>>(
        firestore,
        `/suppliers`,
        supplierId,
      );
      const supplier = await getDoc(supplierRef);
      if (!supplier) {
        throw new Error("Supplier not found");
      }

      if (!supplier.linkedProductsIds?.includes(productId)) {
        throw new Error("Product not linked to this supplier");
      }

      await update(
        {
          linkedProductsIds: arrayRemove(productId) as unknown as string[],
        },
        supplierRef,
        tenantContext,
      );

      toaster.success({
        title: t("common.success"),
        description: t("admin.productUnlinkedFromSupplierSuccess"),
        duration: 5000,
      });

      refreshSuppliers();
    } catch (error) {
      console.error(error);
      toaster.error({
        title: t("common.error"),
        description: t("admin.errorUnlinkingProductFromSupplier"),
        duration: 5000,
      });
    }
  }

  return (
    <SuppliersContext.Provider
      value={{
        loadingSuppliers,
        pageIndex,
        setPageIndex,
        suppliers,
        suppliersCount,
        suppliersSearchResults,
        suppliersInputSearchResults,
        cleanSuppliersSearchResults,
        showSuppliers,
        searchSuppliers,
        searchSuppliersInput,
        refreshSuppliers,
        dirtyRefreshSuppliers,
        deactivateSupplier,
        unlinkProductFromSupplier,
      }}
    >
      {children}
    </SuppliersContext.Provider>
  );
};

const useSuppliers = () => useContext(SuppliersContext);

export { SuppliersProvider, useSuppliers };
