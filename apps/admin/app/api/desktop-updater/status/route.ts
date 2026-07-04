import { requireAdminAuth } from "@/actions/auth-utils";
import {
  DesktopUpdaterError,
  getLatestDesktopInstallerFileName,
  getLatestDesktopVersion,
  resolveDesktopPlatformFromUserAgent,
} from "@/lib/desktop-updater";
import { connection, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  await connection();

  try {
    await requireAdminAuth();

    const currentVersion = request.nextUrl.searchParams
      .get("currentVersion")
      ?.trim();
    const platformHint =
      request.nextUrl.searchParams.get("platform") ??
      resolveDesktopPlatformFromUserAgent(request.headers.get("user-agent"));

    const [latestVersion, installerFileName] = await Promise.all([
      getLatestDesktopVersion(platformHint),
      getLatestDesktopInstallerFileName(platformHint),
    ]);

    return Response.json(
      {
        currentVersion: currentVersion || null,
        installerFileName,
        latestVersion,
        updateAvailable: currentVersion
          ? currentVersion !== latestVersion
          : null,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
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

    console.error("Desktop updater status request failed:", error);

    return Response.json(
      { error: "Failed to resolve desktop updater status." },
      {
        headers: {
          "Cache-Control": "no-store",
        },
        status: 500,
      },
    );
  }
}
