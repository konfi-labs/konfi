"use client";

import i18next from "./i18next";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const runsOnServerSide = typeof window === "undefined";

export function useT(ns?: string | string[], options?: { keyPrefix?: string }) {
  const lng = useParams()?.lng as string;
  const [activeLng, setActiveLng] = useState(i18next.resolvedLanguage);

  if (typeof lng !== "string")
    throw new Error("useT is only available inside /app/[lng]");

  useEffect(() => {
    if (runsOnServerSide && i18next.resolvedLanguage !== lng) {
      i18next.changeLanguage(lng);
    }
  }, [lng]);

  useEffect(() => {
    if (!runsOnServerSide && activeLng !== i18next.resolvedLanguage) {
      setActiveLng(i18next.resolvedLanguage);
    }
  }, [activeLng]);

  useEffect(() => {
    if (!runsOnServerSide && lng && i18next.resolvedLanguage !== lng) {
      i18next.changeLanguage(lng);
    }
  }, [lng]);

  return useTranslation(ns, options);
}
