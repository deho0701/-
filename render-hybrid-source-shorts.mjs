#!/usr/bin/env node
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const RUNS_DIR = path.join(ROOT, "runs");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
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

function nowStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "hybrid";
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadDotEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!(await pathExists(envPath))) return;
  const raw = await fs.readFile(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line)) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!key || process.env[key] != null) continue;
    process.env[key] = value;
  }
}

function resolvePythonBin() {
  const preferred = [
    process.env.SHORTS_PYTHON_BIN,
    path.join(ROOT, ".venv/bin/python"),
    path.join(ROOT, ".venv/bin/python3"),
    "python3",
    "python"
  ].filter(Boolean);
  return preferred.find((candidate) => candidate === "python3" || candidate === "python" || existsSync(candidate)) || "python3";
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function ratio(width, height) {
  return width / Math.max(height, 1);
}

function assTime(seconds) {
  const centiseconds = Math.round(seconds * 100);
  const cs = centiseconds % 100;
  const totalSec = Math.floor(centiseconds / 100);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeAss(text) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\n/g, "\\N");
}

function wrapSubtitle(text, maxChars = 18) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitIntoSentences(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const matches = raw.match(/[^.!?。！？]+[.!?。！？]?/g) || [raw];
  return matches.map((item) => item.trim()).filter(Boolean);
}

function firstSentence(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const match = raw.match(/^(.+?[.!?。！？]|.+$)/);
  return (match ? match[1] : raw).trim();
}

function compactPunchText(text, maxChars = 12) {
  const cleaned = String(text || "")
    .replace(/[.!?。！？]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  if (cleaned.length <= maxChars) return cleaned;
  return cleaned.slice(0, maxChars).trim();
}

function normalizeComparableText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[.!?。！？,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isNearDuplicateLead(a, b) {
  const na = normalizeComparableText(a);
  const nb = normalizeComparableText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) {
    const shorter = Math.min(na.length, nb.length);
    const longer = Math.max(na.length, nb.length);
    return shorter / Math.max(longer, 1) >= 0.62;
  }
  return false;
}

function thematicLabel(short) {
  const joined = [
    short.title,
    short.thumbnail_text,
    short.core_angle,
    ...(short.script_beats || []).flatMap((beat) => [beat.on_screen_text, beat.voiceover])
  ].filter(Boolean).join(" ");
  if (/(불면|잠|수면|밤|insomnia|sleep)/i.test(joined)) return "불면증 해부";
  if (/(뇌|brain|신경|cortisol|stress|불안)/i.test(joined)) return "뇌 루프 분석";
  if (/(주식|시장|돈|finance|stock|crypto)/i.test(joined)) return "돈 흐름 해부";
  if (/(역사|stone|prehistoric|ancient|museum|archaeology)/i.test(joined)) return "역사 포인트";
  return "핵심 포인트";
}

function footerTag(short) {
  const joined = [short.title, short.thumbnail_text, short.core_angle].filter(Boolean).join(" ");
  if (/(불면|잠|수면|밤|insomnia|sleep)/i.test(joined)) return "수면 리포트";
  if (/(뇌|brain|stress|불안)/i.test(joined)) return "메커니즘 요약";
  if (/(역사|stone|prehistoric|ancient)/i.test(joined)) return "도구 해설";
  return "1분 압축";
}

function buildColdOpenText(short) {
  const explicit = String(short.cold_open_text || "").trim();
  if (explicit) return explicit;
  const seed = String(
    short.thumbnail_text ||
    short.on_screen_text ||
    (short.script_beats || [])[0]?.caption_text ||
    (short.script_beats || [])[0]?.on_screen_text ||
    short.title ||
    ""
  ).trim();
  if (!seed) return "이거 방치하면 더 꼬입니다";
  if (/불면|잠/.test(seed)) return `${seed} 이렇게 시작됩니다`;
  return `${seed} 이게 진짜 핵심입니다`;
}

function parseSecondsRange(range) {
  const match = String(range).trim().match(/^(\d+)\s*-\s*(\d+)s$/);
  if (!match) return null;
  return { start: Number(match[1]), end: Number(match[2]) };
}

function buildSpokenSegments(short) {
  const segments = [];
  const coldOpenText = buildColdOpenText(short);
  let skippedFirstLead = false;
  if (coldOpenText) {
    segments.push({
      role: "cold_open",
      style: "ColdOpen",
      text: coldOpenText
    });
  }

  for (const beat of short.script_beats || []) {
    let sentences = splitIntoSentences(beat.voiceover);
    if (!skippedFirstLead && coldOpenText && sentences.length && isNearDuplicateLead(coldOpenText, sentences[0])) {
      sentences = sentences.slice(1);
      skippedFirstLead = true;
    }
    if (!sentences.length) {
      const fallback = String(beat.caption_text || "").trim() || firstSentence(beat.voiceover);
      if (fallback) {
        segments.push({
          role: "beat",
          beat: beat.beat,
          style: "Body",
          text: fallback
        });
      }
      continue;
    }
    for (const sentence of sentences) {
      segments.push({
        role: "beat",
        beat: beat.beat,
        style: "Body",
        text: sentence
      });
    }
  }
  return segments;
}

function buildOverlayTimeline({ short, subtitleTimeline }) {
  const totalDuration = subtitleTimeline?.length
    ? subtitleTimeline[subtitleTimeline.length - 1].end
    : 0;
  const overlays = [];
  if (totalDuration <= 0) return overlays;

  overlays.push({
    style: "Header",
    text: thematicLabel(short),
    start: 0,
    end: totalDuration
  });

  overlays.push({
    style: "FooterTag",
    text: footerTag(short),
    start: 0,
    end: totalDuration
  });

  const timeline = normalizeBeatTimeline(short.script_beats || [], totalDuration);
  for (let i = 0; i < timeline.length; i += 1) {
    const item = timeline[i];
    const text = String(item.beat.on_screen_text || item.beat.caption_text || "").trim();
    if (!text) continue;
    const punchStart = i === 0 ? Math.min(totalDuration - 0.25, 1.95) : Math.min(totalDuration - 0.25, item.start + 0.18);
    const punchEnd = Math.min(totalDuration, round2(punchStart + (i === 0 ? 0.95 : 0.78)));
    if (punchEnd - punchStart < 0.3) continue;
    overlays.push({
      style: i === 0 ? "CenterPunch" : "Punch",
      text,
      start: punchStart,
      end: punchEnd
    });
  }

  return overlays;
}

function normalizeBeatTimeline(scriptBeats, totalDuration) {
  const parsed = scriptBeats.map((beat) => ({ beat, timing: parseSecondsRange(beat.seconds) }));
  const valid = parsed.filter((item) => item.timing);
  if (!valid.length) {
    const chunk = totalDuration / Math.max(scriptBeats.length, 1);
    return scriptBeats.map((beat, index) => ({
      beat,
      start: round2(index * chunk),
      end: round2((index + 1) * chunk)
    }));
  }
  const maxEnd = Math.max(...valid.map((item) => item.timing.end), 1);
  const scale = totalDuration / maxEnd;
  return parsed.map((item, index) => {
    if (!item.timing) {
      const start = round2(index * (totalDuration / Math.max(scriptBeats.length, 1)));
      const end = round2((index + 1) * (totalDuration / Math.max(scriptBeats.length, 1)));
      return { beat: item.beat, start, end };
    }
    return {
      beat: item.beat,
      start: round2(item.timing.start * scale),
      end: round2(item.timing.end * scale)
    };
  });
}

function inferVisualMode(text) {
  const haystack = String(text || "").toLowerCase();
  if (/(insomnia|sleep|circadian|stress|brain|cortisol|anxiety|medical|disorder|dspd|bedtime)/.test(haystack)) {
    return "medical_editorial";
  }
  if (/(stone|prehistoric|archaeology|museum|ancient|hand axe|paleolithic)/.test(haystack)) {
    return "historical_documentary";
  }
  if (/(finance|market|stock|crypto|economy|money|trading)/.test(haystack)) {
    return "finance_editorial";
  }
  if (/(app|tech|software|phone|ai|device|digital)/.test(haystack)) {
    return "tech_explainer";
  }
  return "cinematic_educational";
}

function buildSeriesBible() {
  return {
    series_name: "korean_hybrid_educational_shorts",
    language: "Korean",
    aspect_ratio: "9:16 vertical",
    platform_intent: "YouTube Shorts / TikTok / Reels",
    narrative_tone: "curious, concise, punchy, easy to understand in the first 2 seconds",
    editorial_rule: "rewrite the meaning for Korean short-form delivery, but keep the underlying factual claim aligned with the source material",
    pacing_rule: "fast hook, clear setup, one core explanatory turn, one takeaway",
    subtitle_rule: "single subtitle layer only, large readable Korean, centered low enough to avoid faces and main objects",
    visual_rule: "when source footage is replaced, replacement visuals must still look like they belong to the same short and same story world",
    continuity_priority: [
      "subject identity consistency",
      "environment consistency",
      "palette consistency",
      "lighting consistency",
      "camera motion consistency"
    ],
    forbidden_elements: [
      "watermarks",
      "logos",
      "UI overlays",
      "embedded subtitles",
      "split screen",
      "meme graphics",
      "low-quality AI artifacts"
    ]
  };
}

function buildVideoBible({ sourceTitle, shorts }) {
  const aggregateText = [
    sourceTitle,
    ...(shorts || []).flatMap((short) => [
      short.title,
      short.thumbnail_text,
      short.core_angle,
      ...(short.script_beats || []).flatMap((beat) => [
        beat.voiceover,
        beat.on_screen_text,
        beat.fallback_visual_prompt
      ])
    ])
  ].filter(Boolean).join(" ");

  const inferred = buildContinuityBible({
    sourceTitle,
    short: {
      title: sourceTitle,
      core_angle: aggregateText,
      script_beats: (shorts || []).flatMap((short) => short.script_beats || [])
    }
  });

  return {
    source_title: sourceTitle,
    content_mode: inferred.mode,
    visual_family: inferred.visual_family,
    subject_lock: inferred.subject_lock,
    environment_lock: inferred.environment_lock,
    lighting_lock: inferred.lighting_lock,
    lens_lock: inferred.lens_lock,
    motion_lock: inferred.motion_lock,
    continuity_rule: inferred.continuity_rule,
    negative_prompt: inferred.negative_prompt,
    short_count: (shorts || []).length,
    summary: `All derived shorts from "${sourceTitle}" should feel like one coherent mini-series, even if each short focuses on a different angle.`
  };
}

function buildContinuityBible({ sourceTitle, short }) {
  const joined = [sourceTitle, short.title, short.core_angle, ...(short.script_beats || []).map((beat) => beat.fallback_visual_prompt)].join(" ");
  const mode = inferVisualMode(joined);

  const shared = {
    aspect_ratio: "9:16 vertical",
    realism: "photoreal live-action or polished explainer visual, never cartoonish unless explicitly diagram-based",
    camera_lock: "stable handheld or slow gimbal movement, no frantic whip pans, no abrupt zooms",
    text_rule: "no subtitles, no captions, no on-screen UI text, no watermarks, no logos",
    continuity_rule: "keep the same overall visual world, color palette, and subject identity across all beats in this short unless the beat explicitly changes location",
    edit_rule: "shots should feel usable as 5-8 second b-roll inserts for a Korean educational short",
    negative_prompt: [
      "no text overlay",
      "no subtitles",
      "no watermark",
      "no logo",
      "no extra fingers",
      "no deformed hands",
      "no duplicated objects",
      "no surreal horror look",
      "no meme style",
      "no split screen"
    ]
  };

  if (mode === "medical_editorial") {
    return {
      mode,
      visual_family: "clean editorial medical explainer",
      subject_lock: "same adult subject across beats when a human is shown, contemporary everyday look, grounded and realistic",
      environment_lock: "same modern bedroom, clinic, or neutral health-explainer environment, midnight blue and charcoal base palette with soft warm practical light",
      lighting_lock: "soft low-key night lighting, controlled contrast, subtle rim light, calm but uneasy mood",
      lens_lock: "35mm to 50mm equivalent, shallow-to-medium depth of field, natural skin texture",
      motion_lock: "slow push-in, subtle lateral slide, or static close-up",
      ...shared
    };
  }

  if (mode === "historical_documentary") {
    return {
      mode,
      visual_family: "historical documentary reenactment",
      subject_lock: "same props, same hands, and same artifact material across beats",
      environment_lock: "earth-tone documentary palette, museum or natural stone environment, tactile textures",
      lighting_lock: "natural directional light or warm museum spotlight, textured shadows",
      lens_lock: "40mm to 65mm equivalent, tactile close-ups, macro on material edges when needed",
      motion_lock: "measured documentary movement, slow reveal, tabletop detail shots",
      ...shared
    };
  }

  if (mode === "finance_editorial") {
    return {
      mode,
      visual_family: "premium editorial finance explainer",
      subject_lock: "same office environment and same device language across beats",
      environment_lock: "muted graphite, steel blue, and soft amber highlights, modern desk or market visualization environment",
      lighting_lock: "controlled studio lighting with practical monitor glow",
      lens_lock: "35mm to 50mm equivalent, crisp clean commercial look",
      motion_lock: "slow slide, controlled push, subtle monitor parallax",
      ...shared
    };
  }

  if (mode === "tech_explainer") {
    return {
      mode,
      visual_family: "modern product explainer",
      subject_lock: "same device family and same minimal desk environment across beats",
      environment_lock: "clean dark desk, cyan-blue accent light, minimal clutter",
      lighting_lock: "soft edge lighting with clean specular highlights",
      lens_lock: "35mm to 85mm product-commercial mix",
      motion_lock: "smooth parallax, slow orbit, deliberate UI-free close-up",
      ...shared
    };
  }

  return {
    mode,
    visual_family: "cinematic educational explainer",
    subject_lock: "same primary subject or same prop family across beats",
    environment_lock: "consistent palette and space design across all beats",
    lighting_lock: "soft cinematic lighting with readable contrast",
    lens_lock: "35mm to 50mm equivalent, controlled documentary framing",
    motion_lock: "slow push or locked-off composition",
    ...shared
  };
}

async function extractFrameAtTime({ inputPath, time, outputPath }) {
  await execFileAsync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    String(Math.max(0, time)),
    "-i",
    inputPath,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    outputPath
  ]);
}

async function extractReferenceFrames({ assembledPath, beatTimeline, outDir, totalDuration }) {
  const refDir = path.join(outDir, "reference-frames");
  await ensureDir(refDir);

  const beatFrames = [];
  for (let i = 0; i < beatTimeline.length; i += 1) {
    const item = beatTimeline[i];
    const midpoint = round2((item.start + item.end) / 2);
    const framePath = path.join(refDir, `beat-${String(i + 1).padStart(2, "0")}.jpg`);
    await extractFrameAtTime({
      inputPath: assembledPath,
      time: midpoint,
      outputPath: framePath
    });
    beatFrames.push({
      beat: item.beat.beat || i + 1,
      role:
        i === 0 ? "hook" :
        i === beatTimeline.length - 1 ? "payoff" :
        i === 1 ? "setup" : "body",
      timestamp_seconds: midpoint,
      path: framePath
    });
  }

  const anchorSpecs = [
    { name: "opening-anchor", time: 0.4 },
    { name: "middle-anchor", time: round2(totalDuration / 2) },
    { name: "ending-anchor", time: Math.max(0.4, round2(totalDuration - 0.6)) }
  ];
  const anchorFrames = [];
  for (const anchor of anchorSpecs) {
    const framePath = path.join(refDir, `${anchor.name}.jpg`);
    await extractFrameAtTime({
      inputPath: assembledPath,
      time: Math.min(Math.max(0, anchor.time), Math.max(0.4, totalDuration - 0.1)),
      outputPath: framePath
    });
    anchorFrames.push({
      name: anchor.name,
      timestamp_seconds: anchor.time,
      path: framePath
    });
  }

  const index = {
    beat_frames: beatFrames,
    anchor_frames: anchorFrames
  };
  await fs.writeFile(path.join(refDir, "index.json"), JSON.stringify(index, null, 2));
  return index;
}

function buildDetailedScenePrompts({ sourceTitle, short, seriesBible, videoBible, referenceFrames }) {
  const bible = buildContinuityBible({ sourceTitle, short });
  const beats = (short.script_beats || []).map((beat, index) => {
    const beatRole =
      index === 0 ? "hook" :
      index === (short.script_beats.length - 1) ? "payoff" :
      index === 1 ? "setup" : "body";

    const beatInstruction =
      beatRole === "hook"
        ? "Make the first frame instantly understandable and visually arresting."
        : beatRole === "payoff"
          ? "Make the shot feel conclusive, clarifying, or emotionally closing."
          : "Keep the shot readable and supportive of explanation, not overly flashy.";

    const beatReference = referenceFrames?.beat_frames?.[index] || null;
    const anchorReferences = referenceFrames?.anchor_frames || [];
    const referenceInstruction = beatReference
      ? `Primary visual reference frame: ${beatReference.path} at ${beatReference.timestamp_seconds}s. Match this frame's subject identity, palette, camera language, and spatial logic before adding beat-specific motion.`
      : "No beat-specific reference frame available; lean harder on the continuity locks.";

    const continuityPrompt = [
      `Create a ${bible.aspect_ratio} video generation shot for a Korean educational short.`,
      `Series bible: ${seriesBible.series_name}. Tone ${seriesBible.narrative_tone}.`,
      `Series editorial rule: ${seriesBible.editorial_rule}.`,
      `Video-level consistency summary: ${videoBible.summary}.`,
      `Video-wide visual family: ${videoBible.visual_family}.`,
      `Visual family: ${bible.visual_family}.`,
      `Continuity: ${bible.continuity_rule}.`,
      `Subject continuity: ${bible.subject_lock}.`,
      `Environment continuity: ${bible.environment_lock}.`,
      `Lighting: ${bible.lighting_lock}.`,
      `Lens and framing: ${bible.lens_lock}.`,
      `Camera movement: ${bible.motion_lock}.`,
      referenceInstruction,
      `Anchor references for the whole short: ${anchorReferences.map((item) => `${item.name}=${item.path}`).join(" ; ")}.`,
      `Keep this beat visually compatible with the other beats in the same short.`,
      `Do not introduce a new protagonist, new room, or new palette unless the beat text explicitly requires it.`,
      `Avoid: ${bible.negative_prompt.join(", ")}.`
    ].join(" ");

    const beatSpecificPrompt = [
      `Beat role: ${beatRole}.`,
      `Narrative goal: ${short.core_angle}.`,
      `On-screen meaning for this beat: ${beat.on_screen_text}.`,
      `Base visual idea: ${beat.fallback_visual_prompt}.`,
      beatInstruction,
      `Keep it usable as 5-8 seconds of clean b-roll. ${bible.text_rule}.`
    ].join(" ");

    const prompt = `${continuityPrompt} ${beatSpecificPrompt}`.trim();

    const imagePrompt = [
      `Vertical poster frame for ${bible.visual_family}.`,
      `Series bible: ${seriesBible.series_name}.`,
      `Use the same continuity bible as the full shot.`,
      referenceInstruction,
      `Key concept: ${beat.on_screen_text}.`,
      `Scene idea: ${beat.fallback_visual_prompt}.`,
      `No text, no watermark, no logo.`
    ].join(" ");

    return {
      beat: beat.beat || index + 1,
      role: beatRole,
      on_screen_text: beat.on_screen_text,
      base_prompt: beat.fallback_visual_prompt,
      reference_frame_path: beatReference?.path || null,
      reference_timestamp_seconds: beatReference?.timestamp_seconds ?? null,
      prompt_stack: {
        series_prompt: `${seriesBible.series_name}; ${seriesBible.narrative_tone}; ${seriesBible.visual_rule}`,
        video_prompt: `${videoBible.visual_family}; ${videoBible.subject_lock}; ${videoBible.environment_lock}; ${videoBible.lighting_lock}; ${videoBible.lens_lock}; ${videoBible.motion_lock}`,
        beat_prompt: beatSpecificPrompt
      },
      video_prompt: prompt,
      image_prompt: imagePrompt,
      negative_prompt: bible.negative_prompt.join(", "),
      continuity_notes: {
        visual_family: bible.visual_family,
        subject_lock: bible.subject_lock,
        environment_lock: bible.environment_lock,
        lighting_lock: bible.lighting_lock,
        lens_lock: bible.lens_lock,
        motion_lock: bible.motion_lock
      }
    };
  });

  return {
    source_title: sourceTitle,
    short_title: short.title,
    thumbnail_text: short.thumbnail_text,
    core_angle: short.core_angle,
    series_bible: seriesBible,
    video_bible: videoBible,
    continuity_bible: bible,
    reference_assets: referenceFrames,
    beats
  };
}

function blockToPiece(block, role) {
  return {
    role,
    text: block.text,
    start: round2(Math.max(0, block.start - 0.06)),
    end: round2(block.end + 0.1),
    duration: round2(block.end + 0.1 - Math.max(0, block.start - 0.06))
  };
}

function mergeAdjacentPieces(pieces) {
  const merged = [];
  for (const piece of pieces.sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1];
    if (last && piece.start - last.end <= 0.16) {
      last.end = round2(Math.max(last.end, piece.end));
      last.duration = round2(last.end - last.start);
      last.text = `${last.text} ${piece.text}`.trim();
      continue;
    }
    merged.push({ ...piece });
  }
  return merged;
}

function normalizeBlockIndexList(indices, blockMap) {
  const output = [];
  for (const index of indices || []) {
    const block = blockMap.get(index);
    if (block) output.push(block);
  }
  return output;
}

async function probeVideo(inputPath) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-print_format", "json",
    "-show_streams",
    "-show_format",
    inputPath
  ]);
  const json = JSON.parse(stdout);
  const videoStream = (json.streams || []).find((stream) => stream.codec_type === "video") || {};
  return {
    width: Number(videoStream.width || 1080),
    height: Number(videoStream.height || 1920)
  };
}

async function probeDuration(inputPath) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=nw=1:nk=1",
    inputPath
  ]);
  return Number(String(stdout).trim() || 0);
}

function escapeLavfiPath(filePath) {
  return String(filePath).replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function resolveEdgeVoice(voice) {
  const candidate = String(voice || process.env.SHORTS_EDGE_TTS_VOICE || "").trim();
  if (candidate && /[a-z]{2}-[A-Z]{2}-/.test(candidate)) return candidate;
  return process.env.SHORTS_EDGE_TTS_VOICE || "ko-KR-SunHiNeural";
}

function resolveTtsProvider(args = {}) {
  const provider = String(args["tts-provider"] || process.env.SHORTS_TTS_PROVIDER || "edge").trim().toLowerCase();
  if (!["openai", "edge"].includes(provider)) {
    throw new Error(`지원하지 않는 TTS provider입니다: ${provider}`);
  }
  return provider;
}

async function callSpeech({ input, outPath, voice }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: process.env.SHORTS_TTS_MODEL || "gpt-4o-mini-tts",
      voice,
      input,
      response_format: process.env.SHORTS_TTS_RESPONSE_FORMAT || "mp3",
      instructions: "Speak entirely in Korean. Sound like a concise YouTube Shorts narrator with clear emphasis."
    })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI TTS 오류 (${response.status}): ${body}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  await fs.writeFile(outPath, Buffer.from(arrayBuffer));
}

async function callEdgeSpeech({ input, outPath, voice }) {
  await execFileAsync(resolvePythonBin(), [
    "-m",
    "edge_tts",
    "--text",
    input,
    "--voice",
    resolveEdgeVoice(voice),
    "--write-media",
    outPath
  ]);
}

async function synthesizeNarration({ input, outPath, voice, ttsProvider }) {
  if (ttsProvider === "edge") {
    await callEdgeSpeech({ input, outPath, voice });
    return { provider: "edge" };
  }
  await callSpeech({ input, outPath, voice });
  return { provider: "openai" };
}

async function normalizeAudio(inPath, outPath) {
  await execFileAsync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    inPath,
    "-af",
    "loudnorm=I=-15:LRA=11:TP=-1.5,acompressor=threshold=-18dB:ratio=2:attack=20:release=250,volume=1.8",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-c:a",
    "libmp3lame",
    outPath
  ]);
}

async function renderPieceClip({ inputPath, outputPath, start, end, width, height }) {
  const duration = round2(end - start);
  const horizontalLike = ratio(width, height) > 0.8;
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    String(start),
    "-i",
    inputPath,
    "-t",
    String(duration)
  ];

  if (horizontalLike) {
    args.push(
      "-filter_complex",
      "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:4[bg];" +
        "[0:v]scale=1080:1600:force_original_aspect_ratio=decrease[fg];" +
        "[bg][fg]overlay=(W-w)/2:(H-h)/2[vout]",
      "-map",
      "[vout]"
    );
  } else {
    args.push(
      "-vf",
      "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
      "-map",
      "0:v:0"
    );
  }

  args.push(
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    outputPath
  );

  await execFileAsync("ffmpeg", args);
}

async function renderInterruptionCardClip({ outputPath, text, duration = 0.22 }) {
  const assPath = `${outputPath}.ass`;
  const safeText = escapeAss(compactPunchText(text, 14) || "핵심 포인트");
  const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Card,Noto Sans CJK KR,92,&H00161616,&H000000FF,&H00F3D65A,&H00F3D65A,1,0,0,0,100,100,0,0,3,0,0,5,84,84,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,${assTime(duration)},Card,,0,0,0,,${safeText}
`;
  await fs.writeFile(assPath, ass);
  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      `color=c=0x111111:s=1080x1920:d=${duration}`,
      "-vf",
      `subtitles='${escapeLavfiPath(assPath)}'`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-an",
      outputPath
    ]);
  } finally {
    await fs.rm(assPath, { force: true }).catch(() => {});
  }
}

async function renderColdOpenCardClip({ outputPath, short, duration = 1.35 }) {
  const assPath = `${outputPath}.ass`;
  const headerText = escapeAss(thematicLabel(short));
  const footerText = escapeAss(footerTag(short));
  const hookText = escapeAss(compactPunchText(buildColdOpenText(short), 18) || "이 밤이 문제입니다");
  const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Header,Noto Sans CJK KR,36,&H00FFFFFF,&H000000FF,&H00202020,&H66000000,1,0,0,0,100,100,0,0,1,2,0,8,72,72,82,1
Style: Footer,Noto Sans CJK KR,30,&H001A1A1A,&H000000FF,&H00F1D54E,&H00F1D54E,1,0,0,0,100,100,0,0,3,0,0,2,72,72,58,1
Style: Hook,Noto Sans CJK KR,98,&H00111111,&H000000FF,&H00F3D65A,&H00F3D65A,1,0,0,0,100,100,0,0,3,0,0,5,92,92,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,${assTime(duration)},Header,,0,0,0,,${headerText}
Dialogue: 0,0:00:00.00,${assTime(duration)},Footer,,0,0,0,,${footerText}
Dialogue: 0,0:00:00.00,${assTime(duration)},Hook,,0,0,0,,${hookText}
`;
  await fs.writeFile(assPath, ass);
  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      `color=c=0x0d0d0d:s=1080x1920:d=${duration}`,
      "-vf",
      `subtitles='${escapeLavfiPath(assPath)}'`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-an",
      outputPath
    ]);
  } finally {
    await fs.rm(assPath, { force: true }).catch(() => {});
  }
}

async function concatRenderedPieces({ segmentPaths, outputPath }) {
  const listPath = `${outputPath}.txt`;
  const list = segmentPaths.map((segmentPath) => `file '${segmentPath.replace(/'/g, "'\\''")}'`).join("\n");
  await fs.writeFile(listPath, `${list}\n`);
  await execFileAsync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    outputPath
  ]);
  return listPath;
}

async function concatAudioSegments({ segmentPaths, outputPath }) {
  const listPath = `${outputPath}.txt`;
  const list = segmentPaths.map((segmentPath) => `file '${segmentPath.replace(/'/g, "'\\''")}'`).join("\n");
  await fs.writeFile(listPath, `${list}\n`);
  await execFileAsync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-c:a",
    "libmp3lame",
    outputPath
  ]);
  return listPath;
}

async function extendVideoToDuration({ inputPath, outputPath, targetDuration, currentDuration }) {
  const extra = round2(Math.max(0, targetDuration - currentDuration));
  if (extra <= 0.05) return false;
  await execFileAsync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    inputPath,
    "-vf",
    `tpad=stop_mode=clone:stop_duration=${extra}`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-an",
    outputPath
  ]);
  return true;
}

function buildHybridAss({ subtitleTimeline, short }) {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ColdOpen,Noto Sans CJK KR,82,&H00FFFFFF,&H000000FF,&H00000000,&H701010CC,1,0,0,0,100,100,0,0,1,4,0,5,72,72,0,1
Style: Header,Noto Sans CJK KR,34,&H00FFFFFF,&H000000FF,&H00202020,&H66000000,1,0,0,0,100,100,0,0,1,2,0,7,70,70,82,1
Style: FooterTag,Noto Sans CJK KR,30,&H001A1A1A,&H000000FF,&H00F1D54E,&H00F1D54E,1,0,0,0,100,100,0,0,3,0,0,1,72,72,54,1
Style: CenterPunch,Noto Sans CJK KR,90,&H00161616,&H000000FF,&H00F3D65A,&H00F3D65A,1,0,0,0,100,100,0,0,3,0,0,5,84,84,0,1
Style: Punch,Noto Sans CJK KR,70,&H00161616,&H000000FF,&H00F3D65A,&H00F3D65A,1,0,0,0,100,100,0,0,3,0,0,8,84,84,250,1
Style: Body,Noto Sans CJK KR,58,&H00FFFFFF,&H000000FF,&H00101010,&H78000000,1,0,0,0,100,100,0,0,1,3,0,2,90,90,182,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const lines = [];
  for (const item of buildOverlayTimeline({ short, subtitleTimeline })) {
    lines.push(`Dialogue: 0,${assTime(item.start)},${assTime(item.end)},${item.style},,0,0,0,,${escapeAss(wrapSubtitle(item.text, item.style === "Header" ? 12 : 16))}`);
  }
  for (const item of subtitleTimeline || []) {
    const maxChars = item.style === "ColdOpen" ? 12 : 16;
    lines.push(`Dialogue: 1,${assTime(item.start)},${assTime(item.end)},${item.style},,0,0,0,,${escapeAss(wrapSubtitle(item.text, maxChars))}`);
  }
  return `${header}\n${lines.join("\n")}\n`;
}

async function renderHybridShort({ inputPath, outDir, short, blocks, width, height, voice, ttsProvider, seriesBible, videoBible }) {
  const blockMap = new Map(blocks.map((block) => [block.index, block]));
  const hook = normalizeBlockIndexList(short.hook_indices, blockMap);
  const setup = normalizeBlockIndexList(short.setup_indices, blockMap);
  const body = normalizeBlockIndexList(short.body_indices, blockMap);
  const payoff = normalizeBlockIndexList(short.payoff_indices, blockMap);
  if (!hook.length || !setup.length || !body.length || !payoff.length) {
    throw new Error(`필수 block index가 비어 있습니다: ${short.title}`);
  }

  const pieces = mergeAdjacentPieces([
    ...hook.map((block) => blockToPiece(block, "hook")),
    ...setup.map((block) => blockToPiece(block, "setup")),
    ...body.map((block) => blockToPiece(block, "body")),
    ...payoff.map((block) => blockToPiece(block, "payoff"))
  ]);

  const tempDir = path.join(outDir, "pieces");
  await ensureDir(tempDir);
  const piecePaths = [];
  const visualSegmentPaths = [];
  const assembledPath = path.join(outDir, "base-visuals.mp4");
  const paddedVisualPath = path.join(outDir, "base-visuals-padded.mp4");
  const subtitlePath = path.join(outDir, "subtitles.ass");
  const rawNarrationPath = path.join(outDir, "narration-raw.mp3");
  const narrationPath = path.join(outDir, "narration.mp3");
  const outputPath = path.join(outDir, "short.mp4");
  const audioTempDir = path.join(outDir, "tts-segments");
  let concatListPath = "";
  let audioConcatListPath = "";

  try {
    for (let i = 0; i < pieces.length; i += 1) {
      if (i === 0) {
        const coldOpenPath = path.join(tempDir, "cold-open-card.mp4");
        await renderColdOpenCardClip({
          outputPath: coldOpenPath,
          short,
          duration: 1.35
        });
        visualSegmentPaths.push(coldOpenPath);
      }
      const piece = pieces[i];
      const piecePath = path.join(tempDir, `piece-${String(i + 1).padStart(2, "0")}.mp4`);
      await renderPieceClip({
        inputPath,
        outputPath: piecePath,
        start: piece.start,
        end: piece.end,
        width,
        height
      });
      piecePaths.push(piecePath);
      visualSegmentPaths.push(piecePath);
      if (i < pieces.length - 1) {
        const cardText = compactPunchText(pieces[i + 1].text, i === 0 ? 14 : 12) || compactPunchText(piece.text, 12);
        const cardPath = path.join(tempDir, `card-${String(i + 1).padStart(2, "0")}.mp4`);
        await renderInterruptionCardClip({
          outputPath: cardPath,
          text: cardText,
          duration: i === 0 ? 0.28 : 0.18
        });
        visualSegmentPaths.push(cardPath);
      }
    }

    concatListPath = await concatRenderedPieces({ segmentPaths: visualSegmentPaths, outputPath: assembledPath });
    const interruptDuration = round2(1.35 + (pieces.length > 1 ? 0.28 : 0) + Math.max(0, pieces.length - 2) * 0.18);
    const totalDuration = round2(pieces.reduce((sum, piece) => sum + piece.duration, 0) + interruptDuration);
    const beatTimeline = normalizeBeatTimeline(short.script_beats || [], totalDuration);
    const referenceFrames = await extractReferenceFrames({
      assembledPath,
      beatTimeline,
      outDir,
      totalDuration
    });
    const spokenSegments = buildSpokenSegments(short);
    await ensureDir(audioTempDir);
    const rawSegmentPaths = [];
    const subtitleTimeline = [];
    let cursor = 0;
    for (let i = 0; i < spokenSegments.length; i += 1) {
      const segment = spokenSegments[i];
      const segmentRawPath = path.join(audioTempDir, `segment-${String(i + 1).padStart(2, "0")}.mp3`);
      await synthesizeNarration({
        input: segment.text,
        outPath: segmentRawPath,
        voice,
        ttsProvider
      });
      const duration = round2(await probeDuration(segmentRawPath));
      rawSegmentPaths.push(segmentRawPath);
      subtitleTimeline.push({
        style: segment.style,
        text: segment.text,
        start: cursor,
        end: round2(cursor + duration)
      });
      cursor = round2(cursor + duration);
    }
    audioConcatListPath = await concatAudioSegments({
      segmentPaths: rawSegmentPaths,
      outputPath: rawNarrationPath
    });
    await fs.writeFile(subtitlePath, buildHybridAss({
      subtitleTimeline,
      short
    }));

    await normalizeAudio(rawNarrationPath, narrationPath);
    const ttsInfo = { provider: ttsProvider, segmented: true, segmentCount: spokenSegments.length };
    const narrationDuration = await probeDuration(narrationPath);
    const combineVisualPath = await extendVideoToDuration({
      inputPath: assembledPath,
      outputPath: paddedVisualPath,
      targetDuration: narrationDuration,
      currentDuration: totalDuration
    }) ? paddedVisualPath : assembledPath;

    await execFileAsync("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      combineVisualPath,
      "-i",
      narrationPath,
      "-vf",
      `subtitles='${escapeLavfiPath(subtitlePath)}'`,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      outputPath
    ]);
    const fallbackPrompts = (short.script_beats || []).map((beat, index) => ({
      beat: beat.beat || index + 1,
      on_screen_text: beat.on_screen_text,
      fallback_visual_prompt: beat.fallback_visual_prompt
    }));
    const detailedPrompts = buildDetailedScenePrompts({
      sourceTitle: short.source_title || "",
      short,
      seriesBible,
      videoBible,
      referenceFrames
    });
    await fs.writeFile(path.join(outDir, "scene-fallback-prompts.json"), JSON.stringify(fallbackPrompts, null, 2));
    await fs.writeFile(path.join(outDir, "scene-generation-prompts.detailed.json"), JSON.stringify(detailedPrompts, null, 2));
    await fs.writeFile(path.join(outDir, "render-plan.json"), JSON.stringify({
      title: short.title,
      thumbnailText: short.thumbnail_text,
      coreAngle: short.core_angle,
      pieces,
      beatTimeline,
      subtitleTimeline,
      spokenSegments,
      referenceFrames,
      finalVisualDuration: round2(Math.max(totalDuration, narrationDuration)),
      narrationDuration: round2(narrationDuration),
      tts: ttsInfo
    }, null, 2));

    return {
      title: short.title,
      thumbnailText: short.thumbnail_text,
      coreAngle: short.core_angle,
      outputPath,
      subtitlePath,
      narrationPath,
      pieces,
      fallbackPrompts,
      detailedPromptPath: path.join(outDir, "scene-generation-prompts.detailed.json"),
      narrationDuration: round2(narrationDuration)
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(audioTempDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(assembledPath, { force: true }).catch(() => {});
    await fs.rm(paddedVisualPath, { force: true }).catch(() => {});
    await fs.rm(concatListPath, { force: true }).catch(() => {});
    await fs.rm(audioConcatListPath, { force: true }).catch(() => {});
    await fs.rm(rawNarrationPath, { force: true }).catch(() => {});
  }
}

async function main() {
  await loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  if (!args.video || !args["packet-json"] || !args["hybrid-script-json"]) {
    throw new Error("`--video`, `--packet-json`, `--hybrid-script-json` 가 모두 필요합니다.");
  }

  const inputPath = path.resolve(args.video);
  const packetPath = path.resolve(args["packet-json"]);
  const hybridScriptPath = path.resolve(args["hybrid-script-json"]);
  const voice = args.voice || process.env.SHORTS_TTS_VOICE || "coral";
  const ttsProvider = resolveTtsProvider(args);

  const [packet, hybridScript, videoInfo] = await Promise.all([
    readJson(packetPath),
    readJson(hybridScriptPath),
    probeVideo(inputPath)
  ]);

  const runDir = path.join(RUNS_DIR, `${nowStamp()}-hybrid-${slugify(packet.source_title || path.parse(inputPath).name)}`);
  const shortsDir = path.join(runDir, "shorts");
  await ensureDir(shortsDir);
  const seriesBible = buildSeriesBible();
  const videoBible = buildVideoBible({
    sourceTitle: packet.source_title || path.parse(inputPath).name,
    shorts: hybridScript.shorts || []
  });

  await fs.writeFile(path.join(runDir, "input.json"), JSON.stringify({
    video: inputPath,
    packetJson: packetPath,
    hybridScriptJson: hybridScriptPath,
    ttsProvider,
    voice
  }, null, 2));
  await fs.writeFile(path.join(runDir, "series-bible.json"), JSON.stringify(seriesBible, null, 2));
  await fs.writeFile(path.join(runDir, "video-bible.json"), JSON.stringify(videoBible, null, 2));

  const outputs = [];
  for (let i = 0; i < (hybridScript.shorts || []).length; i += 1) {
    const short = {
      ...hybridScript.shorts[i],
      source_title: packet.source_title || ""
    };
    const outDir = path.join(shortsDir, `short-${String(i + 1).padStart(2, "0")}`);
    await ensureDir(outDir);
    const output = await renderHybridShort({
      inputPath,
      outDir,
      short,
      blocks: packet.blocks || [],
      width: videoInfo.width,
      height: videoInfo.height,
      voice,
      ttsProvider,
      seriesBible,
      videoBible
    });
    outputs.push(output);
  }

  await fs.writeFile(path.join(runDir, "selected.json"), JSON.stringify(outputs, null, 2));
  console.log(`완료: ${runDir}`);
  console.log(`- hybrid shorts: ${outputs.length}`);
  for (const item of outputs) {
    console.log(`- ${item.outputPath}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
