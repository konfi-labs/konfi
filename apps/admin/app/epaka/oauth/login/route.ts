import { getEpakaAuthUrl } from "@/actions/epaka-oauth";
import { NextResponse } from "next/server";

export async function GET() {
  const url = await getEpakaAuthUrl();
  return NextResponse.redirect(url);
}
