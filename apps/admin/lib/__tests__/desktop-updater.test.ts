import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getLatestDesktopInstallerFileName,
  getLatestDesktopReleaseAsset,
  getLatestDesktopVersion,
} from "../desktop-updater";

const latestReleaseResponse = {
  assets: [
    {
      content_type: "application/x-msdownload",
      id: 1,
      name: "Konfi.Desktop.Setup.1.1.2.exe",
      size: 10,
      url: "https://api.github.test/assets/1",
    },
    {
      content_type: "application/octet-stream",
      id: 2,
      name: "Konfi.Desktop.Setup.1.1.2.exe.blockmap",
      size: 10,
      url: "https://api.github.test/assets/2",
    },
  ],
  tag_name: "v1.1.2",
};

const multiPlatformReleaseResponse = {
  assets: [
    {
      content_type: "text/yaml",
      id: 1,
      name: "latest.yml",
      size: 10,
      url: "https://api.github.test/assets/latest-windows",
    },
    {
      content_type: "text/yaml",
      id: 2,
      name: "latest-mac.yml",
      size: 10,
      url: "https://api.github.test/assets/latest-mac",
    },
    {
      content_type: "text/yaml",
      id: 3,
      name: "latest-linux.yml",
      size: 10,
      url: "https://api.github.test/assets/latest-linux",
    },
    {
      content_type: "application/x-msdownload",
      id: 4,
      name: "Konfi.Desktop.Setup.1.2.3.exe",
      size: 10,
      url: "https://api.github.test/assets/windows-installer",
    },
    {
      content_type: "application/x-apple-diskimage",
      id: 5,
      name: "Konfi.Desktop-1.2.3.dmg",
      size: 10,
      url: "https://api.github.test/assets/macos-installer",
    },
    {
      content_type: "application/octet-stream",
      id: 6,
      name: "Konfi.Desktop-1.2.3.AppImage",
      size: 10,
      url: "https://api.github.test/assets/linux-installer",
    },
  ],
  tag_name: "v1.2.3",
};

const stubDesktopUpdaterEnv = () => {
  vi.stubEnv("DESKTOP_UPDATER_GITHUB_TOKEN", "github-token");
  vi.stubEnv("DESKTOP_UPDATER_REPO_OWNER", "sblyvwx");
  vi.stubEnv("DESKTOP_UPDATER_REPO_NAME", "konfi");
};

describe("desktop updater release assets", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("resolves installer asset names when latest.yml uses different separators", async () => {
    stubDesktopUpdaterEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(latestReleaseResponse)),
    );

    const asset = await getLatestDesktopReleaseAsset(
      "Konfi-Desktop-Setup-1.1.2.exe",
    );

    expect(asset.name).toBe("Konfi.Desktop.Setup.1.1.2.exe");
  });

  it("resolves blockmap asset names when latest.yml uses different separators", async () => {
    stubDesktopUpdaterEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(latestReleaseResponse)),
    );

    const asset = await getLatestDesktopReleaseAsset(
      "Konfi-Desktop-Setup-1.1.2.exe.blockmap",
    );

    expect(asset.name).toBe("Konfi.Desktop.Setup.1.1.2.exe.blockmap");
  });

  it("reads Windows metadata from latest.yml", async () => {
    stubDesktopUpdaterEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith("/releases/latest")) {
          return Response.json(multiPlatformReleaseResponse);
        }

        if (url.endsWith("/assets/latest-windows")) {
          return new Response("version: 1.2.3-windows\n");
        }

        return new Response("not found", { status: 404 });
      }),
    );

    await expect(getLatestDesktopVersion("win32")).resolves.toBe(
      "1.2.3-windows",
    );
  });

  it("reads macOS metadata from latest-mac.yml", async () => {
    stubDesktopUpdaterEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith("/releases/latest")) {
          return Response.json(multiPlatformReleaseResponse);
        }

        if (url.endsWith("/assets/latest-mac")) {
          return new Response("version: 1.2.3-mac\n");
        }

        return new Response("not found", { status: 404 });
      }),
    );

    await expect(getLatestDesktopVersion("darwin")).resolves.toBe(
      "1.2.3-mac",
    );
  });

  it("reads Linux metadata from latest-linux.yml", async () => {
    stubDesktopUpdaterEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith("/releases/latest")) {
          return Response.json(multiPlatformReleaseResponse);
        }

        if (url.endsWith("/assets/latest-linux")) {
          return new Response("version: 1.2.3-linux\n");
        }

        return new Response("not found", { status: 404 });
      }),
    );

    await expect(getLatestDesktopVersion("linux")).resolves.toBe(
      "1.2.3-linux",
    );
  });

  it.each([
    ["win32", "Konfi.Desktop.Setup.1.2.3.exe"],
    ["darwin", "Konfi.Desktop-1.2.3.dmg"],
    ["linux", "Konfi.Desktop-1.2.3.AppImage"],
  ])(
    "resolves %s installers from the latest release",
    async (platform, fileName) => {
      stubDesktopUpdaterEnv();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json(multiPlatformReleaseResponse)),
      );

      await expect(getLatestDesktopInstallerFileName(platform)).resolves.toBe(
        fileName,
      );
    },
  );
});
