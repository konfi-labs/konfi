"use client";

import { Quote } from "@konfi/types";
import { isNull } from "es-toolkit";
import {
  DocumentSnapshot,
  endBefore,
  limitToLast,
  orderBy,
  startAfter,
} from "firebase/firestore";
import {
  createContext,
  Dispatch,
  SetStateAction,
  useContext,
  useEffect,
  useState,
} from "react";
import { deactivate, init, search, show } from "@/lib/helpers";
import { useChannels } from "./channels";
import { useAuth } from "./auth";
import { useTenantContext } from "./tenant";

interface IQuotes {
  loadingQuotes: boolean;
  pageIndex: number;
  setPageIndex: Dispatch<SetStateAction<number>>;
  quotes: Quote[] | null;
  quotesCount: number;
  showQuotes: (
    type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST",
    limit: number,
  ) => Promise<void>;
  searchQuotes: (searchKey: string) => Promise<Quote[] | undefined>;
  quotesSearchResults: Quote[] | null;
  quotesRefresh: () => void;
  dirtyRefreshQuotes: boolean;
  deactivateQuote: (documentId: string) => void;
}

const QuotesContext = createContext<IQuotes>({
  loadingQuotes: true,
  pageIndex: 0,
  setPageIndex: () => {},
  quotes: null,
  quotesCount: 0,
  showQuotes: () => Promise.resolve(),
  searchQuotes: () => Promise.resolve(undefined),
  quotesSearchResults: null,
  quotesRefresh: () => {},
  dirtyRefreshQuotes: false,
  deactivateQuote: () => {},
});

const QuotesProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const [loadingQuotes, setLoadingQuotes] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [quotesCount, setQuotesCount] = useState<number>(0);
  const [latestQuote, setLatestQuote] =
    useState<DocumentSnapshot<Quote> | null>(null);
  const [quotesSearchResults, setQuotesSearchResults] = useState<
    Quote[] | null
  >(null);
  const [dirtyRefreshQuotes, setDirtyRefreshQuotes] = useState<boolean>(false);
  const { channel } = useChannels();
  const { user } = useAuth();
  const tenantContext = useTenantContext();

  useEffect(() => {
    if (isNull(channel) || !user) return;
    init(
      setLoadingQuotes,
      "/channels/" + channel.id + "/quotes",
      10,
      setQuotes,
      setLatestQuote,
      "No quotes",
      undefined,
      undefined,
      setQuotesCount,
      undefined,
      undefined,
      tenantContext,
    );
    setPageIndex(0);
  }, [dirtyRefreshQuotes, channel, tenantContext, user]);

  const showQuotes = async (
    type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST",
    limit: number,
  ): Promise<void> =>
    show(
      type,
      setLoadingQuotes,
      "/channels/" + channel?.id + "/quotes",
      limit,
      type === "NEXT" ? latestQuote : undefined,
      setLatestQuote,
      setQuotes,
      type === "PREVIOUS"
        ? [endBefore(quotes?.[0].createdAt), limitToLast(limit)]
        : type === "LAST"
          ? [
              orderBy("createdAt", "desc"),
              limitToLast(quotesCount % limit || limit),
            ]
          : type === "NEXT"
            ? [startAfter(quotes?.[quotes.length - 1].createdAt)]
            : undefined,
      tenantContext,
    );

  const searchQuotes = async (searchKey: string) =>
    await search(
      setLoadingQuotes,
      "/channels/" + channel?.id + "/quotes",
      searchKey,
      setQuotesSearchResults,
      undefined,
      tenantContext,
    );
  const quotesRefresh = () => setDirtyRefreshQuotes(!dirtyRefreshQuotes);
  const deactivateQuote = (documentId: string) =>
    deactivate<Quote>(
      setLoadingQuotes,
      "/channels/" + channel?.id + "/quotes",
      documentId,
      quotesRefresh,
    );

  return (
    <QuotesContext.Provider
      value={{
        loadingQuotes,
        pageIndex,
        setPageIndex,
        quotes,
        quotesCount,
        showQuotes,
        searchQuotes,
        quotesSearchResults,
        quotesRefresh,
        dirtyRefreshQuotes,
        deactivateQuote,
      }}
    >
      {children}
    </QuotesContext.Provider>
  );
};

const useQuotes = () => useContext(QuotesContext);

export { QuotesProvider, useQuotes };
