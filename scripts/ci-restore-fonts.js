#!/usr/bin/env node
/**
 * CI Build Cleanup Script
 * Restores original Google Fonts after CI build
 */

const fs = require("fs");
const path = require("path");

const storeFont = path.join(__dirname, "../apps/store/theme/fonts.ts");
const adminFont = path.join(__dirname, "../apps/admin/theme/fonts.ts");

console.log("🔄 Restoring original Google Fonts...");

function restoreFonts(fontPath, label) {
  const backupPath = `${fontPath}.bak`;

  if (!fs.existsSync(backupPath)) {
    console.log(`ℹ️  ${label} backup not found. Skipping restore.`);
    return;
  }

  if (fs.existsSync(fontPath)) {
    fs.unlinkSync(fontPath);
  }

  fs.renameSync(backupPath, fontPath);
  console.log(`✅ ${label} fonts restored`);
}

restoreFonts(storeFont, "Store");
restoreFonts(adminFont, "Admin");

console.log("✅ Font restore complete!");
