"use client";

import { ChakraProvider } from "@chakra-ui/react";
import createCache, { type EmotionCache } from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { ColorModeProvider } from "@konfi/components";
import { useServerInsertedHTML } from "next/navigation";
import { useState } from "react";
import { system } from "../../theme";

function createStoreEmotionCache(): EmotionCache {
  const cache = createCache({ key: "css" });
  cache.compat = true;

  return cache;
}

export function StoreChakraProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [{ cache: emotionCache, flush: flushInsertedStyles }] = useState(() => {
    const registryCache = createStoreEmotionCache();
    const previousInsert = registryCache.insert;
    let inserted: string[] = [];

    registryCache.insert = (...args) => {
      const serialized = args[1];

      if (registryCache.inserted[serialized.name] === undefined) {
        inserted.push(serialized.name);
      }

      return previousInsert(...args);
    };

    const flushRegistry = () => {
      const previousInserted = inserted;
      inserted = [];
      return previousInserted;
    };

    return { cache: registryCache, flush: flushRegistry };
  });

  useServerInsertedHTML(() => {
    const names = flushInsertedStyles();

    if (names.length === 0) {
      return null;
    }

    let styles = "";

    for (const name of names) {
      styles += emotionCache.inserted[name];
    }

    return (
      <style
        data-emotion={`${emotionCache.key} ${names.join(" ")}`}
        dangerouslySetInnerHTML={{ __html: styles }}
      />
    );
  });

  return (
    <CacheProvider value={emotionCache}>
      <ChakraProvider value={system}>
        <ColorModeProvider defaultTheme="light">{children}</ColorModeProvider>
      </ChakraProvider>
    </CacheProvider>
  );
}
