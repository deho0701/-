#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const RUNS_DIR = path.join(ROOT, "runs");
const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\w\s-가-힣]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase() || "community-assets";
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function allowedLicense(meta = {}) {
  const shortName = String(meta.LicenseShortName?.value || "").toLowerCase();
  const license = String(meta.License?.value || "").toLowerCase();
  return (
    shortName.includes("public domain") ||
    shortName.includes("cc0") ||
    shortName.includes("cc by") ||
    shortName.includes("cc by-sa") ||
    license === "pd" ||
    license === "cc0" ||
    license.startsWith("cc-by") ||
    license.startsWith("cc-by-sa")
  );
}

function allowedMedia(url = "") {
  return /\.(png|jpe?g|webp|gif|ogv|webm)$/i.test(url);
}

async function searchWikimedia(query) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", query);
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", "8");
  url.searchParams.set("prop", "imageinfo|info");
  url.searchParams.set("iiprop", "url|extmetadata");
  url.searchParams.set("inprop", "url");
  url.searchParams.set("format", "json");

  const response = await fetch(url, {
    headers: {
      "User-Agent": "CodexCommunityAssetTest/1.0 (contact: local-cli)",
      "Referer": "https://commons.wikimedia.org/"
    }
  });
  if (!response.ok) {
    throw new Error(`Wikimedia request failed: ${response.status}`);
  }
  const json = await response.json();
  const pages = Object.values((json.query || {}).pages || {});
  const normalized = [];
  for (const page of pages) {
    const info = (page.imageinfo || [])[0];
    if (!info?.url) continue;
    if (!allowedMedia(info.url)) continue;
    const meta = info.extmetadata || {};
    if (!allowedLicense(meta)) continue;
    normalized.push({
      title: page.title,
      mediaUrl: info.url,
      descriptionUrl: info.descriptionurl || page.fullurl || "",
      licenseShortName: meta.LicenseShortName?.value || "",
      licenseUrl: meta.LicenseUrl?.value || "",
      artist: meta.Artist?.value || "",
      credit: meta.Credit?.value || "",
      usageTerms: meta.UsageTerms?.value || "",
      attributionRequired: meta.AttributionRequired?.value || "",
      isImage: /\.(png|jpe?g|webp|gif)$/i.test(info.url)
    });
  }
  return normalized;
}

async function downloadFile(url, outPath) {
  await execFileAsync("curl", [
    "-L",
    "--fail",
    "--retry",
    "4",
    "--retry-all-errors",
    "--retry-delay",
    "2",
    "-A",
    "CodexCommunityAssetTest/1.0 (contact: local-cli)",
    "-e",
    "https://commons.wikimedia.org/",
    "-o",
    outPath,
    url
  ]);
}

async function main() {
  const args = parseArgs(process.argv);
  const scriptJson = args["script-json"];
  if (!scriptJson) {
    throw new Error("--script-json is required");
  }

  const resolvedScript = path.isAbsolute(scriptJson) ? scriptJson : path.join(ROOT, scriptJson);
  const finalScript = await readJson(resolvedScript);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const slug = slugify(finalScript.keyword || path.basename(resolvedScript, path.extname(resolvedScript)));
  const runDir = path.join(RUNS_DIR, `${stamp}-community-fetch-${slug}`);
  const assetDir = path.join(runDir, "community-assets");
  await fs.mkdir(assetDir, { recursive: true });

  const manifest = [];
  const augmented = JSON.parse(JSON.stringify(finalScript));
  const beats = augmented.script_beats || [];

  for (let i = 0; i < beats.length; i += 1) {
    const beat = beats[i];
    const query = beat.community_search_query || beat.stock_search_query || beat.on_screen_text || beat.voiceover;
    if (!query) continue;
    const results = await searchWikimedia(query);
    if (!results.length) continue;
    const chosen = results[0];
    const ext = path.extname(new URL(chosen.mediaUrl).pathname) || ".bin";
    const localPath = path.join(assetDir, `beat-${String(i + 1).padStart(2, "0")}${ext}`);
    await downloadFile(chosen.mediaUrl, localPath);
    await new Promise((resolve) => setTimeout(resolve, 300));

    beat.local_asset_path = localPath;
    beat.asset_source_type = "community";
    beat.asset_source_label = "Wikimedia Commons";
    beat.asset_source_url = chosen.descriptionUrl;
    beat.asset_credit = `Wikimedia Commons · ${chosen.licenseShortName || "license unknown"}`;

    manifest.push({
      beat: beat.beat,
      query,
      title: chosen.title,
      media_url: chosen.mediaUrl,
      description_url: chosen.descriptionUrl,
      license: chosen.licenseShortName,
      license_url: chosen.licenseUrl,
      attribution_required: chosen.attributionRequired,
      artist: chosen.artist,
      credit: chosen.credit,
      local_asset_path: localPath,
      is_image: chosen.isImage
    });
  }

  const augmentedPath = path.join(runDir, "augmented-final-script.json");
  const manifestPath = path.join(runDir, "community-assets.json");
  await fs.writeFile(augmentedPath, JSON.stringify(augmented, null, 2));
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(JSON.stringify({
    run_dir: runDir,
    augmented_final_script: augmentedPath,
    community_assets: manifestPath,
    beats_resolved: manifest.length
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
