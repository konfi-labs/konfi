# Konfi Desktop

Electron-based desktop application that integrates the Konfi Admin app with native filesystem operations.

## Features

- Integrates the admin app (running on localhost:3001 in development)
- Provides native file system access for advanced operations
- **Thumbnail Generation**: Optimized thumbnail generation for images and PDFs with:
  - Persistent caching (7-day TTL) to avoid regenerating thumbnails
  - File size limits (max 200MB) and warnings for large files
  - Adaptive quality: lower DPI (72) for files >50MB to improve performance
  - Queue system limiting concurrent operations (max 3) to prevent system overload
  - Automatic cache cleanup on startup
- Cross-platform support (Windows, macOS, Linux)

## Development

1. Install dependencies:

   ```bash
   pnpm --dir apps/desktop install
   pnpm --dir apps/desktop run electron:install
   ```

   The desktop workspace sets `nodeLinker: hoisted` in
   `apps/desktop/pnpm-workspace.yaml`, so `--shamefully-hoist` is not needed
   with pnpm 11. Keep the explicit `electron:install` step: the dependency
   install links the `electron` package, while this step downloads Electron's
   platform runtime into `apps/desktop/node_modules/electron/dist`.

2. Start the admin app first:

   ```bash
   cd apps/admin
   pnpm dev
   ```

3. In another terminal, start the desktop app:
   ```bash
   cd apps/desktop
   pnpm dev
   ```

## Building

Build the TypeScript files:

```bash
pnpm build
```

Package the application:

```bash
pnpm package
```

## Environment Variables

When running through the root monorepo scripts, these values come from the
shared root `.env`. When running the desktop package directly, export them in
the shell before starting Electron.

- `KONFI_DESKTOP_ADMIN_URL` - Admin app URL baked into packaged builds.
- `KONFI_DESKTOP_DEV_ADMIN_URL` - Admin app URL used during local Electron
  development. Defaults to `http://localhost:3001`.
- `KONFI_DESKTOP_COMPANY_URL` - Company or help URL baked into packaged builds
  and opened from the Help menu.
- `KONFI_DESKTOP_ALLOWED_ORIGINS` - Optional comma-separated list of additional
  origins baked into packaged builds and allowed to call privileged IPC
  handlers.

During packaging, `apps/desktop/scripts/run-electron-builder.mjs` writes these
packaged-build values to `desktop-config.json` and includes it in Electron's
resources directory. Installed apps read that file first, so they do not depend
on end-user Windows environment variables being present.

## Architecture

- **main.ts** - Main Electron process, manages the application lifecycle and windows
- **preload.ts** - Preload script that exposes secure APIs to the renderer process
- The main window loads the admin app (Next.js) and will support multiple windows for different operations

### Session Persistence

The desktop app uses a persistent session partition (`persist:konfi-admin`) to ensure authentication and user data persist across:

- App restarts
- Network disconnects/reconnects
- System reboots

This is critical for Firebase Auth which stores authentication tokens in IndexedDB. Without a persistent session partition, users would be logged out when the internet connection is lost or the app is restarted.

**Technical Details:**

- Session data is stored in: `{userData}/Partitions/konfi-admin/`
- Storage includes: IndexedDB, localStorage, cookies, and cache
- Data persists independently of the default Electron session
- Isolated from other sessions for security

## Thumbnail Generation

The desktop app includes an optimized thumbnail generation system for images and PDFs to minimize computational cost and improve performance.

### Performance Optimizations

1. **Persistent Caching**
   - Thumbnails are cached in the system temp directory (`konfi-thumbnail-cache`)
   - Cache key is based on file path, modification time, and size
   - 7-day cache TTL (time-to-live)
   - Automatic cleanup on app startup removes expired entries

2. **File Size Management**
   - Maximum file size: 200MB (files larger than this are rejected)
   - Large file threshold: 50MB (files above this use lower quality settings)
   - Clear error messages inform users when files are too large

3. **Adaptive Quality**
   - Default DPI: 150 for optimal quality
   - Low DPI: 72 for files >50MB (significantly faster processing)
   - Users are notified when low-quality mode is used

4. **Queue System**
   - Maximum 3 concurrent thumbnail operations
   - Prevents system overload from processing many large files simultaneously
   - Operations are queued automatically when limit is reached

5. **Smart Caching**
   - Cache hit returns immediately without regeneration
   - Cache miss triggers generation with automatic cache save
   - Separate cache from temporary previews (10-min TTL)

### Configuration

You can adjust the performance parameters in `src/utils/thumbnails.ts`:

```typescript
const MAX_FILE_SIZE_MB = 200; // Skip files larger than this
const LARGE_FILE_THRESHOLD_MB = 50; // Use lower DPI for files > this size
const MAX_CONCURRENT_OPERATIONS = 3; // Limit concurrent operations
const DEFAULT_DPI = 150; // Standard quality
const LOW_DPI = 72; // Low quality for large files
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
```

### Usage

Thumbnails are generated automatically when viewing order files in the admin interface. The system:

- Checks cache first for instant loading
- Validates file size before processing
- Queues operations if too many are running
- Saves successful generations to cache
- Provides feedback on processing status

### Cache Management

Cache is automatically managed:

- **On startup**: Expired entries (>7 days old) are removed
- **On shutdown**: Preview directory is cleaned up
- **Manual cleanup**: Call `cleanupThumbnailCache()` if needed

### Troubleshooting

**Problem**: Thumbnails take too long to generate

- **Solution**: File may be >50MB (will use low quality). Consider optimizing source files.

**Problem**: "File too large" error

- **Solution**: File exceeds 200MB limit. Split or compress the file.

**Problem**: Ghostscript not found (PDFs)

- **Solution**: Packaging now stages Ghostscript from a local Windows installation automatically. If packaging still fails, install Ghostscript first or manually provide `resources/ghostscript` with `bin`, `lib`, and `Resource`.

## Future Enhancements

- File system operations API for importing/exporting data
- Multiple window support for different workflows
- Native notifications and system tray integration

## Auto-Update

The desktop application includes automatic update functionality powered by electron-updater. Updates are delivered through GitHub Releases.

### How It Works

1. **Automatic Checks**: The app checks for updates on startup (production builds only)
2. **User Notification**: When an update is available, users are prompted to download
3. **Background Download**: Updates download in the background with progress tracking
4. **Install on Restart**: Once downloaded, users can install the update by restarting the app

### Manual Update Check

Users can manually check for updates through the application menu:

- **macOS**: `Konfi Desktop → Check for Updates...`
- **Windows/Linux**: `Help → Check for Updates...`

### Publishing Updates

Desktop releases are published by `.github/workflows/desktop-release.yml`.
Pushing a tag that matches the desktop package version starts the release:

```bash
git tag v1.1.3
git push origin v1.1.3
```

The workflow fails if the tag does not match `apps/desktop/package.json`
without the leading `v`. For example, tag `v1.1.3` requires package version
`1.1.3`.

Required GitHub repository variables. These values are baked into the desktop
artifact during release packaging:

- `DESKTOP_UPDATER_REPO_OWNER`
- `DESKTOP_UPDATER_REPO_NAME`
- `KONFI_DESKTOP_ADMIN_URL`

Required GitHub repository secret:

- `DESKTOP_UPDATER_GITHUB_TOKEN`

The workflow installs desktop dependencies through the desktop workspace, whose
`pnpm-workspace.yaml` uses `nodeLinker: hoisted` for Electron packaging
compatibility. It then runs `pnpm --dir apps/desktop run electron:install`
before packaging so Electron's platform runtime is present on each OS runner.

electron-builder may warn that some `@img/sharp-*` platform-specific optional
dependencies are not bundled. This is expected when packaging a single OS
artifact: the desktop app only needs the sharp binary for the artifact's target
platform, and `sharp` plus `@img` are already unpacked via `asarUnpack`. Do not
add every transitive `@img/*` package to `optionalDependencies` unless the
desktop app starts building multi-platform artifacts from one install tree.

The electron-builder will:

- Create a new GitHub release with the version tag
- Upload the built artifacts for Windows, macOS, and Linux
- Generate update metadata files (`latest.yml`, `latest-mac.yml`,
  `latest-linux.yml`)

Current automated releases are unsigned internal artifacts. Do not point
production/customer-facing admin environments at unsigned releases until Windows
code signing and macOS signing/notarization are configured.

### Configuration

The packaged app uses the admin app as a generic updater feed:

- **Feed**: `${KONFI_DESKTOP_ADMIN_URL}/api/desktop-updater`
- **Runtime auth**: signed-in admin cookies forwarded by the desktop app
- **Artifact store**: GitHub Releases in `DESKTOP_UPDATER_REPO_OWNER` /
  `DESKTOP_UPDATER_REPO_NAME`
- **GitHub auth**: server-side `DESKTOP_UPDATER_GITHUB_TOKEN` in the admin app

No GitHub token is bundled into the desktop app.

### Ghostscript Bundling

CI stages Ghostscript 10.06.0 from pinned Artifex release artifacts and verifies
checksums before packaging. The final bundled resource must contain:

- `bin`
- `lib`
- `Resource`
- `gs` or `gswin64c.exe`
- license/notice files

Run local verification with:

```bash
pnpm --dir apps/desktop run ghostscript:verify
```

Ghostscript is available under AGPL or a commercial Artifex license. Bundled
desktop distribution must keep the required notices and should not be broadened
to customers until the license posture is confirmed.

### Signing Follow-Up

Before customer rollout, add:

- macOS Developer ID signing, hardened runtime, entitlements, and notarization
- Windows Authenticode signing through a protected certificate or signing
  service
- Release validation that signed installers still update through the admin
  proxy

### Development

Auto-update is disabled in development mode (`!app.isPackaged`). To test update functionality:

1. Package the application for your platform
2. Install the packaged version
3. Create a new version and publish it
4. The installed app will detect and download the update
