#!/usr/bin/env node
/**
 * CI Build Helper Script
 * Swaps Google Fonts with system fonts for CI builds to avoid network issues
 */

const fs = require("fs");
const path = require("path");

const storeFont = path.join(__dirname, "../apps/store/theme/fonts.ts");
const storeFontCI = path.join(__dirname, "../apps/store/theme/fonts.ci.ts");
const adminFont = path.join(__dirname, "../apps/admin/theme/fonts.ts");
const adminFontCI = path.join(__dirname, "../apps/admin/theme/fonts.ci.ts");

console.log("🔄 Swapping Google Fonts with system fonts for CI build...");

function swapFonts(fontPath, ciPath, label) {
  const backupPath = `${fontPath}.bak`;

  if (!fs.existsSync(ciPath)) {
    throw new Error(`Missing CI font file for ${label}: ${ciPath}`);
  }

  if (fs.existsSync(backupPath)) {
    console.log(`ℹ️  ${label} backup already exists. Keeping existing backup.`);
  } else if (fs.existsSync(fontPath)) {
    fs.renameSync(fontPath, backupPath);
    console.log(`✅ ${label} fonts backed up`);
  } else {
    console.warn(
      `⚠️  ${label} fonts file missing. Creating CI fonts file without backup.`,
    );
  }

  fs.copyFileSync(ciPath, fontPath);
  console.log(`✅ ${label} fonts swapped`);
}

swapFonts(storeFont, storeFontCI, "Store");
swapFonts(adminFont, adminFontCI, "Admin");

console.log("✅ Font swap complete. Ready for CI build!");
