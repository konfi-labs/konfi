export function isElectron() {
  if (typeof window !== "undefined" && "konfiDesktop" in window) {
    return true;
  }

  // Renderer process
  if (typeof window !== "undefined" && typeof window.process === "object") {
    return true;
  }

  // Main process
  if (
    typeof process !== "undefined" &&
    typeof process.versions === "object" &&
    !!process.versions.electron
  ) {
    return true;
  }

  // User agent check (when nodeIntegration is true)
  if (
    typeof navigator === "object" &&
    typeof navigator.userAgent === "string" &&
    navigator.userAgent.indexOf("Electron") >= 0
  ) {
    return true;
  }

  return false;
}
