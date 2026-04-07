import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const RUNS_DIR = path.join(ROOT, "runs");
const execFileAsync = promisify(execFile);

async function loadDotEnv() {
  try {
    const envPath = path.join(ROOT, ".env");
    const content = await fs.readFile(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const rawValue = trimmed.slice(eqIndex + 1).trim();
      const value = rawValue.replace(/^['"]|['"]$/g, "");
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // optional
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    args[key] = value;
  }
  return args;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "job";
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

const TEMPLATE_PRESETS = {
  minimal: {
    bodyFontSize: 56,
    primary: "&H00FFFFFF",
    outline: "&H00101010",
    back: "&H58000000",
    headerPrimary: "&H00FFFFFF",
    headerBack: "&H40000000"
  },
  vibrant: {
    bodyFontSize: 58,
    primary: "&H00FFF8F0",
    outline: "&H00200A60",
    back: "&H604317C8",
    headerPrimary: "&H00FFFFFF",
    headerBack: "&H503A12D9"
  },
  newsletter: {
    bodyFontSize: 54,
    primary: "&H00000000",
    outline: "&H00F5E6A8",
    back: "&H60F5E6A8",
    headerPrimary: "&H00000000",
    headerBack: "&H70F5E6A8"
  },
  sandpaper: {
    bodyFontSize: 56,
    primary: "&H00FFF6E4",
    outline: "&H003B2410",
    back: "&H7056341F",
    headerPrimary: "&H00FFF6E4",
    headerBack: "&H7056341F"
  },
  greenline: {
    bodyFontSize: 56,
    primary: "&H00E9FFF2",
    outline: "&H00071F0D",
    back: "&H6017A84F",
    headerPrimary: "&H00E9FFF2",
    headerBack: "&H6017A84F"
  }
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function uniqueSorted(values, precision = 2) {
  const factor = 10 ** precision;
  return [...new Set(values.map((value) => Math.round(value * factor) / factor))]
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

async function readText(filePath) {
  return fs.readFile(filePath, "utf8");
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

function resolveYtDlpBinary() {
  const preferred = [
    process.env.YT_DLP_BIN,
    path.join(ROOT, ".venv/bin/yt-dlp"),
    path.join(process.env.HOME || "", ".local/bin/yt-dlp"),
    "/usr/local/bin/yt-dlp",
    "/usr/bin/yt-dlp",
    "yt-dlp"
  ].filter(Boolean);
  return preferred.find((candidate) => candidate === "yt-dlp" || existsSync(candidate)) || "yt-dlp";
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

function resolveLlmConfig(args = {}) {
  const apiKey = args["llm-api-key"] || process.env.SHORTS_LLM_API_KEY || process.env.OPENAI_API_KEY || "";
  const baseUrl = String(args["llm-base-url"] || process.env.SHORTS_LLM_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1")
    .replace(/\/$/, "");
  const model = args["llm-model"] || process.env.SHORTS_LLM_MODEL || process.env.SHORTS_WORKER_MODEL || "gpt-5.4-mini";
  return {
    apiKey,
    baseUrl,
    model,
    enabled: Boolean(apiKey)
  };
}

async function callStructuredChat({ model, baseUrl, apiKey, systemPrompt, userPayload, schema }) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(userPayload, null, 2) }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schema.name,
          strict: true,
          schema: schema.schema
        }
      }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LLM storyboard API 오류 (${response.status}): ${body}`);
  }

  const json = await response.json();
  const raw = json?.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error("LLM storyboard 응답에서 content를 찾지 못했습니다.");
  }
  return JSON.parse(raw);
}

function isYouTubeUrl(value) {
  const text = String(value || "").trim();
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(text);
}

function escapeLavfiPath(filePath) {
  return String(filePath).replace(/\\/g, "/").replace(/'/g, "\\'");
}

async function extractAudioForTranscription(inputPath, outPath) {
  await execFileAsync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    inputPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    outPath
  ]);
}

async function transcribeMedia({ inputPath, runDir, modelName }) {
  const audioPath = path.join(runDir, "transcription-audio.wav");
  const transcriptPath = path.join(runDir, "transcript.json");
  await extractAudioForTranscription(inputPath, audioPath);
  await execFileAsync(resolvePythonBin(), [
    path.join(ROOT, "transcribe_faster_whisper.py"),
    audioPath,
    transcriptPath,
    modelName
  ], { maxBuffer: 1024 * 1024 * 20 });
  return JSON.parse(await fs.readFile(transcriptPath, "utf8"));
}

async function fetchYouTubeMetadata(url) {
  const ytDlp = resolveYtDlpBinary();
  const { stdout } = await execFileAsync(ytDlp, [
    "--no-playlist",
    "--js-runtimes",
    "node",
    "--dump-single-json",
    url
  ], { maxBuffer: 1024 * 1024 * 20 });
  const json = JSON.parse(stdout);
  return {
    id: json.id,
    title: json.title,
    uploader: json.uploader,
    duration: json.duration,
    webpageUrl: json.webpage_url || url
  };
}

async function downloadYouTubeVideo({ url, downloadDir }) {
  await ensureDir(downloadDir);
  const metadata = await fetchYouTubeMetadata(url);
  const ytDlp = resolveYtDlpBinary();
  const outputTemplate = "%(title).120B-%(id)s.%(ext)s";
  const { stdout } = await execFileAsync(ytDlp, [
    "--no-playlist",
    "--js-runtimes",
    "node",
    "--merge-output-format",
    "mp4",
    "-f",
    "bv*[height<=1080]+ba/b[height<=1080]/b",
    "-P",
    downloadDir,
    "-o",
    outputTemplate,
    "--print",
    "after_move:filepath",
    url
  ], { maxBuffer: 1024 * 1024 * 20 });

  const downloadedPath = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .pop();

  if (!downloadedPath) {
    throw new Error("yt-dlp 다운로드 경로를 찾지 못했습니다.");
  }

  return {
    videoPath: path.resolve(downloadedPath),
    metadata
  };
}

async function probeVideo(filePath) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=index,codec_type,width,height,r_frame_rate",
    "-of",
    "json",
    filePath
  ]);
  const json = JSON.parse(stdout);
  const videoStream = (json.streams || []).find((stream) => stream.codec_type === "video");
  if (!videoStream) {
    throw new Error("입력 영상에서 video stream을 찾지 못했습니다.");
  }
  return {
    duration: Number(json.format?.duration || 0),
    width: Number(videoStream.width || 0),
    height: Number(videoStream.height || 0),
    fps: String(videoStream.r_frame_rate || "0/1")
  };
}

async function detectSceneChanges(filePath, threshold) {
  try {
    const { stderr } = await execFileAsync("ffmpeg", [
      "-hide_banner",
      "-i",
      filePath,
      "-vf",
      `select='gt(scene,${threshold})',showinfo`,
      "-f",
      "null",
      "-"
    ]);
    return [...String(stderr).matchAll(/pts_time:([0-9.]+)/g)]
      .map((match) => Number(match[1]))
      .filter((value) => Number.isFinite(value) && value > 0);
  } catch (error) {
    const stderr = error.stderr || "";
    return [...String(stderr).matchAll(/pts_time:([0-9.]+)/g)]
      .map((match) => Number(match[1]))
      .filter((value) => Number.isFinite(value) && value > 0);
  }
}

async function detectSilences(filePath, noiseDb, minDuration) {
  try {
    const { stderr } = await execFileAsync("ffmpeg", [
      "-hide_banner",
      "-i",
      filePath,
      "-af",
      `silencedetect=noise=${noiseDb}dB:d=${minDuration}`,
      "-f",
      "null",
      "-"
    ]);
    return parseSilencedetect(stderr);
  } catch (error) {
    const stderr = error.stderr || "";
    return parseSilencedetect(stderr);
  }
}

function parseSilencedetect(stderr) {
  const starts = [...String(stderr).matchAll(/silence_start:\s*([0-9.]+)/g)].map((match) => Number(match[1]));
  const ends = [...String(stderr).matchAll(/silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/g)].map((match) => ({
    end: Number(match[1]),
    duration: Number(match[2])
  }));
  const silences = [];
  let currentStart = null;

  for (const start of starts) {
    if (currentStart == null || start > currentStart) {
      currentStart = start;
    }
    const match = ends.find((item) => item.end >= start);
    if (match) {
      silences.push({
        start,
        end: match.end,
        duration: match.duration
      });
      currentStart = null;
    }
  }

  return silences
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
    .map((item) => ({
      start: round2(item.start),
      end: round2(item.end),
      duration: round2(item.end - item.start)
    }));
}

function overlapDuration(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function sumSilenceWithin(start, end, silences) {
  let total = 0;
  for (const silence of silences) {
    total += overlapDuration(start, end, silence.start, silence.end);
  }
  return total;
}

function countScenesWithin(start, end, scenes) {
  return scenes.filter((time) => time > start && time < end).length;
}

function nearestDistance(time, points) {
  if (!points.length) return Infinity;
  let min = Infinity;
  for (const point of points) {
    min = Math.min(min, Math.abs(time - point));
  }
  return min;
}

function buildCutPoints(duration, scenes, silences) {
  const points = [0, duration];
  for (const time of scenes) points.push(time);
  for (const silence of silences) {
    points.push(silence.start);
    points.push(silence.end);
  }
  return uniqueSorted(points.filter((value) => value >= 0 && value <= duration));
}

function transcriptSegmentsWithin(start, end, transcriptSegments) {
  return transcriptSegments.filter((segment) => segment.end > start && segment.start < end);
}

function transcriptTextWithin(start, end, transcriptSegments) {
  return transcriptSegmentsWithin(start, end, transcriptSegments)
    .map((segment) => segment.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function countTranscriptWords(text) {
  return String(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

function computeHookScore(text) {
  const source = String(text || "").trim().toLowerCase();
  if (!source) return 0;
  const patterns = [
    /왜/,
    /근데/,
    /문제는/,
    /핵심/,
    /결론/,
    /중요/,
    /사실/,
    /바로/,
    /절대/,
    /무조건/,
    /결국/,
    /\?/,
    /\d/,
    /why/,
    /but/,
    /here'?s/,
    /important/,
    /problem/,
    /actually/,
    /never/,
    /always/
  ];
  let score = 0;
  for (const pattern of patterns) {
    if (pattern.test(source)) score += 1;
  }
  if (source.length > 30 && source.length < 140) score += 1;
  return score;
}

function scoreSetupText(text) {
  const source = compactText(text).toLowerCase();
  if (!source) return 0;
  const patterns = [/오늘/, /이거/, /어떻게/, /직접/, /보여/, /먼저/, /처음/, /무엇/, /뭔/];
  return patterns.reduce((sum, pattern) => sum + (pattern.test(source) ? 1 : 0), 0);
}

function scoreBodyText(text) {
  const source = compactText(text).toLowerCase();
  if (!source) return 0;
  const patterns = [/왜/, /그래서/, /때문/, /대표/, /특히/, /중요/, /바로/, /사실/, /즉/, /원래/, /시작/];
  return patterns.reduce((sum, pattern) => sum + (pattern.test(source) ? 1 : 0), 0);
}

function scorePayoffText(text) {
  const source = compactText(text).toLowerCase();
  if (!source) return 0;
  const patterns = [/결국/, /바로/, /그래서/, /이게/, /시작/, /핵심/, /정리/, /발명/, /중요/, /포인트/];
  return patterns.reduce((sum, pattern) => sum + (pattern.test(source) ? 1 : 0), 0);
}

function compactText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[“”"]/g, "")
    .trim();
}

function trimKoreanTitle(text, maxLength = 24) {
  const source = compactText(text);
  if (!source) return "";
  if (source.length <= maxLength) return source;
  return source.slice(0, maxLength).replace(/[,\s]+$/g, "");
}

function normalizeLeadText(text) {
  return compactText(text)
    .replace(/^(근데|그리고|사실|진짜|그러니까|그래서|결국|이제|바로|그게|이게)\s+/u, "")
    .replace(/^(오늘|이번엔)\s+/u, "")
    .trim();
}

function buildClipMeta({ storyboard, hookRange, transcriptPreview, sourceTitle }) {
  const preview = compactText(transcriptPreview);
  const hookText = normalizeLeadText(storyboard?.hook?.text || hookRange?.text || "");
  const payoffText = normalizeLeadText(storyboard?.payoff?.text || "");
  const bodyText = normalizeLeadText(storyboard?.body?.text || "");
  const source = normalizeLeadText(sourceTitle);

  const titleSeed =
    (hookText.includes("?") && hookText) ||
    payoffText ||
    hookText ||
    bodyText ||
    preview ||
    source ||
    "핵심 구간";

  const title = trimKoreanTitle(titleSeed, 28) || "핵심 구간";

  let thumbnailText = "";
  const thumbnailSeed =
    (payoffText && payoffText !== title && trimKoreanTitle(payoffText, 12)) ||
    (hookText && hookText !== title && trimKoreanTitle(hookText.split(/[.?!]/)[0], 12)) ||
    "";

  if (thumbnailSeed && thumbnailSeed !== title) {
    thumbnailText = thumbnailSeed;
  }

  return {
    title,
    thumbnailText
  };
}

function buildTranscriptBlocks(transcriptSegments) {
  const blocks = [];
  let current = null;

  const flush = () => {
    if (!current?.segments?.length) return;
    const text = compactText(current.segments.map((segment) => segment.text).join(" "));
    if (!text) {
      current = null;
      return;
    }
    const duration = current.end - current.start;
    blocks.push({
      index: blocks.length,
      start: round2(current.start),
      end: round2(current.end),
      duration: round2(duration),
      text,
      wordCount: countTranscriptWords(text),
      hookScore: computeHookScore(text),
      setupScore: scoreSetupText(text),
      bodyScore: scoreBodyText(text),
      payoffScore: scorePayoffText(text),
      segments: current.segments
    });
    current = null;
  };

  for (const segment of transcriptSegments) {
    const text = compactText(segment.text);
    if (!text) continue;
    if (!current) {
      current = {
        start: segment.start,
        end: segment.end,
        segments: [segment]
      };
      continue;
    }

    const gap = Math.max(0, segment.start - current.end);
    const currentText = compactText(current.segments.map((item) => item.text).join(" "));
    const currentDuration = current.end - current.start;
    const shouldFlush =
      gap > 0.55 ||
      currentDuration >= 4.8 ||
      /[?!]$/.test(currentText) ||
      /^(근데|그리고|그런데|하지만|결국|그러면|자)\b/u.test(text);

    if (shouldFlush) {
      flush();
      current = {
        start: segment.start,
        end: segment.end,
        segments: [segment]
      };
      continue;
    }

    current.end = segment.end;
    current.segments.push(segment);
  }

  flush();
  return blocks;
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
    if (last && piece.start - last.end <= 0.16 && last.role === piece.role) {
      last.end = round2(Math.max(last.end, piece.end));
      last.duration = round2(last.end - last.start);
      last.text = compactText(`${last.text} ${piece.text}`);
      continue;
    }
    merged.push({ ...piece });
  }
  return merged;
}

function scorePayoffCandidate(block, hookBlock) {
  const distance = Math.max(0, block.start - hookBlock.end);
  const closeness = clamp(1 - distance / 35, 0, 1);
  return block.payoffScore * 4 + block.bodyScore * 1.2 + block.hookScore * 0.8 + closeness * 2;
}

function buildStoryboardText(parts) {
  return compactText(
    parts
      .map((part) => part?.map((item) => item.text).join(" "))
      .filter(Boolean)
      .join(" ")
  );
}

function summarizeStoryboard(storyboard) {
  return {
    hook: storyboard.hook?.map((item) => item.text).join(" ") || "",
    setup: storyboard.setup?.map((item) => item.text).join(" ") || "",
    body: storyboard.body?.map((item) => item.text).join(" ") || "",
    payoff: storyboard.payoff?.map((item) => item.text).join(" ") || ""
  };
}

function buildRecomposedCandidates({ transcriptSegments, minDuration, maxDuration, targetDuration, count, scenes, silences }) {
  const blocks = buildTranscriptBlocks(transcriptSegments);
  if (!blocks.length) return [];

  const hookBlocks = blocks
    .filter((block) => block.hookScore > 0 || /\?/.test(block.text))
    .sort((a, b) => b.hookScore - a.hookScore || a.start - b.start)
    .slice(0, Math.max(count * 8, 18));

  const candidates = [];

  for (const hookBlock of hookBlocks) {
    const hookIndex = hookBlock.index;
    const local = blocks.filter(
      (block) => block.index >= hookIndex && block.start - hookBlock.start <= 55
    );
    if (!local.length) continue;

    const hook = [hookBlock];
    const setup = [];
    const body = [];
    const payoff = [];

    let totalDuration = hookBlock.duration;
    let cursor = 1;

    while (cursor < local.length && setup.length < 2 && totalDuration < Math.min(maxDuration - 8, 9)) {
      const candidate = local[cursor];
      if (candidate.start - hookBlock.start > 12) break;
      setup.push(candidate);
      totalDuration += candidate.duration;
      cursor += 1;
      if (setup.reduce((sum, item) => sum + item.duration, 0) >= 5.5) break;
    }

    const remaining = local.slice(cursor);
    let payoffBlock = null;
    let payoffIndex = -1;
    for (let i = 0; i < remaining.length; i += 1) {
      const candidate = remaining[i];
      if (candidate.start - hookBlock.start > maxDuration) break;
      const score = scorePayoffCandidate(candidate, hookBlock);
      if (!payoffBlock || score > payoffBlock._tmpScore) {
        payoffBlock = { ...candidate, _tmpScore: score };
        payoffIndex = i;
      }
    }

    if (payoffBlock && payoffBlock._tmpScore >= 2.5) {
      const bodyCandidates = remaining.slice(0, payoffIndex);
      for (const candidate of bodyCandidates) {
        const wouldBe = totalDuration + candidate.duration + payoffBlock.duration;
        if (wouldBe > maxDuration) break;
        if (candidate.bodyScore > 0 || candidate.setupScore > 0 || candidate.wordCount >= 3) {
          body.push(candidate);
          totalDuration += candidate.duration;
        }
        if (totalDuration >= targetDuration - 4) break;
      }
      payoff.push(payoffBlock);
      totalDuration += payoffBlock.duration;
      const nextBlock = remaining[payoffIndex + 1];
      if (nextBlock && totalDuration < minDuration && nextBlock.start - hookBlock.start <= maxDuration) {
        payoff.push(nextBlock);
        totalDuration += nextBlock.duration;
      }
    } else {
      for (const candidate of remaining) {
        if (totalDuration + candidate.duration > maxDuration) break;
        if (candidate.bodyScore > 0 || candidate.wordCount >= 3) {
          body.push(candidate);
          totalDuration += candidate.duration;
        }
        if (totalDuration >= targetDuration) break;
      }
    }

    if (totalDuration < minDuration) {
      const already = new Set([...hook, ...setup, ...body, ...payoff].map((block) => block.index));
      for (const candidate of local) {
        if (already.has(candidate.index)) continue;
        if (totalDuration + candidate.duration > maxDuration) break;
        body.push(candidate);
        totalDuration += candidate.duration;
        if (totalDuration >= minDuration) break;
      }
    }

    const rawPieces = [
      ...hook.map((block) => blockToPiece(block, "hook")),
      ...setup.map((block) => blockToPiece(block, "setup")),
      ...body.map((block) => blockToPiece(block, "body")),
      ...payoff.map((block) => blockToPiece(block, "payoff"))
    ];

    const pieces = mergeAdjacentPieces(rawPieces);
    const duration = round2(pieces.reduce((sum, piece) => sum + piece.duration, 0));
    if (duration < minDuration || duration > maxDuration) continue;

    const storyboard = summarizeStoryboard({ hook, setup, body, payoff });
    const sourceStart = Math.min(...pieces.map((piece) => piece.start));
    const sourceEnd = Math.max(...pieces.map((piece) => piece.end));
    const transcriptPreview = buildStoryboardText([hook, setup, body, payoff]).slice(0, 220);
    const durationFit = clamp(1 - Math.abs(duration - targetDuration) / Math.max(targetDuration, 1), 0, 1);
    const payoffPresence = payoff.length ? 1 : 0;
    const hookStrength = Math.min(hookBlock.hookScore / 4, 1);
    const bodyStrength = Math.min(body.reduce((sum, block) => sum + Math.max(block.bodyScore, 1), 0) / 8, 1.3);
    const sceneCount = countScenesWithin(sourceStart, sourceEnd, scenes);
    const silenceTotal = sumSilenceWithin(sourceStart, sourceEnd, silences);
    const score =
      hookStrength * 24 +
      durationFit * 18 +
      Math.min(bodyStrength, 1) * 18 +
      payoffPresence * 18 +
      Math.min(sceneCount / 4, 1) * 8 +
      clamp(1 - silenceTotal / Math.max(sourceEnd - sourceStart, 1), 0, 1) * 8;

    candidates.push({
      strategy: "recompose",
      start: round2(sourceStart),
      end: round2(sourceEnd),
      duration,
      silenceTotal: round2(silenceTotal),
      speechRatio: round2(clamp(1 - silenceTotal / Math.max(sourceEnd - sourceStart, 0.01), 0, 1)),
      sceneCount,
      sceneDensity: round2(clamp(sceneCount / Math.max(duration / 6, 1), 0, 1.4)),
      durationFit: round2(durationFit),
      transcriptWordCount: countTranscriptWords(transcriptPreview),
      transcriptDensity: round2(clamp(countTranscriptWords(transcriptPreview) / Math.max(duration * 2.3, 1), 0, 1.5)),
      hookScore: hookBlock.hookScore,
      transcriptPreview,
      startBoundaryBonus: 0,
      endBoundaryBonus: 0,
      score: round2(score),
      hookFrontLoaded: true,
      hookRange: {
        start: hook[0].start,
        end: hook[hook.length - 1].end,
        text: storyboard.hook,
        hookScore: hookBlock.hookScore
      },
      silenceRemovedSeconds: 0,
      pieces,
      storyboard
    });
  }

  return candidates
    .sort((a, b) => b.score - a.score || a.start - b.start)
    .slice(0, Math.max(count * 6, 24));
}

function normalizeBlockIndexList(indices, blockMap) {
  return [...new Set((indices || []).map((value) => Number(value)).filter((value) => Number.isInteger(value) && blockMap.has(value)))]
    .sort((a, b) => a - b)
    .map((index) => blockMap.get(index));
}

function scoreLlmStoryboardCandidate({ hook, setup, body, payoff, pieces, targetDuration, minDuration, maxDuration, scenes, silences }) {
  const duration = round2(pieces.reduce((sum, piece) => sum + piece.duration, 0));
  if (duration < minDuration || duration > maxDuration) return null;

  const sourceStart = Math.min(...pieces.map((piece) => piece.start));
  const sourceEnd = Math.max(...pieces.map((piece) => piece.end));
  const transcriptPreview = buildStoryboardText([hook, setup, body, payoff]).slice(0, 240);
  const sceneCount = countScenesWithin(sourceStart, sourceEnd, scenes);
  const silenceTotal = sumSilenceWithin(sourceStart, sourceEnd, silences);
  const durationFit = clamp(1 - Math.abs(duration - targetDuration) / Math.max(targetDuration, 1), 0, 1);
  const hookStrength = Math.min(hook.reduce((sum, block) => sum + Math.max(block.hookScore, 1), 0) / 5, 1.5);
  const bodyStrength = Math.min(body.reduce((sum, block) => sum + Math.max(block.bodyScore, 1), 0) / 8, 1.5);
  const payoffStrength = Math.min(payoff.reduce((sum, block) => sum + Math.max(block.payoffScore, 1), 0) / 4, 1.5);
  const speechRatio = round2(clamp(1 - silenceTotal / Math.max(sourceEnd - sourceStart, 0.01), 0, 1));
  const score =
    Math.min(hookStrength, 1) * 24 +
    Math.min(bodyStrength, 1) * 18 +
    Math.min(payoffStrength, 1) * 16 +
    durationFit * 18 +
    speechRatio * 12 +
    Math.min(sceneCount / 4, 1) * 8;

  return {
    start: round2(sourceStart),
    end: round2(sourceEnd),
    duration,
    silenceTotal: round2(silenceTotal),
    speechRatio,
    sceneCount,
    sceneDensity: round2(clamp(sceneCount / Math.max(duration / 6, 1), 0, 1.4)),
    durationFit: round2(durationFit),
    transcriptWordCount: countTranscriptWords(transcriptPreview),
    transcriptDensity: round2(clamp(countTranscriptWords(transcriptPreview) / Math.max(duration * 2.3, 1), 0, 1.5)),
    hookScore: hook.reduce((sum, block) => sum + block.hookScore, 0),
    transcriptPreview,
    startBoundaryBonus: 0,
    endBoundaryBonus: 0,
    score: round2(score),
    hookFrontLoaded: true,
    hookRange: {
      start: hook[0].start,
      end: hook[hook.length - 1].end,
      text: hook.map((block) => block.text).join(" "),
      hookScore: hook.reduce((sum, block) => sum + block.hookScore, 0)
    },
    silenceRemovedSeconds: 0
  };
}

async function buildLlmRecomposedCandidates({ transcriptSegments, minDuration, maxDuration, targetDuration, count, scenes, silences, sourceTitle, llmConfig }) {
  if (!llmConfig?.enabled) return [];
  const blocks = buildTranscriptBlocks(transcriptSegments);
  if (!blocks.length) return [];

  const [systemPrompt, schema, payload] = await Promise.all([
    readText(path.join(ROOT, "prompts/longform-recomposer.md")),
    readJson(path.join(ROOT, "schemas/longform-storyboard-schema.json")),
    Promise.resolve(buildGptStoryboardPacket({
      sourceTitle,
      count,
      minDuration,
      maxDuration,
      targetDuration,
      blocks
    }))
  ]);

  const result = await callStructuredChat({
    model: llmConfig.model,
    baseUrl: llmConfig.baseUrl,
    apiKey: llmConfig.apiKey,
    systemPrompt,
    userPayload: payload,
    schema
  });

  return buildCandidatesFromStoryboardResult({
    result,
    blocks,
    targetDuration,
    minDuration,
    maxDuration,
    scenes,
    silences,
    strategy: "llm-recompose"
  });
}

function buildGptStoryboardPacket({ sourceTitle, count, minDuration, maxDuration, targetDuration, blocks }) {
  const domainGuidance = inferDomainGuidance({ sourceTitle, blocks });
  const referenceStyleProfile = buildReferenceStyleProfile(domainGuidance);
  return {
    source_title: sourceTitle,
    desired_short_count: count,
    duration_rules: {
      min_seconds: minDuration,
      max_seconds: maxDuration,
      target_seconds: targetDuration
    },
    domain_guidance: domainGuidance,
    reference_style_profile: referenceStyleProfile,
    blocks: blocks.map((block) => ({
      index: block.index,
      start: block.start,
      end: block.end,
      duration: block.duration,
      text: block.text,
      hook_score: block.hookScore,
      setup_score: block.setupScore,
      body_score: block.bodyScore,
      payoff_score: block.payoffScore
    }))
  };
}

function buildGptFinalScriptPacket({ sourceTitle, count, minDuration, maxDuration, targetDuration, blocks }) {
  const domainGuidance = inferDomainGuidance({ sourceTitle, blocks });
  const referenceStyleProfile = buildReferenceStyleProfile(domainGuidance);
  const topHooks = [...blocks]
    .sort((a, b) => b.hookScore - a.hookScore || a.start - b.start)
    .slice(0, Math.max(count * 3, 8))
    .map((block) => ({ index: block.index, text: block.text, score: block.hookScore }));
  const topBodies = [...blocks]
    .sort((a, b) => b.bodyScore - a.bodyScore || a.start - b.start)
    .slice(0, Math.max(count * 4, 10))
    .map((block) => ({ index: block.index, text: block.text, score: block.bodyScore }));
  const topPayoffs = [...blocks]
    .sort((a, b) => b.payoffScore - a.payoffScore || a.start - b.start)
    .slice(0, Math.max(count * 3, 8))
    .map((block) => ({ index: block.index, text: block.text, score: block.payoffScore }));

  return {
    source_title: sourceTitle,
    desired_short_count: count,
    duration_rules: {
      min_seconds: minDuration,
      max_seconds: maxDuration,
      target_seconds: targetDuration
    },
    output_rules: {
      language: "ko",
      reuse_source_media: false,
      render_with: "stock_or_motion_graphics",
      narration: "new_korean_tts",
      style: "shorts_explainer"
    },
    domain_guidance: domainGuidance,
    reference_style_profile: referenceStyleProfile,
    block_summary: {
      total_blocks: blocks.length,
      top_hooks: topHooks,
      top_bodies: topBodies,
      top_payoffs: topPayoffs
    },
    blocks: blocks.map((block) => ({
      index: block.index,
      start: block.start,
      end: block.end,
      duration: block.duration,
      text: block.text,
      hook_score: block.hookScore,
      setup_score: block.setupScore,
      body_score: block.bodyScore,
      payoff_score: block.payoffScore
    }))
  };
}

function buildGptHybridScriptPacket({ sourceTitle, count, minDuration, maxDuration, targetDuration, blocks }) {
  const domainGuidance = inferDomainGuidance({ sourceTitle, blocks });
  const referenceStyleProfile = buildReferenceStyleProfile(domainGuidance);
  return {
    source_title: sourceTitle,
    desired_short_count: count,
    duration_rules: {
      min_seconds: minDuration,
      max_seconds: maxDuration,
      target_seconds: targetDuration
    },
    output_rules: {
      language: "ko",
      reuse_source_media: true,
      source_audio: "mute_or_replace",
      narration: "new_korean_tts",
      subtitle_style: "new_korean_overlay",
      per_beat_fallback_visual_prompt_required: true
    },
    domain_guidance: domainGuidance,
    reference_style_profile: referenceStyleProfile,
    blocks: blocks.map((block) => ({
      index: block.index,
      start: block.start,
      end: block.end,
      duration: block.duration,
      text: block.text,
      hook_score: block.hookScore,
      setup_score: block.setupScore,
      body_score: block.bodyScore,
      payoff_score: block.payoffScore
    }))
  };
}

function inferDomainGuidance({ sourceTitle, blocks }) {
  const joined = [
    sourceTitle,
    ...(blocks || []).map((block) => block.text)
  ].filter(Boolean).join(" ").toLowerCase();

  const isMedical = /(insomnia|sleep|circadian|stress|cortisol|anxiety|brain|disorder|symptom|diagnosis|medical|health|kidney|renal|urine|urinary|nephron|glomerulus|glomerular|filtration|reabsorption|bowman|tubule|불면|수면|잠|스트레스|불안|뇌|증상|진단|질환|의학|신장|콩팥|소변|오줌|사구체|네프론|여과|재흡수|세뇨관)/i.test(joined);
  if (!isMedical) {
    return {
      domain: "general_information",
      hook_formula: "[A]을 들은 뒤 심장이 덜컥 내려앉습니다",
      content_checklist: [
        "핵심 주장 한 줄",
        "왜 그런지 설명",
        "시청자에게 남기는 결론"
      ]
    };
  }

  return {
    domain: "medical_health",
    hook_formula: "아니 의사양반 내가 [병명/증상명]이라고?",
    hook_rule: "`[병명/증상명]`은 본문에서 실제로 다루는 진단명, 통증명, 증상명, 상태명이어야 하며, 원문 근거 밖의 공포 조장은 금지",
    content_checklist: [
      "원인 또는 유발 요인",
      "몸/뇌에서 벌어지는 메커니즘",
      "흔한 오해 또는 증상 구분",
      "대응 원칙 또는 상담 필요 시점"
    ],
    medical_writing_rules: [
      "막연한 웰니스 문장으로 흐리지 말 것",
      "원문에 나온 의학 개념이 있으면 쉬운 말로 풀되 삭제하지 말 것",
      "진단처럼 들리게 단정하지 말 것",
      "해법은 생활 팁만 나열하지 말고 메커니즘과 연결할 것"
    ]
  };
}

function buildReferenceStyleProfile(domainGuidance = null) {
  const hookFormula = domainGuidance?.hook_formula || "[A]을 들은 뒤 심장이 덜컥 내려앉습니다";
  const hookFormulaNote = domainGuidance?.domain === "medical_health"
    ? "`[병명/증상명]`은 본문에서 실제로 다루는 상태명을 짧게 박는 용도다. 진단을 새로 만들지 말고, 원문에 있는 표현만 압축해 써라"
    : "`A`는 본문 핵심을 압축한 짧은 경고/공포 요약이며, 길어지면 같은 구조의 짧은 변형을 허용한다";
  return {
    profile_name: "aggressive_ko_shorts_reference",
    intent: "레퍼런스 쇼츠처럼 첫 훅은 자극적이고, 이후 문장은 짧고 빠르게 핵심만 전달하는 구조",
    hard_rules: {
      no_meta_openers: true,
      no_explainer_host_tone: true,
      first_line_must_hook: true,
      body_must_advance_information: true,
      target_sentence_chars: "10-24",
      absolute_sentence_char_limit: 32,
      preferred_sentences_per_beat: "1-2",
      one_idea_per_sentence: true
    },
    hook_formula: hookFormula,
    hook_formula_note: hookFormulaNote,
    pacing: {
      preferred_beat_count: "5-7",
      preferred_beat_seconds: "4-8",
      first_two_seconds_role: "cold_open_warning_or_shock"
    },
    language_shape: {
      preferred_openers: [
        "상황 단정",
        "위기 경고",
        "불편한 진실",
        "반전 사실"
      ],
      avoid_openers: [
        "원문은",
        "이 영상은",
        "여기서 말하는 건",
        "오늘은",
        "이번엔",
        "사실"
      ],
      tone: "트위터 헤드라인처럼 짧고 공격적이되, 거짓 과장은 금지"
    },
    structure: {
      hook: "짧고 공격적으로 문제를 박는다",
      body: "원인, 메커니즘, 결과, 해법 중 최소 하나씩 전진시킨다",
      payoff: "정리 한 줄 또는 행동 지침으로 닫는다"
    },
    knowledge_density: {
      body_should_feel_informative_not_empty: true,
      if_medical_topic_include_real_mechanism: true,
      domain_guidance: domainGuidance
    },
    payoff_rule: {
      should_offer_easy_action_for_general_viewer: true,
      examples: [
        "오늘부터 확인할 한 가지",
        "이 증상이면 기록하고 상담",
        "지금 멈출 것 한 가지"
      ]
    },
    subtitle_heuristics: {
      each_sentence_should_survive_as_single_caption_line: true,
      punchline_style_on_screen_text: true
    },
    visual_heuristics: {
      top_header: "고정 진행 문구 가능",
      center_punchline: "핵심 단어는 정중앙 펀치라인",
      style_reference: "짧은 문장 + 빠른 컷 + 강한 강조 자막"
    }
  };
}

async function writeGptStoryboardBundle({ runDir, packet, schema }) {
  const prompt = `# GPT Storyboard Task

이 폴더의 \`gpt-storyboard-packet.json\`을 업로드해서 GPT에게 보내세요.

요청 문구:

\`\`\`
첨부한 packet.json의 blocks만 사용해서 한국어 쇼츠 4개를 설계해줘.
반드시 hook/setup/body/payoff 구조로 재구성하고,
응답은 첨부한 schema.json에 맞는 JSON만 출력해.
없는 사실은 만들지 말고, block index만 써서 선택해.
\`\`\`

반환받은 JSON은 \`gpt-storyboard-response.json\`으로 저장한 뒤 아래처럼 렌더하세요.

\`\`\`bash
node split-longform-into-shorts.mjs --video "/path/to/video.mp4" --storyboard-json "/path/to/gpt-storyboard-response.json"
\`\`\`
`;

  await writeJson(path.join(runDir, "gpt-storyboard-packet.json"), packet);
  await writeJson(path.join(runDir, "gpt-storyboard-schema.json"), schema);
  await fs.writeFile(path.join(runDir, "gpt-storyboard-prompt.md"), prompt);
}

async function writeGptFinalScriptBundle({ runDir, packet, schema }) {
  const prompt = `# GPT Final Script Task

이 폴더의 \`gpt-final-script-packet.json\`을 업로드해서 GPT에게 보내세요.

요청 문구:

\`\`\`
첨부한 packet.json의 blocks만 근거로 한국어 쇼츠용 최종 스크립트를 만들어줘.
원본 롱폼의 영상/음성은 재사용하지 않고, 새로운 한국어 TTS와 무료 스톡/B-roll/모션그래픽으로 렌더할 예정이다.
그러니 응답은 첨부한 schema.json 형식의 final script JSON만 출력해.
packet 안의 reference_style_profile을 취향 정보가 아니라 강한 제약으로 따라라.
packet 안의 domain_guidance가 있으면 그것도 강한 제약으로 따라라.
없는 사실은 만들지 말고, selected blocks의 말 흐름을 살린 채 한국어로 압축 번안해줘.
중요: 새로 똑똑하게 설명하려고 하지 말고, 원문 발표자가 실제로 말한 논리 순서와 감정을 최대한 유지해.
중요: 보고서체, 교양 해설문, AI 요약문처럼 쓰지 말고, 원문을 듣고 바로 한국어로 다시 말해주는 느낌으로 써.
중요: \`원문은\`, \`이 영상은\`, \`이 발표는\`, \`여기서 말하는 건\` 같은 메타 해설 표현을 쓰지 마.
중요: 첫 문장부터 바로 문제, 위기, 반전 중 하나로 들어가. 소개 멘트로 시작하지 마.
중요: 의료/건강 주제면 첫 훅은 가능하면 \`아니 의사양반 내가 [병명/증상명]이라고?\` 구조를 기본 골격으로 삼아라. 여기서 \`[병명/증상명]\`은 본문에서 실제로 다루는 상태명이어야 한다.
중요: 의료/건강이 아닌 주제에서만 \`[A]을 들은 뒤 심장이 덜컥 내려앉습니다\` 구조를 보조적으로 허용한다.
중요: 문장은 되도록 10~24자, 길어도 32자 안쪽으로 끊어라.
중요: 쉼표로 길게 끌지 말고, 자막 한 줄로 바로 박힐 문장 둘로 쪼개라.
중요: 첫 훅은 순한 소개가 아니라, 트위터 헤드라인처럼 약간 공격적으로 꽂혀야 한다. 다만 원문 밖의 거짓 자극은 금지한다.
중요: 원문 블록 안에 이미 질문, 반전, 강조가 있으면 그 힘을 그대로 한국어 첫 문장에 옮겨.
중요: health/medical 주제면 뒤 비트에 실제 의학 설명이 녹아 있어야 한다. 막연한 자기계발 문장으로 흐리지 마라.
한국어 쇼츠 문법으로 다듬되, 선택한 block들의 의미 순서가 결과 대본에도 눈에 보이게 남아 있어야 한다.
script_beats의 visual_direction은 원본 영상 재사용이 아니라 stock/B-roll/diagram/motion graphic 기준으로 써.
\`\`\`

반환받은 JSON은 \`gpt-final-script-response.json\`으로 저장한 뒤 아래처럼 렌더하세요.

\`\`\`bash
node generate-shorts.mjs --final-script-json "/path/to/gpt-final-script-response.json"
\`\`\`
`;

  await writeJson(path.join(runDir, "gpt-final-script-packet.json"), packet);
  await writeJson(path.join(runDir, "gpt-final-script-schema.json"), schema);
  await fs.writeFile(path.join(runDir, "gpt-final-script-prompt.md"), prompt);
}

async function writeGptHybridScriptBundle({ runDir, packet, schema }) {
  const prompt = `# GPT Hybrid Script Task

이 폴더의 \`gpt-hybrid-script-packet.json\`을 업로드해서 GPT에게 보내세요.

요청 문구:

\`\`\`
첨부한 packet.json의 blocks만 근거로, 원본 롱폼의 영상 화면은 최대한 그대로 재사용하고
한국어 내레이션과 자막은 새로 만드는 하이브리드 쇼츠 JSON을 만들어줘.
반드시 첨부한 schema.json 형식만 출력해.
packet 안의 reference_style_profile을 강한 제약으로 따라라.
packet 안의 domain_guidance가 있으면 그것도 강한 제약으로 따라라.
없는 사실은 만들지 말고, hook/setup/body/payoff에 쓸 block index를 명시해.
script_beats는 selected blocks를 바탕으로 압축 번안해. 새 설명문을 만들지 말고, 원문 발표자의 말 흐름과 강조를 최대한 유지한 채 한국어 구어체로 옮겨.
중요: 원문이 이미 자연스럽게 말하는 구간이면, 그 문장 순서를 최대한 유지하고 군더더기만 줄여라.
중요: 한국어가 자연해야 하지만, 너무 새로 쓰면 안 된다. 결과를 다시 영어로 옮겼을 때 원문 블록의 순서와 주장 흐름이 남아 있어야 한다.
script_beats의 첫 문장은 원문 훅의 힘을 가져와야 한다. AI 요약문처럼 평평하게 쓰지 마라.
중요: \`원문은\`, \`이 영상은\`, \`이 발표는\`, \`여기서 말하는 건\` 같은 메타 설명을 대본 안에 넣지 마라.
중요: 첫 문장부터 시청자 귀에 꽂히게 써라. 소개 멘트, 해설 멘트, 진행 멘트로 시작하지 마라.
중요: 의료/건강 주제면 첫 훅은 가능하면 \`아니 의사양반 내가 [병명/증상명]이라고?\` 구조를 기본 골격으로 삼아라. 여기서 \`[병명/증상명]\`은 본문에서 실제로 다루는 상태명이어야 한다.
중요: 의료/건강이 아닌 주제에서만 \`[A]을 들은 뒤 심장이 덜컥 내려앉습니다\` 구조를 보조적으로 허용한다.
중요: 문장은 되도록 10~24자, 길어도 32자 안쪽으로 끊어라.
중요: 각 beat의 첫 문장은 자막 한 줄로 버틸 만큼 짧고 세게 써라.
중요: 훅 이후 본문은 비어 있으면 안 된다. 각 beat는 원인, 메커니즘, 결과, 해법 중 최소 하나를 실제로 전달해야 한다.
중요: health/medical 주제면 뒤 비트에서 실제 의학 지식이 녹아 있는지 스스로 점검해라. 원인, 메커니즘, 오해 구분, 대응 원칙 중 최소 둘은 살아 있어야 한다.
각 beat마다 만약 원본 화면을 쓰기 곤란할 때 대체할 fallback_visual_prompt를 반드시 써.
fallback_visual_prompt는 영상 생성 모델이나 스톡 검색 프롬프트로 바로 쓸 수 있게 구체적으로 써.
\`\`\`

반환받은 JSON은 \`gpt-hybrid-script-response.json\`으로 저장한 뒤 아래처럼 렌더하세요.

\`\`\`bash
node render-hybrid-source-shorts.mjs \\
  --video "/path/to/video.mp4" \\
  --packet-json "/path/to/gpt-hybrid-script-packet.json" \\
  --hybrid-script-json "/path/to/gpt-hybrid-script-response.json"
\`\`\`
`;

  await writeJson(path.join(runDir, "gpt-hybrid-script-packet.json"), packet);
  await writeJson(path.join(runDir, "gpt-hybrid-script-schema.json"), schema);
  await fs.writeFile(path.join(runDir, "gpt-hybrid-script-prompt.md"), prompt);
}

function buildCandidatesFromStoryboardResult({ result, blocks, targetDuration, minDuration, maxDuration, scenes, silences, strategy }) {
  const blockMap = new Map(blocks.map((block) => [block.index, block]));
  const candidates = [];

  for (const storyboardPlan of result.shorts || []) {
    const hook = normalizeBlockIndexList(storyboardPlan.hook_indices, blockMap);
    const setup = normalizeBlockIndexList(storyboardPlan.setup_indices, blockMap);
    const body = normalizeBlockIndexList(storyboardPlan.body_indices, blockMap);
    const payoff = normalizeBlockIndexList(storyboardPlan.payoff_indices, blockMap);

    if (!hook.length || !setup.length || !body.length || !payoff.length) continue;

    const rawPieces = [
      ...hook.map((block) => blockToPiece(block, "hook")),
      ...setup.map((block) => blockToPiece(block, "setup")),
      ...body.map((block) => blockToPiece(block, "body")),
      ...payoff.map((block) => blockToPiece(block, "payoff"))
    ];
    const pieces = mergeAdjacentPieces(rawPieces);
    const metrics = scoreLlmStoryboardCandidate({
      hook,
      setup,
      body,
      payoff,
      pieces,
      targetDuration,
      minDuration,
      maxDuration,
      scenes,
      silences
    });
    if (!metrics) continue;

    candidates.push({
      strategy,
      ...metrics,
      pieces,
      storyboard: summarizeStoryboard({ hook, setup, body, payoff }),
      title: trimKoreanTitle(storyboardPlan.title, 28) || undefined,
      thumbnailText: trimKoreanTitle(storyboardPlan.thumbnail_text, 12) || "",
      coreAngle: compactText(storyboardPlan.core_angle || "")
    });
  }

  return candidates.sort((a, b) => b.score - a.score || a.start - b.start);
}

function resolveTemplate(name) {
  return TEMPLATE_PRESETS[String(name || "minimal").trim().toLowerCase()] || TEMPLATE_PRESETS.minimal;
}

function subtractCutRanges(baseStart, baseEnd, cutRanges) {
  const normalized = cutRanges
    .map((range) => ({
      start: clamp(range.start, baseStart, baseEnd),
      end: clamp(range.end, baseStart, baseEnd)
    }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);

  const pieces = [];
  let cursor = baseStart;
  for (const range of normalized) {
    if (range.start > cursor) {
      pieces.push({ start: cursor, end: range.start });
    }
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < baseEnd) {
    pieces.push({ start: cursor, end: baseEnd });
  }
  return pieces.filter((piece) => piece.end - piece.start > 0.2);
}

function splitPieceByBoundaries(piece, boundaries) {
  const local = boundaries
    .filter((value) => value > piece.start && value < piece.end)
    .sort((a, b) => a - b);
  if (!local.length) return [piece];
  const points = [piece.start, ...local, piece.end];
  const segments = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    if (end - start > 0.2) {
      segments.push({ start, end });
    }
  }
  return segments;
}

function chooseHookRange(start, end, transcriptSegments) {
  const overlapping = transcriptSegmentsWithin(start, end, transcriptSegments)
    .map((segment) => {
      const clippedStart = Math.max(start, segment.start);
      const clippedEnd = Math.min(end, segment.end);
      return {
        ...segment,
        clippedStart,
        clippedEnd,
        hookScore: computeHookScore(segment.text)
      };
    })
    .filter((segment) => segment.clippedEnd > segment.clippedStart);

  if (!overlapping.length) return null;
  const best = overlapping
    .sort((a, b) => b.hookScore - a.hookScore || (b.clippedEnd - b.clippedStart) - (a.clippedEnd - a.clippedStart))[0];
  if (best.hookScore < 1) return null;
  return {
    start: round2(Math.max(start, best.clippedStart - 0.15)),
    end: round2(Math.min(end, best.clippedEnd + 0.2)),
    text: best.text,
    hookScore: best.hookScore
  };
}

function buildPiecePlan({ start, end, silences, transcriptSegments }) {
  const silenceCuts = silences
    .filter((silence) => silence.duration >= 0.28 && silence.end > start && silence.start < end)
    .map((silence) => ({
      start: Math.max(start, silence.start),
      end: Math.min(end, silence.end)
    }));
  const hookRange = chooseHookRange(start, end, transcriptSegments);
  let pieces = subtractCutRanges(start, end, silenceCuts);
  if (!pieces.length) {
    pieces = [{ start, end }];
  }

  if (hookRange) {
    pieces = pieces.flatMap((piece) => splitPieceByBoundaries(piece, [hookRange.start, hookRange.end]));
    const hookCovered = pieces.some((piece) => overlapDuration(piece.start, piece.end, hookRange.start, hookRange.end) > 0.15);
    if (!hookCovered) {
      pieces.push({ start: hookRange.start, end: hookRange.end });
      pieces = pieces.sort((a, b) => a.start - b.start);
    }
  }

  let hookFrontLoaded = false;
  if (hookRange && hookRange.start - start > 0.8) {
    const hookPieces = [];
    const otherPieces = [];
    for (const piece of pieces) {
      const overlap = overlapDuration(piece.start, piece.end, hookRange.start, hookRange.end);
      if (overlap > 0.15) {
        hookPieces.push(piece);
      } else {
        otherPieces.push(piece);
      }
    }
    if (hookPieces.length) {
      pieces = [...hookPieces, ...otherPieces];
      hookFrontLoaded = true;
    }
  }

  return {
    hookRange,
    hookFrontLoaded,
    silenceRemovedSeconds: round2(silenceCuts.reduce((sum, item) => sum + (item.end - item.start), 0)),
    pieces: pieces
      .filter((piece) => piece.end - piece.start > 0.25)
      .map((piece, index) => ({
        index,
        start: round2(piece.start),
        end: round2(piece.end),
        duration: round2(piece.end - piece.start)
      }))
  };
}

function scoreSegment({ start, end, targetDuration, scenes, silences, transcriptSegments }) {
  const duration = end - start;
  const silenceTotal = sumSilenceWithin(start, end, silences);
  const speechRatio = clamp(1 - silenceTotal / Math.max(duration, 0.01), 0, 1);
  const sceneCount = countScenesWithin(start, end, scenes);
  const sceneDensity = clamp(sceneCount / Math.max(duration / 6, 1), 0, 1.4);
  const durationFit = clamp(1 - Math.abs(duration - targetDuration) / Math.max(targetDuration, 1), 0, 1);
  const startBoundaryBonus = nearestDistance(start, [...scenes, ...silences.map((item) => item.end)]) <= 1.4 ? 1 : 0;
  const endBoundaryBonus = nearestDistance(end, [...scenes, ...silences.map((item) => item.start)]) <= 1.4 ? 1 : 0;
  const transcriptText = transcriptTextWithin(start, end, transcriptSegments);
  const transcriptWordCount = countTranscriptWords(transcriptText);
  const transcriptDensity = clamp(transcriptWordCount / Math.max(duration * 2.3, 1), 0, 1.5);
  const hookScore = computeHookScore(transcriptText);
  const score =
    durationFit * 28 +
    speechRatio * 20 +
    Math.min(sceneDensity, 1) * 14 +
    Math.min(transcriptDensity, 1) * 18 +
    Math.min(hookScore / 5, 1) * 12 +
    startBoundaryBonus * 4 +
    endBoundaryBonus * 4;

  return {
    duration: round2(duration),
    silenceTotal: round2(silenceTotal),
    speechRatio: round2(speechRatio),
    sceneCount,
    sceneDensity: round2(sceneDensity),
    durationFit: round2(durationFit),
    transcriptWordCount,
    transcriptDensity: round2(transcriptDensity),
    hookScore,
    transcriptPreview: transcriptText.slice(0, 180),
    startBoundaryBonus,
    endBoundaryBonus,
    score: round2(score)
  };
}

function buildCandidateSegments({ duration, cutPoints, scenes, silences, transcriptSegments, minDuration, maxDuration, targetDuration }) {
  const candidates = [];
  for (let i = 0; i < cutPoints.length - 1; i += 1) {
    const start = cutPoints[i];
    for (let j = i + 1; j < cutPoints.length; j += 1) {
      const end = cutPoints[j];
      const segmentDuration = end - start;
      if (segmentDuration < minDuration) continue;
      if (segmentDuration > maxDuration) break;
      const metrics = scoreSegment({ start, end, targetDuration, scenes, silences, transcriptSegments });
      candidates.push({
        start: round2(start),
        end: round2(end),
        ...metrics
      });
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score || a.start - b.start)
    .slice(0, 600);
}

function buildFallbackSegments({ duration, minDuration, maxDuration, targetDuration, count }) {
  if (duration <= 0) return [];
  const fallbackLength = clamp(duration <= maxDuration ? duration : targetDuration, minDuration, maxDuration);
  if (duration <= maxDuration) {
    return [
      {
        start: 0,
        end: round2(duration),
        duration: round2(duration),
        silenceTotal: 0,
        speechRatio: 1,
        sceneCount: 0,
        sceneDensity: 0,
        durationFit: round2(clamp(1 - Math.abs(duration - targetDuration) / Math.max(targetDuration, 1), 0, 1)),
        transcriptWordCount: 0,
        transcriptDensity: 0,
        hookScore: 0,
        transcriptPreview: "",
        startBoundaryBonus: 1,
        endBoundaryBonus: 1,
        score: 45
      }
    ];
  }

  const segments = [];
  const step = Math.max(fallbackLength, minDuration);
  for (let start = 0; start < duration && segments.length < count * 3; start += step) {
    const end = clamp(start + fallbackLength, 0, duration);
    if (end - start < minDuration) continue;
    segments.push({
      start: round2(start),
      end: round2(end),
      duration: round2(end - start),
      silenceTotal: 0,
      speechRatio: 1,
      sceneCount: 0,
      sceneDensity: 0,
      durationFit: round2(clamp(1 - Math.abs(end - start - targetDuration) / Math.max(targetDuration, 1), 0, 1)),
      transcriptWordCount: 0,
      transcriptDensity: 0,
      hookScore: 0,
      transcriptPreview: "",
      startBoundaryBonus: 0,
      endBoundaryBonus: 0,
      score: 35
    });
    if (end >= duration) break;
  }
  return segments;
}

function selectTopSegments(candidates, count) {
  const selected = [];
  for (const candidate of candidates) {
    const overlaps = selected.some((existing) => {
      const candidateStart = candidate.start ?? Math.min(...(candidate.pieces || []).map((piece) => piece.start));
      const candidateEnd = candidate.end ?? Math.max(...(candidate.pieces || []).map((piece) => piece.end));
      const existingStart = existing.start ?? Math.min(...(existing.pieces || []).map((piece) => piece.start));
      const existingEnd = existing.end ?? Math.max(...(existing.pieces || []).map((piece) => piece.end));
      const overlap = overlapDuration(candidateStart, candidateEnd, existingStart, existingEnd);
      return overlap > 4.0;
    });
    if (overlaps) continue;
    selected.push(candidate);
    if (selected.length >= count) break;
  }
  return selected.sort((a, b) => a.start - b.start);
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
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.join("\\N");
}

function buildClipAss({ pieces, transcriptSegments, templateName, titleText, thumbnailText }) {
  const template = resolveTemplate(templateName);
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Header,Noto Sans CJK KR,44,${template.headerPrimary},&H000000FF,&H00101010,${template.headerBack},1,0,0,0,100,100,0,0,1,2,0,8,70,70,108,1
Style: Thumb,Noto Sans CJK KR,82,${template.headerPrimary},&H000000FF,&H00101010,${template.headerBack},1,0,0,0,100,100,0,0,1,3,0,2,70,70,1490,1
Style: Body,Noto Sans CJK KR,${template.bodyFontSize},${template.primary},&H000000FF,${template.outline},${template.back},1,0,0,0,100,100,0,0,1,3,0,2,90,90,210,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const lines = [];
  const totalDuration = pieces.reduce((sum, piece) => sum + piece.duration, 0);
  const distinctThumb = thumbnailText && thumbnailText !== titleText ? thumbnailText : "";

  if (titleText) {
    lines.push(`Dialogue: 0,${assTime(0)},${assTime(Math.min(totalDuration, 1.8))},Header,,0,0,0,,${escapeAss(titleText)}`);
  }
  if (distinctThumb) {
    lines.push(`Dialogue: 0,${assTime(0.15)},${assTime(Math.min(totalDuration, 2.4))},Thumb,,0,0,0,,${escapeAss(wrapSubtitle(distinctThumb, 10))}`);
  }

  let timelineOffset = 0;
  for (const piece of pieces) {
    const overlapping = transcriptSegmentsWithin(piece.start, piece.end, transcriptSegments);
    for (const segment of overlapping) {
      const clippedStart = Math.max(piece.start, segment.start);
      const clippedEnd = Math.min(piece.end, segment.end);
      if (clippedEnd <= clippedStart) continue;
      const relStart = timelineOffset + (clippedStart - piece.start);
      const relEnd = timelineOffset + (clippedEnd - piece.start);
      lines.push(`Dialogue: 0,${assTime(relStart)},${assTime(relEnd)},Body,,0,0,0,,${escapeAss(wrapSubtitle(segment.text, 18))}`);
    }
    timelineOffset += piece.duration;
  }

  return `${header}\n${lines.join("\n")}\n`;
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
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    outputPath
  );

  await execFileAsync("ffmpeg", args);
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
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    outputPath
  ]);
}

async function burnSubtitles({ inputPath, subtitlePath, outputPath }) {
  await execFileAsync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    inputPath,
    "-vf",
    `subtitles='${escapeLavfiPath(subtitlePath)}'`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "copy",
    outputPath
  ]);
}

async function renderShortClip({ inputPath, outputPath, subtitlePath, pieces, width, height }) {
  const tempDir = `${outputPath}.parts`;
  await ensureDir(tempDir);
  const segmentPaths = [];
  const assembledPath = `${outputPath}.assembled.mp4`;
  const concatListPath = `${assembledPath}.txt`;
  try {
    for (let i = 0; i < pieces.length; i += 1) {
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
      segmentPaths.push(piecePath);
    }
    await concatRenderedPieces({ segmentPaths, outputPath: assembledPath });
    await burnSubtitles({ inputPath: assembledPath, subtitlePath, outputPath });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(assembledPath, { force: true }).catch(() => {});
    await fs.rm(concatListPath, { force: true }).catch(() => {});
  }
}

function formatTimestamp(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function toMarkdown({ inputPath, videoInfo, scenes, silences, selected }) {
  const rows = selected
    .map(
      (item, index) =>
        `## Short ${String(index + 1).padStart(2, "0")}\n- 전략: ${item.strategy || "clip"}\n- 원본 범위: ${formatTimestamp(item.start)} ~ ${formatTimestamp(item.end)}\n- 최종 길이: ${item.duration}초\n- 제목: ${item.title || "-"}\n- 썸네일 문구: ${item.thumbnailText || "-"}\n- 점수: ${item.score}\n- 대사 비중: ${Math.round(item.speechRatio * 100)}%\n- 씬 변화 수: ${item.sceneCount}\n- 훅 점수: ${item.hookScore}\n- 훅 앞당김: ${item.hookFrontLoaded ? "yes" : "no"}\n- 제거한 무음: ${item.silenceRemovedSeconds || 0}초\n- 조각 수: ${item.pieces?.length || 0}\n- 훅: ${item.storyboard?.hook || "-"}\n- 설정: ${item.storyboard?.setup || "-"}\n- 핵심: ${item.storyboard?.body || "-"}\n- 결론: ${item.storyboard?.payoff || "-"}\n- 미리보기: ${item.transcriptPreview || "-"}\n- 파일: \`${path.basename(item.outputPath || "")}\``
    )
    .join("\n\n");

  return `# Longform Split Report

- 입력 영상: \`${inputPath}\`
- 길이: ${round2(videoInfo.duration)}초
- 해상도: ${videoInfo.width}x${videoInfo.height}
- 감지된 씬 컷: ${scenes.length}개
- 감지된 침묵 구간: ${silences.length}개
- 선택된 쇼츠: ${selected.length}개

${rows}
`;
}

async function main() {
  await loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  if (!args.video && !args.youtube) {
    throw new Error("`--video /path/to/video.mp4` 또는 `--youtube <url>` 가 필요합니다.");
  }

  const count = Number(args.count || 4);
  const minDuration = Number(args["min-duration"] || 24);
  const maxDuration = Number(args["max-duration"] || 42);
  const targetDuration = Number(args["target-duration"] || 32);
  const sceneThreshold = Number(args["scene-threshold"] || 0.27);
  const silenceNoise = Number(args["silence-noise"] || -35);
  const silenceMin = Number(args["silence-min"] || 0.45);
  const asrModel = args["asr-model"] || process.env.SHORTS_ASR_MODEL || "small";
  const templateName = args.template || "minimal";
  const strategy = args.strategy || "auto";
  const llmConfig = resolveLlmConfig(args);
  const storyboardJsonPath = args["storyboard-json"] ? path.resolve(args["storyboard-json"]) : "";

  const sourceName = args.video ? path.parse(path.resolve(args.video)).name : args.youtube;
  const runDir = path.join(RUNS_DIR, `${nowStamp()}-split-${slugify(sourceName)}`);
  const shortsDir = path.join(runDir, "shorts");
  const sourceDir = path.join(runDir, "source");
  await ensureDir(shortsDir);
  await ensureDir(sourceDir);

  let inputPath = "";
  let source = { type: "local" };

  if (args.youtube) {
    if (!isYouTubeUrl(args.youtube)) {
      throw new Error(`유효한 YouTube URL이 아닙니다: ${args.youtube}`);
    }
    const downloaded = await downloadYouTubeVideo({
      url: args.youtube,
      downloadDir: sourceDir
    });
    inputPath = downloaded.videoPath;
    source = {
      type: "youtube",
      url: args.youtube,
      ...downloaded.metadata
    };
  } else {
    inputPath = path.resolve(args.video);
    if (!(await pathExists(inputPath))) {
      throw new Error(`입력 영상을 찾지 못했습니다: ${inputPath}`);
    }
    source = {
      type: "local",
      path: inputPath
    };
  }

  const videoInfo = await probeVideo(inputPath);
  const transcript = await transcribeMedia({
    inputPath,
    runDir,
    modelName: asrModel
  });
  const transcriptSegments = Array.isArray(transcript.segments) ? transcript.segments : [];
  const transcriptBlocks = buildTranscriptBlocks(transcriptSegments);
  const scenes = await detectSceneChanges(inputPath, sceneThreshold);
  const silences = await detectSilences(inputPath, silenceNoise, silenceMin);
  const transcriptPoints = transcriptSegments.flatMap((segment) => [segment.start, segment.end]);
  const cutPoints = buildCutPoints(videoInfo.duration, [...scenes, ...transcriptPoints], silences);
  const storyboardSchema = await readJson(path.join(ROOT, "schemas/longform-storyboard-schema.json"));
  const finalScriptSchema = await readJson(path.join(ROOT, "schemas/script-schema.json"));
  const hybridScriptSchema = await readJson(path.join(ROOT, "schemas/hybrid-short-script-schema.json"));
  const storyboardPacket = buildGptStoryboardPacket({
    sourceTitle: source.title || path.parse(inputPath).name,
    count,
    minDuration,
    maxDuration,
    targetDuration,
    blocks: transcriptBlocks
  });
  const finalScriptPacket = buildGptFinalScriptPacket({
    sourceTitle: source.title || path.parse(inputPath).name,
    count,
    minDuration,
    maxDuration,
    targetDuration,
    blocks: transcriptBlocks
  });
  const hybridScriptPacket = buildGptHybridScriptPacket({
    sourceTitle: source.title || path.parse(inputPath).name,
    count,
    minDuration,
    maxDuration,
    targetDuration,
    blocks: transcriptBlocks
  });
  await writeGptStoryboardBundle({
    runDir,
    packet: storyboardPacket,
    schema: storyboardSchema
  });
  await writeGptFinalScriptBundle({
    runDir,
    packet: finalScriptPacket,
    schema: finalScriptSchema
  });
  await writeGptHybridScriptBundle({
    runDir,
    packet: hybridScriptPacket,
    schema: hybridScriptSchema
  });

  if (strategy === "external-gpt" && !storyboardJsonPath) {
    await writeJson(path.join(runDir, "input.json"), {
      source,
      video: inputPath,
      strategy,
      count,
      minDuration,
      maxDuration,
      targetDuration,
      asrModel,
      templateName,
      exportedGptBundle: true
    });
    await writeJson(path.join(runDir, "video-info.json"), videoInfo);
    await writeJson(path.join(runDir, "source.json"), source);
    await writeJson(path.join(runDir, "transcript.json"), transcript);
    await writeJson(path.join(runDir, "transcript-blocks.json"), transcriptBlocks);
    await writeJson(path.join(runDir, "scenes.json"), scenes);
    await writeJson(path.join(runDir, "silences.json"), silences);
    await writeJson(path.join(runDir, "cut-points.json"), cutPoints);
    console.log(`완료: ${runDir}`);
    console.log(`- source: ${source.type}`);
    console.log(`- exported: gpt storyboard bundle`);
    console.log(`- storyboard packet: ${path.join(runDir, "gpt-storyboard-packet.json")}`);
    console.log(`- final-script packet: ${path.join(runDir, "gpt-final-script-packet.json")}`);
    console.log(`- hybrid-script packet: ${path.join(runDir, "gpt-hybrid-script-packet.json")}`);
    return;
  }

  const externalStoryboardCandidates = storyboardJsonPath
    ? buildCandidatesFromStoryboardResult({
        result: await readJson(storyboardJsonPath),
        blocks: transcriptBlocks,
        targetDuration,
        minDuration,
        maxDuration,
        scenes,
        silences,
        strategy: "external-gpt"
      })
    : [];
  const llmCandidates = externalStoryboardCandidates.length
    ? []
    : (strategy === "auto" || strategy === "llm-recompose")
      ? await buildLlmRecomposedCandidates({
          transcriptSegments,
          minDuration,
          maxDuration,
          targetDuration,
          count,
          scenes,
          silences,
          sourceTitle: source.title || path.parse(inputPath).name,
          llmConfig
        })
      : [];
  const recomposedCandidates = externalStoryboardCandidates.length
    ? []
    : (strategy === "auto" || strategy === "recompose" || strategy === "external-gpt")
      ? buildRecomposedCandidates({
          transcriptSegments,
          minDuration,
          maxDuration,
          targetDuration,
          count,
          scenes,
          silences
        })
      : [];
  const clipCandidates = (externalStoryboardCandidates.length || llmCandidates.length || recomposedCandidates.length)
    ? []
    : buildCandidateSegments({
        duration: videoInfo.duration,
        cutPoints,
        scenes,
        silences,
        transcriptSegments,
        minDuration,
        maxDuration,
        targetDuration
      });
  const combinedCandidates = externalStoryboardCandidates.length
    ? externalStoryboardCandidates
    : llmCandidates.length
      ? llmCandidates
      : recomposedCandidates.length
        ? recomposedCandidates
        : clipCandidates.length
          ? clipCandidates
          : buildFallbackSegments({
              duration: videoInfo.duration,
              minDuration,
              maxDuration,
              targetDuration,
              count
            });
  const selected = selectTopSegments(combinedCandidates, count);

  for (let i = 0; i < selected.length; i += 1) {
    const item = selected[i];
    const outputPath = path.join(shortsDir, `short-${String(i + 1).padStart(2, "0")}.mp4`);
    const subtitlePath = path.join(shortsDir, `short-${String(i + 1).padStart(2, "0")}.ass`);
    const piecePlan = item.pieces?.length
      ? {
          hookFrontLoaded: item.hookFrontLoaded,
          hookRange: item.hookRange,
          silenceRemovedSeconds: item.silenceRemovedSeconds || 0,
          pieces: item.pieces
        }
      : buildPiecePlan({
          start: item.start,
          end: item.end,
          silences,
          transcriptSegments
        });
    item.hookFrontLoaded = piecePlan.hookFrontLoaded;
    item.hookRange = piecePlan.hookRange;
    item.silenceRemovedSeconds = piecePlan.silenceRemovedSeconds;
    item.pieces = piecePlan.pieces;
    item.duration = round2(piecePlan.pieces.reduce((sum, piece) => sum + piece.duration, 0));
    const clipMeta = item.title
      ? {
          title: item.title,
          thumbnailText: item.thumbnailText || ""
        }
      : buildClipMeta({
          storyboard: item.storyboard,
          hookRange: piecePlan.hookRange,
          transcriptPreview: item.transcriptPreview,
          sourceTitle: source.title || path.parse(inputPath).name
        });
    item.title = clipMeta.title;
    item.thumbnailText = clipMeta.thumbnailText;
    await fs.writeFile(subtitlePath, buildClipAss({
      pieces: piecePlan.pieces,
      transcriptSegments,
      templateName,
      titleText: clipMeta.title,
      thumbnailText: clipMeta.thumbnailText
    }));
    await renderShortClip({
      inputPath,
      outputPath,
      subtitlePath,
      pieces: piecePlan.pieces,
      width: videoInfo.width,
      height: videoInfo.height
    });
    item.outputPath = outputPath;
    item.subtitlePath = subtitlePath;
  }

  await writeJson(path.join(runDir, "input.json"), {
    source,
    video: inputPath,
    strategy,
    llm: {
      enabled: llmConfig.enabled,
      model: llmConfig.model,
      baseUrl: llmConfig.enabled ? llmConfig.baseUrl : undefined
    },
    count,
    minDuration,
    maxDuration,
    targetDuration,
    sceneThreshold,
    silenceNoise,
    silenceMin,
    asrModel,
    templateName
  });
  await writeJson(path.join(runDir, "video-info.json"), videoInfo);
  await writeJson(path.join(runDir, "source.json"), source);
  await writeJson(path.join(runDir, "transcript.json"), transcript);
  await writeJson(path.join(runDir, "transcript-blocks.json"), transcriptBlocks);
  await writeJson(path.join(runDir, "scenes.json"), scenes);
  await writeJson(path.join(runDir, "silences.json"), silences);
  await writeJson(path.join(runDir, "cut-points.json"), cutPoints);
  await writeJson(path.join(runDir, "candidates.json"), combinedCandidates);
  if (llmCandidates.length) {
    await writeJson(path.join(runDir, "llm-candidates.json"), llmCandidates);
  }
  await writeJson(path.join(runDir, "selected.json"), selected);
  await writeJson(path.join(runDir, "clip-metadata.json"), selected.map((item, index) => ({
    rank: index + 1,
    strategy: item.strategy || "clip",
    start: item.start,
    end: item.end,
    duration: item.duration,
    title: item.title,
    thumbnailText: item.thumbnailText,
    hookFrontLoaded: item.hookFrontLoaded,
    hookRange: item.hookRange,
    storyboard: item.storyboard,
    outputPath: item.outputPath,
    subtitlePath: item.subtitlePath
  })));
  await fs.writeFile(path.join(runDir, "report.md"), toMarkdown({ inputPath, videoInfo, scenes, silences, selected }));

  console.log(`완료: ${runDir}`);
  console.log(`- source: ${source.type}`);
  if (source.type === "youtube") {
    console.log(`- title: ${source.title}`);
  }
  console.log(`- scenes: ${scenes.length}`);
  console.log(`- silences: ${silences.length}`);
  console.log(`- selected shorts: ${selected.length}`);
  for (const item of selected) {
    console.log(`- ${formatTimestamp(item.start)} ~ ${formatTimestamp(item.end)} / ${path.basename(item.outputPath)}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
