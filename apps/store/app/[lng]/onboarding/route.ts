import { NextRequest, NextResponse } from "next/server";

type Params = Promise<{ lng: string }>;

export async function GET(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { lng } = await params;

  return NextResponse.redirect(new URL(`/${lng}?preview=1`, request.url));
}
