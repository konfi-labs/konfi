"use client";

import { Statistics } from "@konfi/types";
import { isNull } from "es-toolkit";
import { createContext, useContext, useEffect, useState } from "react";
import { getStatistics } from "@/lib/helpers";
import { useChannels } from "./channels";
import { useAuth } from "./auth";

interface IStatistics {
  loadingStatistics: boolean;
  statistics: Statistics | null;
}

const StatisticsContext = createContext<IStatistics>({
  loadingStatistics: true,
  statistics: null,
});

const StatisticsProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const [loadingStatistics, setLoadingStatistics] = useState(true);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const { channel } = useChannels();
  const { user } = useAuth();

  useEffect(() => {
    if (isNull(channel) || !user) return;
    getStatistics(setLoadingStatistics, setStatistics, channel.id);
  }, [channel, user]);

  return (
    <StatisticsContext.Provider
      value={{
        loadingStatistics,
        statistics,
      }}
    >
      {children}
    </StatisticsContext.Provider>
  );
};

const useStatistics = () => useContext(StatisticsContext);

export { StatisticsProvider, useStatistics };
