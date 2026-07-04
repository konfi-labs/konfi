import { languages } from "@/i18n/settings";
import { getStoreRuntimeConfigForRequest } from "@/lib/firebase/serverApp";
import { getNavigationProductsMenu } from "@/lib/products/categorized-card-products";
import { DEFAULT_LOCALE, Locale } from "@konfi/types";
import { NextRequest, NextResponse } from "next/server";

function resolveLocale(value: string | null): Locale {
  if (value && languages.includes(value)) {
    return value as Locale;
  }

  return DEFAULT_LOCALE;
}

export async function GET(request: NextRequest) {
  const lng = resolveLocale(request.nextUrl.searchParams.get("lng"));
  const runtimeConfig = await getStoreRuntimeConfigForRequest();

  if (!runtimeConfig) {
    return NextResponse.json(null, { status: 404 });
  }

  const products = await getNavigationProductsMenu(
    lng,
    runtimeConfig.channelId,
  );

  return NextResponse.json(products ?? null);
}
