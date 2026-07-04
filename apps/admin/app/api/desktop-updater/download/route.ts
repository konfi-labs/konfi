import { requireAdminAuth } from "@/actions/auth-utils";
import {
  DesktopUpdaterError,
  getLatestDesktopInstallerFileName,
  resolveDesktopPlatformFromUserAgent,
} from "@/lib/desktop-updater";
import { connection, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  await connection();

  try {
    await requireAdminAuth();

    const platformHint =
      request.nextUrl.searchParams.get("platform") ??
      resolveDesktopPlatformFromUserAgent(request.headers.get("user-agent"));
    const fileName = await getLatestDesktopInstallerFileName(platformHint);
    const downloadUrl = new URL(
      `/api/desktop-updater/${encodeURIComponent(fileName)}`,
      request.nextUrl.origin,
    );

    return Response.redirect(downloadUrl, 307);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Unauthorized: Admin access required")
    ) {
      return Response.json(
        { error: "Unauthorized: Admin access required" },
        {
          headers: {
            "Cache-Control": "no-store",
          },
          status: 401,
        },
      );
    }

    if (error instanceof DesktopUpdaterError) {
      return Response.json(
        { error: error.message },
        {
          headers: {
            "Cache-Control": "no-store",
          },
          status: error.status,
        },
      );
    }

    console.error("Desktop updater download redirect failed:", error);

    return Response.json(
      { error: "Failed to resolve the desktop installer download." },
      {
        headers: {
          "Cache-Control": "no-store",
        },
        status: 500,
      },
    );
  }
}
