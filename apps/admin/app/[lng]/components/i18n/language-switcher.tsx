"use client";

import { Route } from "next";
import { useParams, usePathname, useRouter } from "next/navigation";
import { Locale } from "@konfi/types";

const languages = Object.values(Locale);

export default function LanguageSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const currentLng = params.lng as string;

  const handleLanguageChange = (newLng: string) => {
    const newPathname = pathname.replace(`/${currentLng}`, `/${newLng}`);
    router.push(newPathname as Route);
  };

  return (
    <select
      value={currentLng}
      onChange={(e) => handleLanguageChange(e.target.value)}
      style={{ padding: "4px 8px", fontSize: "14px" }}
    >
      {languages.map((lng) => (
        <option key={lng} value={lng}>
          {lng.toUpperCase()}
        </option>
      ))}
    </select>
  );
}
