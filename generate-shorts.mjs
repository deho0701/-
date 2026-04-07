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
    // .env is optional
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
    .slice(0, 50) || "job";
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function readText(filePath) {
  return fs.readFile(filePath, "utf8");
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
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

function resolveMaybeAbsolute(filePath) {
  if (!filePath) return "";
  return path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
}

function isImageAsset(filePath = "") {
  return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(String(filePath));
}

function parseSecondsRange(range) {
  const match = String(range).trim().match(/^(\d+)\s*-\s*(\d+)s$/);
  if (!match) return null;
  return { start: Number(match[1]), end: Number(match[2]) };
}

function getVideoDuration(scriptBeats) {
  let maxEnd = 0;
  for (const beat of scriptBeats) {
    const parsed = parseSecondsRange(beat.seconds);
    if (parsed) maxEnd = Math.max(maxEnd, parsed.end);
  }
  return maxEnd || 40;
}

function isMemeStyle(finalScript = {}) {
  const haystack = [
    finalScript.style_preset,
    finalScript.audience,
    finalScript.tone,
    finalScript.core_angle,
    finalScript.keyword
  ].filter(Boolean).join(" ").toLowerCase();
  return /(meme|밈컷|밈|자극적|리액션)/.test(haystack);
}

function shortenDisplayText(text, maxChars = 18) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 1)}…`;
}

function buildTopLeadText(finalScript = {}, beat = {}) {
  const candidates = [
    beat.top_lead_text,
    finalScript.thumbnail_text_options?.[0],
    finalScript.title_options?.[0],
    finalScript.hook
  ].filter(Boolean);
  return shortenDisplayText(candidates[0] || finalScript.keyword || "", 22);
}

function buildSeriesTag(finalScript = {}) {
  const keyword = String(finalScript.keyword || "").replace(/\s+/g, "").trim();
  if (!keyword) return "핵심 사실";
  if (keyword.length <= 8) return `${keyword} 사실`;
  return `${keyword.slice(0, 8)} 핵심`;
}

function normalizeFact(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function inferFormat(keyword, angle = "") {
  const text = `${keyword} ${angle}`.toLowerCase();
  if (/(불면증|수면|잠|숙면|코골이|무호흡|수면장애|insomnia|sleep)/.test(text)) return "health";
  if (/(가격|시세|환율|주가|요금)/.test(text)) return "price";
  if (/(루머|이슈|논란|사건|폭로|논쟁)/.test(text)) return "issue";
  if (/(방법|팁|사용법|설정|하는법|공략)/.test(text)) return "howto";
  if (/(비교|vs|차이|추천|뭐가|어떤)/.test(text)) return "compare";
  return "general";
}

function buildStockQueryPlan(job, format) {
  const keyword = String(job.keyword || "").trim();
  if (format === "health") {
    return {
      global: [
        "insomnia night",
        "person awake in bed at night",
        "alarm clock night",
        "phone screen night bedroom",
        "tired person morning",
        "sleep journal notebook"
      ],
      beats: [
        "person awake in bed at night",
        "alarm clock night",
        "phone screen night bedroom",
        "restless sleep bedroom night",
        "tired person morning",
        "sleep journal notebook"
      ]
    };
  }
  if (format === "issue") {
    return {
      global: [
        `${keyword} concept`,
        "breaking news closeup",
        "phone scrolling news",
        "people reacting discussion",
        "city night screens"
      ],
      beats: [
        "phone scrolling news",
        "breaking news closeup",
        "people reacting discussion",
        "person thinking office",
        "city night screens"
      ]
    };
  }
  if (format === "howto") {
    return {
      global: [
        `${keyword} tutorial`,
        "hands using smartphone",
        "typing on phone closeup",
        "computer settings closeup",
        "person solving problem laptop"
      ],
      beats: [
        "person frustrated with phone",
        "hands using smartphone",
        "computer settings closeup",
        "person solving problem laptop",
        "checklist closeup desk"
      ]
    };
  }
  if (format === "compare") {
    return {
      global: [
        `${keyword} comparison`,
        "two products on table",
        "choice decision closeup",
        "person comparing options",
        "split screen concept"
      ],
      beats: [
        "two products on table",
        "person comparing options",
        "choice decision closeup",
        "thinking person closeup",
        "split screen concept"
      ]
    };
  }
  return {
    global: [
      `${keyword} concept`,
      `${keyword} closeup`,
      "person thinking closeup",
      "phone scrolling information",
      "city lifestyle slow motion"
    ],
    beats: [
      `${keyword} concept`,
      "phone scrolling information",
      "person thinking closeup",
      "city lifestyle slow motion",
      `${keyword} closeup`
    ]
  };
}

function buildMockScript(job) {
  const facts = Array.isArray(job.facts) ? job.facts.map(normalizeFact).filter(Boolean) : [];
  const format = inferFormat(job.keyword, job.angle);
  const stockPlan = buildStockQueryPlan(job, format);
  const templates = {
    price: {
      hook: `${job.keyword}, 오늘 왜 움직였는지 핵심만 바로 갑니다.`,
      titleA: `${job.keyword} 지금 왜 움직이는지`,
      thumbA: `${job.keyword} 왜?`,
      first: `${job.keyword}에서 지금 확인해야 할 변화부터 짚습니다.`,
      second: `${job.keyword}가 움직인 배경을 한 문장으로 정리합니다.`,
      third: `${job.audience || "시청자"} 입장에서 이게 왜 중요한지 연결합니다.`,
      summary: `${job.keyword}의 흐름과 의미를 짧게 정리한 가격형 쇼츠 초안`
    },
    issue: {
      hook: `${job.keyword}, 지금 확정된 것만 먼저 정리합니다.`,
      titleA: `${job.keyword} 지금 나온 핵심`,
      thumbA: `확정된 건`,
      first: `${job.keyword}에서 지금 나온 주장 중 핵심만 추립니다.`,
      second: `확정된 정보와 아직 검증이 필요한 부분을 분리합니다.`,
      third: `${job.audience || "시청자"}가 헷갈리지 않게 지금 볼 포인트를 남깁니다.`,
      summary: `${job.keyword}의 핵심 주장과 검증 포인트를 짧게 정리한 이슈형 쇼츠 초안`
    },
    howto: {
      hook: `${job.keyword}, 막히는 부분만 바로 해결합니다.`,
      titleA: `${job.keyword} 여기서 막힌다`,
      thumbA: `바로 해결`,
      first: `${job.keyword}에서 사람들이 가장 자주 막히는 지점을 먼저 짚습니다.`,
      second: `복잡한 설명 말고 바로 적용되는 방법만 남깁니다.`,
      third: `실수하기 쉬운 포인트까지 짧게 경고합니다.`,
      summary: `${job.keyword}의 막히는 포인트와 해결 흐름을 정리한 실전형 쇼츠 초안`
    },
    compare: {
      hook: `${job.keyword}, 뭐가 다른지 30초 안에 갈라드립니다.`,
      titleA: `${job.keyword} 차이만 정리`,
      thumbA: `뭐가 다름?`,
      first: `${job.keyword}에서 비교 포인트를 먼저 세웁니다.`,
      second: `헷갈리는 기준을 한 줄씩 분리합니다.`,
      third: `${job.audience || "시청자"}가 어떤 선택을 해야 하는지도 연결합니다.`,
      summary: `${job.keyword}의 차이와 선택 포인트를 정리한 비교형 쇼츠 초안`
    },
    health: {
      hook: `잠 안 오는 밤이 계속되면, 그냥 피곤해서 그런 게 아닐 수 있습니다.`,
      titleA: `${job.keyword} 계속되면 먼저 볼 것`,
      thumbA: `잠 안 오면`,
      first: `${job.keyword}이 반복되면 먼저 보는 건 의지가 아니라, 몸이 밤에도 각성 상태로 남아 있는 패턴입니다.`,
      second: `그래서 제일 먼저 체크하는 게 취침 시간, 낮잠, 오후 카페인, 밤에 보는 밝은 화면 같은 반복 습관입니다.`,
      third: `이걸 줄여도 계속 잠드는 데 오래 걸리거나 자꾸 깨면, 혼자 버티지 말고 진료 상담으로 넘어가는 쪽이 안전합니다.`,
      summary: `${job.keyword}에서 먼저 봐야 할 패턴과 대응 흐름을 정리한 건강형 쇼츠 초안`,
      labels: ["잠 안 오는 밤", "이게 먼저", "패턴 체크", "이때는 진료", "오늘 할 일"],
      finalLine: "오늘 밤부터 할 일은 하나예요. 잠이 왜 안 오는지 추측하지 말고, 잠든 시간하고 깬 시간부터 적어두세요."
    },
    general: {
      hook: `${job.keyword}, 지금 봐야 하는 포인트만 바로 갑니다.`,
      titleA: `${job.keyword} 핵심만 정리`,
      thumbA: `핵심만`,
      first: `${job.keyword}의 핵심 변화나 포인트부터 짚습니다.`,
      second: `배경이나 맥락을 한 문장으로 연결합니다.`,
      third: `${job.audience || "시청자"} 입장에서 왜 중요한지 바로 이어줍니다.`,
      summary: `${job.keyword}의 핵심 변화와 의미를 짧게 정리한 정보형 쇼츠 초안`
    }
  };
  const t = templates[format];
  const first = facts[0] || t.first;
  const second = facts[1] || t.second;
  const third = facts[2] || t.third;
  const hook = t.hook;
  const labels = t.labels || ["핵심", "지금 벌어진 일", "배경/원인", "그래서 중요한 점", "핵심 요약"];
  const finalLine =
    t.finalLine ||
    (format === "issue"
      ? "지금 단계에선 확정 정보와 검증 필요 정보를 꼭 나눠서 보세요."
      : "핵심만 보면 이겁니다. 디테일보다 먼저 흐름부터 잡으세요.");
  if (format === "health") {
    return {
      keyword: job.keyword,
      core_angle: job.angle || "키워드 기반 정보형 쇼츠",
      audience: job.audience || "한국어 쇼츠를 보는 일반 사용자",
      confidence_label: facts.length >= 3 ? "medium" : "low",
      title_options: [
        t.titleA,
        `${job.keyword} 밤마다 반복되면`,
        `${job.keyword} 먼저 끊을 것`
      ],
      thumbnail_text_options: [
        t.thumbA,
        "이거부터",
        "버티지 마"
      ],
      hook,
      summary: t.summary,
      script_beats: [
        {
          beat: 1,
          seconds: "0-2s",
          voiceover: hook,
          on_screen_text: "잠 안 오면",
          visual_direction: "첫 2초 강한 선언 카드",
          stock_search_query: stockPlan.beats[0] || stockPlan.global[0]
        },
        {
          beat: 2,
          seconds: "2-6s",
          voiceover: first,
          on_screen_text: "의지가 아님",
          visual_direction: "핵심 원인 1줄 카드",
          stock_search_query: stockPlan.beats[1] || stockPlan.global[1]
        },
        {
          beat: 3,
          seconds: "6-11s",
          voiceover: "제일 먼저 보는 건 취침 시간입니다. 맨날 들쭉날쭉하면 몸이 더 헷갈립니다.",
          on_screen_text: "취침 시간",
          visual_direction: "짧은 체크포인트 카드",
          stock_search_query: stockPlan.beats[2] || stockPlan.global[2]
        },
        {
          beat: 4,
          seconds: "11-17s",
          voiceover: "여기에 낮잠, 오후 카페인, 밤에 보는 밝은 화면이 겹치면 더 꼬입니다.",
          on_screen_text: "낮잠 카페인 화면",
          visual_direction: "패턴 3개 빠르게 전환",
          stock_search_query: stockPlan.beats[3] || stockPlan.global[3]
        },
        {
          beat: 5,
          seconds: "17-25s",
          voiceover: "이걸 줄였는데도 잠드는 데 오래 걸리거나 자꾸 깨면, 그때는 버티지 마세요. 진료로 넘어가야 합니다.",
          on_screen_text: "이때는 병원",
          visual_direction: "경고 카드 + 리듬 전환",
          stock_search_query: stockPlan.beats[4] || stockPlan.global[4]
        },
        {
          beat: 6,
          seconds: "25-35s",
          voiceover: finalLine,
          on_screen_text: "오늘부터 기록",
          visual_direction: "마지막 행동 지시 카드",
          stock_search_query: stockPlan.beats[5] || stockPlan.global[5]
        }
      ],
      stock_search_queries: stockPlan.global,
      cta: "다음 키워드도 같은 톤으로 바로 만들어드립니다.",
      caption: `${job.keyword}에서 먼저 끊어야 할 패턴만 짧게 정리한 쇼츠 초안입니다.`,
      hashtags: ["#쇼츠", "#건강정보", "#수면루틴"],
      claims_to_verify: facts.length ? [] : [`${job.keyword} 관련 최신 의학 정보와 진료 기준 확인 필요`],
      missing_facts: facts.length ? [] : [`${job.keyword} 관련 최신 의학 정보`, "진료 권고 기준", "출처 링크"],
      source_summary: facts
    };
  }

  return {
    keyword: job.keyword,
    core_angle: job.angle || "키워드 기반 정보형 쇼츠",
    audience: job.audience || "한국어 쇼츠를 보는 일반 사용자",
    confidence_label: facts.length >= 3 ? "medium" : "low",
    title_options: [
      t.titleA,
      `${job.keyword} 한 번에 이해하기`,
      `${job.keyword} 오늘 포인트만 정리`
    ],
    thumbnail_text_options: [
      t.thumbA,
      `지금 포인트`,
      `30초 정리`
    ],
    hook,
    summary: t.summary,
    script_beats: [
      {
        beat: 1,
        seconds: "0-2s",
        voiceover: hook,
        on_screen_text: labels[0],
        visual_direction: "키워드 크게 등장, 상단 타이틀 카드",
        stock_search_query: stockPlan.beats[0] || stockPlan.global[0]
      },
      {
        beat: 2,
        seconds: "2-8s",
        voiceover: first,
        on_screen_text: labels[1],
        visual_direction: "핵심 문장 1줄 + 배경 색 카드",
        stock_search_query: stockPlan.beats[1] || stockPlan.global[1]
      },
      {
        beat: 3,
        seconds: "8-18s",
        voiceover: second,
        on_screen_text: labels[2],
        visual_direction: "원인 키워드 2~3개 분할 카드",
        stock_search_query: stockPlan.beats[2] || stockPlan.global[2]
      },
      {
        beat: 4,
        seconds: "18-30s",
        voiceover: third,
        on_screen_text: labels[3],
        visual_direction: "소비자/사업자 시점 구분 카드",
        stock_search_query: stockPlan.beats[3] || stockPlan.global[3]
      },
      {
        beat: 5,
        seconds: "30-40s",
        voiceover: finalLine,
        on_screen_text: labels[4],
        visual_direction: "마지막 요약 카드 + CTA 영역",
        stock_search_query: stockPlan.beats[4] || stockPlan.global[4]
      }
    ],
    stock_search_queries: stockPlan.global,
    cta: "원하면 다음 키워드도 바로 이어서 정리합니다.",
    caption: `${job.keyword} 관련 핵심만 짧게 정리한 쇼츠 초안입니다.`,
    hashtags: ["#쇼츠", "#정보정리", "#키워드분석"],
    claims_to_verify: facts.length ? [] : [`${job.keyword} 관련 최신 수치와 비교값 확인 필요`],
    missing_facts: facts.length ? [] : [`${job.keyword} 관련 최신 사실 데이터`, "숫자/비교 기준", "출처 링크"],
    source_summary: facts
  };
}

function buildMockReview(draft) {
  const factRisks = [];
  const format = inferFormat(draft.keyword, draft.core_angle);
  if (draft.confidence_label === "low") {
    factRisks.push({
      claim: "입력 사실이 부족한 상태에서 정보형 쇼츠를 만들고 있음",
      risk_level: "high",
      reason: "구체적 숫자나 비교값 없이도 정보형 톤을 내고 있어 검증 전 사용 위험이 있음",
      fix: "최신 수치, 시점, 비교 기준을 추가하고 claims_to_verify를 먼저 검증하라"
    });
  }
  if (format === "health") {
    factRisks.push({
      claim: "건강 키워드를 다루면서 일반 정보와 진료 판단 기준이 충분히 분리되지 않을 수 있음",
      risk_level: "medium",
      reason: "의학적 진단이나 치료 조언처럼 들리면 오해 위험이 있음",
      fix: "의학적 단정 표현을 피하고 일반 정보라는 점과 진료 상담 필요 가능성을 명확히 남겨라"
    });
  }
  if (!Array.isArray(draft.stock_search_queries) || draft.stock_search_queries.length < 3) {
    factRisks.push({
      claim: "스톡 영상 검색어가 부족한 상태라 실제 무료 API 클립 검색 품질이 낮아질 수 있음",
      risk_level: "medium",
      reason: "비트별 검색어와 전체 검색어가 약하면 같은 장면이 반복되거나 검색 실패가 잦아짐",
      fix: "전체 스톡 검색어 3개 이상과 비트별 검색어를 모두 유지하라"
    });
  }
  const weakHook = draft.hook.length > 40;
  const suggestedTitleByFormat =
    format === "health"
      ? `${draft.keyword} 계속되면 먼저 볼 것`
      : format === "issue"
        ? `${draft.keyword} 지금 확정된 것`
        : format === "howto"
          ? `${draft.keyword} 여기서 막힌다`
          : format === "compare"
            ? `${draft.keyword} 차이만 정리`
            : `${draft.keyword} 핵심만 정리`;
  const suggestedHookByFormat =
    format === "health"
      ? `잠 안 오는 밤이 계속되면, 그냥 피곤해서 그런 게 아닐 수 있습니다.`
      : format === "issue"
        ? `${draft.keyword}, 확정된 것만 먼저 갑니다.`
        : format === "howto"
          ? `${draft.keyword}, 막히는 부분만 바로 해결합니다.`
          : format === "compare"
            ? `${draft.keyword}, 뭐가 다른지 바로 갈라드립니다.`
            : `${draft.keyword}, 지금 봐야 하는 포인트만 바로 갑니다.`;
  return {
    approved: !weakHook && factRisks.length === 0,
    overall_score: !weakHook && factRisks.length === 0 ? 86 : 72,
    critical_issues: factRisks.length ? ["핵심 사실 데이터가 부족한 상태라 바로 게시용으로 쓰기 어렵다"] : [],
    revision_tasks: [
      weakHook ? "첫 훅 문장을 더 짧고 즉시성 있게 줄여라" : "첫 훅은 유지하되 첫 8초 안에 핵심 사실을 더 압축하라",
      "화면 텍스트를 명사형으로 더 짧게 유지하라"
    ],
    fact_risks: factRisks,
    style_notes: ["정보형 톤은 무난하지만 사실 데이터가 들어오면 더 날카로워질 수 있다"],
    suggested_hook_fix: suggestedHookByFormat,
    suggested_title_fix: suggestedTitleByFormat,
    summary: factRisks.length
      ? "형식은 맞지만 사실 데이터 보강이 필요하다."
      : "기본 쇼츠 형식은 무난하고 바로 테스트용으로 사용 가능하다."
  };
}

function escapeDrawtext(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function wrapText(text, maxChars = 12) {
  const source = String(text).trim();
  if (!source) return "";
  const words = source.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines.join("\n");
}

function pickTheme(keyword) {
  const text = String(keyword).toLowerCase();
  if (/(meme|밈)/.test(text)) {
    return {
      name: "meme",
      bg: "#180707",
      bg2: "#31060b",
      accent: "#ff453a",
      accent2: "#ffd60a",
      panel: "#2c0810",
      textSubtle: "#fff1b5"
    };
  }
  if (/(불면증|수면|잠|숙면|insomnia|sleep)/.test(text)) {
    return {
      name: "night",
      bg: "#081120",
      bg2: "#14213d",
      accent: "#7c9cff",
      accent2: "#4cc9f0",
      panel: "#0f1b31",
      textSubtle: "#d9e4ff"
    };
  }
  if (/(루머|이슈|논란|사건|폭로)/.test(text)) {
    return {
      name: "issue",
      bg: "#161616",
      bg2: "#4a1111",
      accent: "#ff6b6b",
      accent2: "#ffd166",
      panel: "#241212",
      textSubtle: "#ffe1e1"
    };
  }
  return {
    name: "default",
    bg: "#111111",
    bg2: "#1d3557",
    accent: "#4cc9f0",
    accent2: "#90e0ef",
    panel: "#0b1320",
    textSubtle: "#e6fbff"
  };
}

function buildSegmentFilters({ finalScript, beat, parsed, beatIndex, beatCount, duration, fontPath, theme }) {
  const safePanel = escapeDrawtext(wrapText(beat.on_screen_text, 8));
  const progressExpr = `${(1080 / Math.max(duration, 1)).toFixed(3)}*t`;
  const memeStyle = isMemeStyle(finalScript);
  const safeTopLead = escapeDrawtext(buildTopLeadText(finalScript, beat));
  const safeSeriesTag = escapeDrawtext(buildSeriesTag(finalScript));

  const filters = memeStyle
    ? [
      `drawbox=x=0:y=0:w=iw:h=130:color=black@0.28:t=fill`,
      `drawbox=x=0:y=1760:w=iw:h=160:color=black@0.22:t=fill`,
      `drawtext=fontfile=${fontPath}:text='${safeTopLead}':fontcolor=#72ff7e:fontsize=40:borderw=3:bordercolor=black@0.92:x=(w-text_w)/2:y=38`,
      `drawtext=fontfile=${fontPath}:text='${safeSeriesTag}':fontcolor=#ff354d:fontsize=66:borderw=6:bordercolor=black@0.95:x=(w-text_w)/2:y=1652`,
      `drawbox=x=90:y=104:w=${progressExpr}:h=8:color=#72ff7e@0.96:t=fill`,
      `drawbox=x=42:y=520:w=996:h=270:color=#111111@0.72:t=fill:enable='between(t,0,0.62)'`,
      `drawtext=fontfile=${fontPath}:text='${safePanel}':fontcolor=#ffe55c:fontsize=92:borderw=6:bordercolor=black@0.98:x=(w-text_w)/2:y=610:enable='between(t,0,0.9)'`,
      `drawbox=x=0:y=0:w=iw:h=ih:color=white@0.08:t=fill:enable='between(mod(t,1.2),0,0.05)'`
    ]
    : [
      `drawbox=x=0:y=0:w=iw:h=360:color=black@0.42:t=fill`,
      `drawbox=x=0:y=1450:w=iw:h=470:color=black@0.36:t=fill`,
      `drawbox=x=76:y=180:w=150:h=10:color=${theme.accent}@0.95:t=fill`,
      `drawbox=x=76:y=1836:w=${progressExpr}:h=10:color=${theme.accent2}@0.95:t=fill`,
      `drawtext=fontfile=${fontPath}:text='${safePanel}':fontcolor=white:fontsize=124:line_spacing=8:borderw=4:bordercolor=black@0.62:x=76:y=214`
    ];

  return filters.join(",");
}

function buildJob(args) {
  if (args.input) return readJson(path.resolve(args.input));
  if (!args.keyword) {
    throw new Error("`--keyword` 또는 `--input`이 필요합니다.");
  }
  return Promise.resolve({
    keyword: args.keyword,
    angle: args.angle || "키워드 기반 정보형 쇼츠",
    audience: args.audience || "한국어 쇼츠를 보는 일반 사용자",
    platform: "youtube_shorts",
    tone: args.tone || "짧고 선명함, 과장 없음",
    facts: []
  });
}

function buildImportedReview(finalScript) {
  return {
    approved: true,
    overall_score: 84,
    critical_issues: [],
    revision_tasks: [],
    fact_risks: [],
    style_notes: ["외부에서 구성된 final script를 그대로 렌더함"],
    suggested_hook_fix: finalScript?.hook || "",
    suggested_title_fix: Array.isArray(finalScript?.title_options) ? (finalScript.title_options[0] || "") : "",
    summary: "외부 final script JSON import 경로로 렌더링함"
  };
}

async function callChatCompletion({ model, systemPrompt, userPayload, schema }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");
  }

  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
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
    throw new Error(`OpenAI API 오류 (${response.status}): ${body}`);
  }

  const json = await response.json();
  const raw = json?.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error("모델 응답에서 content를 찾지 못했습니다.");
  }
  return JSON.parse(raw);
}

async function callSpeech({ input, outPath, voice }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");
  }
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const instructions =
    process.env.SHORTS_TTS_INSTRUCTIONS ||
    [
      "Speak entirely in Korean.",
      "Sound like a sharp YouTube Shorts creator, not a broadcast announcer.",
      "Use a brisk, conversational, dry tone with clean emphasis on key phrases.",
      "Keep pauses short, avoid overacting, and make each line feel direct and punchy.",
      "Do not sound theatrical, robotic, sleepy, or overly polite."
    ].join(" ");
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
      instructions
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI TTS 오류 (${response.status}): ${body}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  await fs.writeFile(outPath, Buffer.from(arrayBuffer));
}

function resolveEdgeVoice(voice) {
  const candidate = String(voice || process.env.SHORTS_EDGE_TTS_VOICE || "").trim();
  if (candidate && /[a-z]{2}-[A-Z]{2}-/.test(candidate)) {
    return candidate;
  }
  return process.env.SHORTS_EDGE_TTS_VOICE || "ko-KR-SunHiNeural";
}

async function callEdgeSpeech({ input, outPath, voice }) {
  const ttsVoice = resolveEdgeVoice(voice);
  await execFileAsync(resolvePythonBin(), [
    "-m",
    "edge_tts",
    "--text",
    input,
    "--voice",
    ttsVoice,
    "--write-media",
    outPath
  ]);
}

function parseBool(value, defaultValue = false) {
  if (value == null) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return defaultValue;
}

function resolveTtsProvider(args = {}) {
  const provider = String(args["tts-provider"] || process.env.SHORTS_TTS_PROVIDER || "openai")
    .trim()
    .toLowerCase();
  if (provider !== "openai" && provider !== "edge") {
    throw new Error(`지원하지 않는 TTS provider입니다: ${provider}`);
  }
  return provider;
}

async function synthesizeNarration({ input, outPath, voice, ttsProvider, allowTtsFallback }) {
  if (ttsProvider === "edge") {
    await callEdgeSpeech({ input, outPath, voice });
    return { provider: "edge", fallbackUsed: false };
  }

  try {
    await callSpeech({ input, outPath, voice });
    return { provider: "openai", fallbackUsed: false };
  } catch (error) {
    if (!allowTtsFallback) {
      throw error;
    }
    await callEdgeSpeech({ input, outPath, voice });
    return {
      provider: "edge",
      fallbackUsed: true,
      fallbackReason: error.message
    };
  }
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
    "loudnorm=I=-15:LRA=11:TP=-1.5,acompressor=threshold=-18dB:ratio=2:attack=20:release=250,volume=2.0",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-c:a",
    "libmp3lame",
    outPath
  ]);
}

async function buildAmbientBed(outPath, duration) {
  await execFileAsync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    `anoisesrc=color=pink:amplitude=0.015:duration=${duration}:sample_rate=44100`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=174:sample_rate=44100:duration=${duration}`,
    "-filter_complex",
    "[0:a]lowpass=f=420,highpass=f=110,volume=0.18[a0];[1:a]volume=0.015[a1];[a0][a1]amix=inputs=2:normalize=0,afade=t=in:st=0:d=0.7,afade=t=out:st=" +
      `${Math.max(duration - 0.9, 0)}:d=0.9[a]`,
    "-map",
    "[a]",
    "-c:a",
    "libmp3lame",
    outPath
  ]);
}

async function buildMemeBed(outPath, duration) {
  await execFileAsync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    `anoisesrc=color=violet:amplitude=0.018:duration=${duration}:sample_rate=44100`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=96:sample_rate=44100:duration=${duration}`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=196:sample_rate=44100:duration=${duration}`,
    "-filter_complex",
    "[0:a]lowpass=f=1200,highpass=f=140,volume=0.11[a0];" +
      "[1:a]volume=0.018[a1];" +
      "[2:a]volume='if(lt(mod(t,1.6),0.09),0.045,0)'[a2];" +
      "[a0][a1][a2]amix=inputs=3:normalize=0,acompressor=threshold=-20dB:ratio=2:attack=8:release=120,afade=t=in:st=0:d=0.3,afade=t=out:st=" +
      `${Math.max(duration - 0.8, 0)}:d=0.8[a]`,
    "-map",
    "[a]",
    "-c:a",
    "libmp3lame",
    outPath
  ]);
}

async function mixNarrationWithBed(narrationPath, bedPath, outPath) {
  await execFileAsync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    narrationPath,
    "-i",
    bedPath,
    "-filter_complex",
    "[0:a]volume=1.0,adelay=0|0[n];[1:a]volume=0.22[b];[n][b]amix=inputs=2:normalize=0[a]",
    "-map",
    "[a]",
    "-c:a",
    "libmp3lame",
    outPath
  ]);
}

async function buildSilentAudio(outPath, duration) {
  await execFileAsync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-t",
    String(duration),
    "-c:a",
    "libmp3lame",
    outPath
  ]);
}

function escapeAss(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\n/g, "\\N");
}

function formatAssTime(seconds) {
  const totalCs = Math.max(0, Math.round(seconds * 100));
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function buildAss(finalScript) {
  const memeStyle = isMemeStyle(finalScript);
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: ${memeStyle ? 0 : 2}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Body,Noto Sans CJK KR,${memeStyle ? 58 : 48},&H00FFFFFF,&H000000FF,&H00101010,&H58000000,1,0,0,0,100,100,0,0,1,${memeStyle ? 5 : 3},1,2,96,96,${memeStyle ? 250 : 270},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const lines = [];

  for (const beat of finalScript.script_beats) {
    const parsed = parseSecondsRange(beat.seconds);
    if (!parsed) continue;
    const bodyText = escapeAss(wrapText(beat.voiceover, memeStyle ? 14 : 19));
    lines.push(
      `Dialogue: 0,${formatAssTime(parsed.start)},${formatAssTime(parsed.end)},Body,,0,0,0,,${bodyText}`
    );
  }

  return `${header}\n${lines.join("\n")}\n`;
}

const TITLE_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "your",
  "this",
  "that",
  "from",
  "into",
  "sleeping",
  "science",
  "series",
  "video",
  "official",
  "get",
  "deal",
  "finally",
  "unlock",
  "powerful",
  "what"
]);

function tokenizeEnglish(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token && token.length > 2 && !TITLE_STOPWORDS.has(token));
}

function countWords(values) {
  const counts = new Map();
  for (const value of values) {
    for (const token of tokenizeEnglish(value)) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function parseVttText(content) {
  const lines = String(content)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^WEBVTT|NOTE|Kind:|Language:/.test(line) && !/^\d+$/.test(line) && !/-->/.test(line));

  const deduped = [];
  for (const line of lines) {
    if (deduped[deduped.length - 1] !== line) deduped.push(line);
  }
  return deduped.join(" ");
}

function buildYouTubeSearchQuery(job) {
  const format = inferFormat(job.keyword, job.angle);
  if (format === "health") return `${job.keyword} sleep tips`;
  if (format === "howto") return `${job.keyword} tutorial`;
  if (format === "issue") return `${job.keyword} explained`;
  if (format === "compare") return `${job.keyword} comparison`;
  return `${job.keyword} explained`;
}

async function searchYouTubeReferences(job) {
  const query = buildYouTubeSearchQuery(job);
  const { stdout } = await execFileAsync(resolveYtDlpBinary(), ["--dump-single-json", "--flat-playlist", `ytsearch5:${query}`], {
    maxBuffer: 10 * 1024 * 1024
  });
  const json = JSON.parse(stdout);
  const entries = Array.isArray(json.entries) ? json.entries : [];
  return entries
    .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
    .slice(0, 3)
    .map((entry) => ({
      id: entry.id,
      url: entry.url || `https://www.youtube.com/watch?v=${entry.id}`,
      title: entry.title,
      channel: entry.channel || entry.uploader || "",
      view_count: entry.view_count || 0,
      duration: entry.duration || 0
    }));
}

async function fetchYouTubeCaptions(reference, tempDir) {
  const outputTemplate = path.join(tempDir, reference.id);
  try {
    await execFileAsync(
      resolveYtDlpBinary(),
      [
        "--skip-download",
        "--write-subs",
        "--write-auto-subs",
        "--sub-langs",
        "en.*",
        "--sub-format",
        "vtt",
        "-o",
        outputTemplate,
        reference.url
      ],
      { maxBuffer: 10 * 1024 * 1024 }
    );
  } catch {
    return "";
  }

  const entries = await fs.readdir(tempDir);
  const vttFile = entries.find((name) => name.startsWith(reference.id) && name.endsWith(".vtt"));
  if (!vttFile) return "";
  const content = await fs.readFile(path.join(tempDir, vttFile), "utf8");
  return parseVttText(content);
}

function buildFactsFromYouTubeReferences(job, references) {
  if (!references.length) return [];
  const titleCounts = countWords(references.map((reference) => reference.title));
  const captionCounts = countWords(references.map((reference) => reference.caption_text).filter(Boolean));
  const topTitleWords = titleCounts.slice(0, 5).map(([word]) => word);
  const topCaptionWords = captionCounts.slice(0, 5).map(([word]) => word);
  const keywordText = String(job.keyword || "").toLowerCase();

  if (keywordText.includes("불면증") || keywordText.includes("수면") || keywordText.includes("insomnia")) {
    return [
      "불면증이 반복되면 정신력보다, 밤에 각성이 안 꺼지는 패턴부터 먼저 봐야 합니다.",
      "그래서 먼저 보는 게 취침 시간, 낮잠, 카페인, 그리고 밤에 보는 밝은 화면 같은 반복 습관입니다.",
      "이걸 줄여도 계속 잠드는 데 오래 걸리거나 자꾸 깨면, 혼자 버티지 말고 진료 상담으로 넘어가는 쪽이 안전합니다."
    ];
  }

  const facts = [];
  const titleBlob = references.map((reference) => reference.title.toLowerCase()).join(" ");
  if (/(causes|cause|why)/.test(titleBlob)) {
    facts.push("반복해서 나오는 포인트는 결과보다 먼저 원인 구조를 짚는 흐름이다.");
  }
  if (/(tips|strategy|strategies|routine|routines|better sleep)/.test(titleBlob)) {
    facts.push("한 방 해결책보다 루틴과 반복 가능한 전략을 먼저 정리하는 흐름이 강하다.");
  }
  if (/(deal with|finally get to sleep|beat insomnia)/.test(titleBlob)) {
    facts.push("설명만 길게 끌지 않고 바로 적용할 대응법으로 넘어가는 구성이 많다.");
  }
  if (!facts.length && topTitleWords.length) {
    facts.push(`상위 영상 제목에서 반복된 축은 ${topTitleWords.slice(0, 3).join(", ")} 쪽이다.`);
  }
  if (topCaptionWords.length) {
    facts.push(`자동 자막에서 반복된 키워드는 ${topCaptionWords.slice(0, 4).join(", ")} 쪽이었다.`);
  }

  return facts.slice(0, 4);
}

async function enrichJobWithYouTubeReferences(job, runDir) {
  try {
    const references = await searchYouTubeReferences(job);
    const tempDir = path.join(runDir, "youtube");
    await fs.mkdir(tempDir, { recursive: true });
    const enriched = [];
    for (const reference of references) {
      const caption_text = await fetchYouTubeCaptions(reference, tempDir);
      enriched.push({ ...reference, caption_text });
    }
    await fs.writeFile(path.join(runDir, "youtube-references.json"), JSON.stringify(enriched, null, 2));
    const youtubeFacts = buildFactsFromYouTubeReferences(job, enriched).filter((fact) => !/채널/.test(fact));
    return {
      ...job,
      facts: [...(job.facts || []), ...youtubeFacts],
      youtube_references: enriched.map(({ caption_text, ...rest }) => rest)
    };
  } catch (error) {
    await fs.writeFile(path.join(runDir, "youtube-errors.json"), JSON.stringify([error.message], null, 2));
    return job;
  }
}

async function probeDuration(filePath) {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath
    ]);
    const parsed = Number(stdout.trim());
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function hasStockVideoProviders() {
  return Boolean(process.env.PEXELS_API_KEY || process.env.PIXABAY_API_KEY);
}

function inferMemeVisualRole(beat = {}, beatIndex = 0) {
  const text = [beat.on_screen_text, beat.voiceover, beat.visual_direction]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (beatIndex === 0 || /(망|걱정|panic|불안|깨짐|충격|위험|경고)/.test(text)) return "panic_reaction";
  if (/(불안|반복|루프|뒤척|시계|alarm)/.test(text)) return "tension_loop";
  if (/(약|pill|수면제|찾음|찾습니다)/.test(text)) return "quick_fix";
  if (/(낮|청구서|stress|office|업무|연락|일정)/.test(text)) return "day_stress";
  if (/(해법|여백|journal|노트|정리|calm|창가)/.test(text)) return "relief_reset";
  return "general_explainer";
}

function buildMemeQueryCandidates(finalScript, beat, beatIndex) {
  const role = inferMemeVisualRole(beat, beatIndex);
  const byRole = {
    panic_reaction: [
      "shocked reaction face close up",
      "stressed person covering face",
      "anxious person awake in bed night",
      "panic phone scrolling at night"
    ],
    tension_loop: [
      "alarm clock night bedroom",
      "restless person bed night",
      "overthinking person dark room",
      "anxiety pacing room night"
    ],
    quick_fix: [
      "sleeping pills hand close up",
      "medicine bottle close up",
      "hand reaching pills table",
      "quick fix concept hands"
    ],
    day_stress: [
      "busy office stressed person phone",
      "overwhelmed worker desk laptop",
      "phone notifications stress close up",
      "frustrated office worker reaction"
    ],
    relief_reset: [
      "writing journal at desk calm",
      "morning window deep breath",
      "calm notebook writing close up",
      "person planning notebook sunlight"
    ],
    general_explainer: [
      "dramatic reaction close up",
      "stress concept person thinking",
      "moody room overthinking",
      "explanation concept close up"
    ]
  };

  const candidates = [];
  for (const query of byRole[role] || byRole.general_explainer) {
    if (!candidates.includes(query)) candidates.push(query);
  }
  return candidates;
}

function buildClipQueryCandidates(finalScript, beat, beatIndex) {
  const candidates = [];
  const push = (value) => {
    const normalized = String(value || "").trim();
    if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
  };

  if (isMemeStyle(finalScript)) {
    for (const query of buildMemeQueryCandidates(finalScript, beat, beatIndex)) push(query);
  }
  push(beat.stock_search_query);
  for (const query of finalScript.stock_search_queries || []) push(query);

  const keyword = String(finalScript.keyword || "").trim();
  const format = inferFormat(finalScript.keyword, finalScript.core_angle);
  if (format === "health") {
    const healthQueries = [
      "person awake in bed at night",
      "alarm clock night",
      "phone screen night bedroom",
      "restless sleep bedroom night",
      "tired person morning",
      "sleep journal notebook"
    ];
    push(healthQueries[beatIndex] || healthQueries[0]);
  } else {
    push(`${keyword} concept`);
    push(`${keyword} closeup`);
  }

  return candidates.slice(0, 6);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status} ${response.statusText} ${body}`.trim());
  }
  return response.json();
}

function pickBestPexelsFile(video) {
  const files = Array.isArray(video?.video_files) ? video.video_files : [];
  const candidates = files.filter((file) => file?.link && String(file.file_type || "").includes("mp4"));
  if (!candidates.length) return null;
  return candidates.sort((a, b) => {
    const aPortrait = (a.height || 0) > (a.width || 0) ? 1 : 0;
    const bPortrait = (b.height || 0) > (b.width || 0) ? 1 : 0;
    if (aPortrait !== bPortrait) return bPortrait - aPortrait;
    return (b.height || 0) * (b.width || 0) - (a.height || 0) * (a.width || 0);
  })[0];
}

function normalizePexelsVideo(video, query) {
  const file = pickBestPexelsFile(video);
  if (!file?.link) return null;
  return {
    provider: "pexels",
    providerLabel: "Pexels",
    id: `pexels-${video.id}`,
    query,
    width: file.width || video.width || 0,
    height: file.height || video.height || 0,
    duration: Number(video.duration || 0),
    downloadUrl: file.link,
    sourceUrl: video.url || "https://www.pexels.com",
    credit: `Pexels${video.user?.name ? ` · ${video.user.name}` : ""}`
  };
}

function normalizePixabayVideo(hit, query) {
  const variants = hit?.videos || {};
  const ordered = [variants.large, variants.medium, variants.small, variants.tiny].filter(Boolean);
  const file = ordered.find((entry) => entry?.url);
  if (!file?.url) return null;
  return {
    provider: "pixabay",
    providerLabel: "Pixabay",
    id: `pixabay-${hit.id}`,
    query,
    width: file.width || 0,
    height: file.height || 0,
    duration: Number(hit.duration || 0),
    downloadUrl: file.url,
    sourceUrl: hit.pageURL || "https://pixabay.com",
    credit: "Pixabay"
  };
}

async function searchPexelsVideos(query) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return [];
  const url = new URL("https://api.pexels.com/videos/search");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", "10");
  url.searchParams.set("orientation", "portrait");
  const json = await fetchJson(url, {
    headers: {
      Authorization: apiKey
    }
  });
  return (json.videos || []).map((video) => normalizePexelsVideo(video, query)).filter(Boolean);
}

async function searchPixabayVideos(query) {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) return [];
  const url = new URL("https://pixabay.com/api/videos/");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("q", query);
  url.searchParams.set("per_page", "10");
  url.searchParams.set("safesearch", "true");
  const json = await fetchJson(url);
  return (json.hits || []).map((hit) => normalizePixabayVideo(hit, query)).filter(Boolean);
}

function scoreStockCandidate(candidate, segmentSeconds, usedIds) {
  let score = 0;
  if ((candidate.height || 0) > (candidate.width || 0)) score += 40;
  if ((candidate.height || 0) >= 1280) score += 15;
  if ((candidate.width || 0) >= 720) score += 10;
  if ((candidate.duration || 0) >= segmentSeconds + 0.5) score += 20;
  if ((candidate.duration || 0) >= segmentSeconds + 4) score += 10;
  if (!usedIds.has(candidate.id)) score += 15;
  return score;
}

async function downloadStockClip(candidate, outPath) {
  const response = await fetch(candidate.downloadUrl);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`download failed ${response.status} ${body}`.trim());
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outPath, buffer);
}

async function resolveStockAssets({ finalScript, runDir }) {
  if (!hasStockVideoProviders()) {
    return { clipsByBeat: [], sources: [], errors: ["No stock video API keys configured"] };
  }

  const stockDir = path.join(runDir, "stock");
  await fs.mkdir(stockDir, { recursive: true });
  const cache = new Map();
  const usedIds = new Set();
  const clipsByBeat = [];
  const sources = [];
  const errors = [];

  for (let i = 0; i < finalScript.script_beats.length; i += 1) {
    const beat = finalScript.script_beats[i];
    const parsed = parseSecondsRange(beat.seconds);
    const segmentSeconds = parsed ? Math.max(parsed.end - parsed.start, 1.5) : 4;
    const queries = buildClipQueryCandidates(finalScript, beat, i);
    let selected = null;

    for (const query of queries) {
      if (!cache.has(query)) {
        try {
          const [pexels, pixabay] = await Promise.all([
            searchPexelsVideos(query).catch((error) => {
              errors.push(`Pexels search failed for "${query}": ${error.message}`);
              return [];
            }),
            searchPixabayVideos(query).catch((error) => {
              errors.push(`Pixabay search failed for "${query}": ${error.message}`);
              return [];
            })
          ]);
          cache.set(query, [...pexels, ...pixabay]);
        } catch (error) {
          errors.push(`Stock search failed for "${query}": ${error.message}`);
          cache.set(query, []);
        }
      }

      const candidates = cache.get(query) || [];
      if (!candidates.length) continue;
      selected = [...candidates].sort(
        (a, b) => scoreStockCandidate(b, segmentSeconds, usedIds) - scoreStockCandidate(a, segmentSeconds, usedIds)
      )[0];
      if (selected) break;
    }

    if (!selected) {
      clipsByBeat.push(null);
      continue;
    }

    const extension = path.extname(new URL(selected.downloadUrl).pathname) || ".mp4";
    const localPath = path.join(stockDir, `${String(i + 1).padStart(2, "0")}-${selected.id}${extension}`);
    try {
      await downloadStockClip(selected, localPath);
      usedIds.add(selected.id);
      const source = { ...selected, localPath };
      clipsByBeat.push(source);
      sources.push({
        beat: beat.beat,
        query: selected.query,
        provider: selected.providerLabel,
        credit: selected.credit,
        sourceUrl: selected.sourceUrl
      });
    } catch (error) {
      errors.push(`Download failed for beat ${beat.beat}: ${error.message}`);
      clipsByBeat.push(null);
    }
  }

  await fs.writeFile(path.join(runDir, "stock-sources.json"), JSON.stringify(sources, null, 2));
  if (errors.length) {
    await fs.writeFile(path.join(runDir, "stock-errors.json"), JSON.stringify(errors, null, 2));
  }
  return { clipsByBeat, sources, errors };
}

function buildVideoOverlayFilters({
  finalScript,
  beat,
  beatIndex,
  beatCount,
  duration,
  fontPath,
  theme,
  creditText
}) {
  const safePanel = escapeDrawtext(wrapText(beat.on_screen_text, 8));
  const progressExpr = `${(1080 / Math.max(duration, 1)).toFixed(3)}*t`;
  const memeStyle = isMemeStyle(finalScript);
  const safeTopLead = escapeDrawtext(buildTopLeadText(finalScript, beat));
  const safeSeriesTag = escapeDrawtext(buildSeriesTag(finalScript));

  const filters = memeStyle
    ? [
      `eq=brightness=-0.01:saturation=1.22:contrast=1.1`,
      `drawbox=x=0:y=0:w=iw:h=130:color=black@0.28:t=fill`,
      `drawbox=x=0:y=1760:w=iw:h=160:color=black@0.22:t=fill`,
      `drawtext=fontfile=${fontPath}:text='${safeTopLead}':fontcolor=#72ff7e:fontsize=40:borderw=3:bordercolor=black@0.96:x=(w-text_w)/2:y=38`,
      `drawtext=fontfile=${fontPath}:text='${safeSeriesTag}':fontcolor=#ff354d:fontsize=66:borderw=6:bordercolor=black@0.98:x=(w-text_w)/2:y=1652`,
      `drawbox=x=90:y=104:w=${progressExpr}:h=8:color=#72ff7e@0.96:t=fill`,
      `drawbox=x=48:y=520:w=984:h=260:color=#101010@0.72:t=fill:enable='between(t,0,0.55)'`,
      `drawtext=fontfile=${fontPath}:text='${safePanel}':fontcolor=#ffe55c:fontsize=92:borderw=6:bordercolor=black@0.98:x=(w-text_w)/2:y=600:enable='between(t,0,0.85)'`,
      `drawbox=x=0:y=0:w=iw:h=ih:color=white@0.1:t=fill:enable='between(mod(t,1.25),0,0.05)'`
    ]
    : [
      `eq=brightness=-0.02:saturation=1.05`,
      `drawbox=x=0:y=0:w=iw:h=360:color=black@0.42:t=fill`,
      `drawbox=x=0:y=1450:w=iw:h=470:color=black@0.36:t=fill`,
      `drawbox=x=76:y=180:w=150:h=10:color=${theme.accent}@0.96:t=fill`,
      `drawbox=x=76:y=1836:w=${progressExpr}:h=10:color=${theme.accent2}@0.96:t=fill`,
      `drawtext=fontfile=${fontPath}:text='${safePanel}':fontcolor=white:fontsize=124:line_spacing=8:borderw=4:bordercolor=black@0.62:x=76:y=214`
    ];

  return filters.join(",");
}

async function renderColorSegment({
  segmentPath,
  finalScript,
  beat,
  beatIndex,
  beatCount,
  segmentSeconds,
  fontPath,
  theme
}) {
  const filters = buildSegmentFilters({
    finalScript,
    beat,
    beatIndex,
    beatCount,
    duration: segmentSeconds,
    fontPath,
    theme
  });

  await execFileAsync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    `color=c=${theme.bg}:s=1080x1920:r=30:d=${segmentSeconds}`,
    "-vf",
    filters,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    segmentPath
  ]);
}

async function renderStockSegment({
  clip,
  segmentPath,
  finalScript,
  beat,
  beatIndex,
  beatCount,
  segmentSeconds,
  fontPath,
  theme
}) {
  const available = Math.max((clip.duration || segmentSeconds) - segmentSeconds - 0.2, 0);
  const startAt = available > 0 ? Math.min(available, beatIndex * 0.7) : 0;
  const memeStyle = isMemeStyle(finalScript);
  const filters = buildVideoOverlayFilters({
    finalScript,
    beat,
    beatIndex,
    beatCount,
    duration: segmentSeconds,
    fontPath,
    theme
  });

  const imageAsset = isImageAsset(clip.localPath);
  const filterGraph = memeStyle
    ? `[0:v]scale=1320:2346:force_original_aspect_ratio=increase,crop=1080:1920:x='(in_w-out_w)/2+42*sin(t*1.9)+24*sin(t*4.5)':y='(in_h-out_h)/2+28*cos(t*1.3)',${filters}[v]`
    : `[0:v]scale=1140:2025:force_original_aspect_ratio=increase,crop=1080:1920:x='(in_w-out_w)/2+18*sin(t*0.6)':y='(in_h-out_h)/2+14*cos(t*0.45)',${filters}[v]`;
  const ffmpegArgs = imageAsset
    ? [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-loop",
      "1",
      "-i",
      clip.localPath,
      "-t",
      String(segmentSeconds),
      "-filter_complex",
      filterGraph,
      "-map",
      "[v]",
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      segmentPath
    ]
    : [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      String(startAt),
      "-i",
      clip.localPath,
      "-t",
      String(segmentSeconds),
      "-filter_complex",
      filterGraph,
      "-map",
      "[v]",
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      segmentPath
    ];

  await execFileAsync("ffmpeg", ffmpegArgs);
}

async function renderVideo({ finalScript, runDir, voice, ttsProvider, allowTtsFallback, useSilentAudio = false }) {
  const narrationText = finalScript.script_beats.map((beat) => beat.voiceover).join("\n");
  const audioPath = path.join(runDir, "mixed-audio.mp3");
  const rawAudioPath = path.join(runDir, "narration-raw.mp3");
  const narrationPath = path.join(runDir, "narration.mp3");
  const bedPath = path.join(runDir, "bed.mp3");
  const assPath = path.join(runDir, "subtitles.ass");
  const videoPath = path.join(runDir, "shorts.mp4");
  const baseVideoPath = path.join(runDir, "base-visuals.mp4");
  const beatDuration = getVideoDuration(finalScript.script_beats);
  const fontPath = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc";
  const theme = pickTheme(finalScript.keyword);
  const memeStyle = isMemeStyle(finalScript);
  let ttsInfo = { provider: "silent", fallbackUsed: false };

  if (useSilentAudio) {
    await buildSilentAudio(audioPath, beatDuration);
  } else {
    ttsInfo = await synthesizeNarration({
      input: narrationText,
      outPath: rawAudioPath,
      voice,
      ttsProvider,
      allowTtsFallback
    });
    await normalizeAudio(rawAudioPath, narrationPath);
    if (memeStyle) {
      await buildMemeBed(bedPath, Math.max(beatDuration, 15));
    } else {
      await buildAmbientBed(bedPath, Math.max(beatDuration, 15));
    }
    await mixNarrationWithBed(narrationPath, bedPath, audioPath);
    await fs.writeFile(path.join(runDir, "tts-info.json"), JSON.stringify(ttsInfo, null, 2));
  }

  const ass = buildAss(finalScript);
  await fs.writeFile(assPath, ass);

  const audioDuration = (await probeDuration(audioPath)) || 0;
  const duration = Math.max(beatDuration, Math.ceil(audioDuration) + 1, 15);
  const segmentDir = path.join(runDir, "segments");
  await fs.mkdir(segmentDir, { recursive: true });
  const stockAssets = await resolveStockAssets({ finalScript, runDir });
  const assetSources = [];

  const segmentPaths = [];
  for (let i = 0; i < finalScript.script_beats.length; i += 1) {
    const beat = finalScript.script_beats[i];
    const parsed = parseSecondsRange(beat.seconds);
    if (!parsed) continue;
    const segmentSeconds = Math.max(parsed.end - parsed.start, 1.5);
    const segmentPath = path.join(segmentDir, `segment-${String(i + 1).padStart(2, "0")}.mp4`);
    const overridePath = resolveMaybeAbsolute(beat.local_asset_path);
    let selectedClip = stockAssets.clipsByBeat[i];

    if (overridePath && await pathExists(overridePath)) {
      selectedClip = {
        localPath: overridePath,
        duration: (await probeDuration(overridePath)) || segmentSeconds,
        provider: beat.asset_source_type || "owned",
        providerLabel: beat.asset_source_label || beat.asset_source_type || "local",
        sourceUrl: beat.asset_source_url || "",
        credit: beat.asset_credit || (beat.asset_source_type || "local")
      };
    }

    assetSources.push({
      beat: beat.beat,
      source_type: selectedClip?.provider || "generated_fallback",
      source_label: selectedClip?.providerLabel || "generated_fallback",
      local_asset_path: selectedClip?.localPath || null,
      source_url: selectedClip?.sourceUrl || null,
      credit: selectedClip?.credit || null,
      query: beat.stock_search_query || null
    });

    if (selectedClip?.localPath) {
      await renderStockSegment({
        clip: selectedClip,
        segmentPath,
        finalScript,
        beat,
        beatIndex: i,
        beatCount: finalScript.script_beats.length,
        segmentSeconds,
        fontPath,
        theme
      });
    } else {
      await renderColorSegment({
        segmentPath,
        finalScript,
        beat,
        beatIndex: i,
        beatCount: finalScript.script_beats.length,
        segmentSeconds,
        fontPath,
        theme
      });
    }
    segmentPaths.push(segmentPath);
  }

  const concatListPath = path.join(segmentDir, "segments.txt");
  const concatList = segmentPaths.map((filePath) => `file '${filePath.replace(/'/g, "'\\''")}'`).join("\n");
  await fs.writeFile(concatListPath, `${concatList}\n`);
  await fs.writeFile(path.join(runDir, "asset-sources.json"), JSON.stringify(assetSources, null, 2));

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
    concatListPath,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    baseVideoPath
  ]);

  await execFileAsync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    baseVideoPath,
    "-i",
    audioPath,
    "-vf",
    `subtitles=${assPath}`,
    "-t",
    String(duration),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    videoPath
  ]);

  return {
    audioPath,
    assPath,
    videoPath,
    ttsInfo,
    stockSources: stockAssets.sources,
    stockErrors: stockAssets.errors
  };
}

function toMarkdown(finalScript, review, stockSources = []) {
  const beats = finalScript.script_beats
    .map(
      (beat) =>
        `### Beat ${beat.beat} (${beat.seconds})\n- 내레이션: ${beat.voiceover}\n- 화면텍스트: ${beat.on_screen_text}\n- 화면연출: ${beat.visual_direction}\n- 스톡 검색어: ${beat.stock_search_query}`
    )
    .join("\n\n");

  const stockSection = stockSources.length
    ? stockSources.map((source) => `- Beat ${source.beat}: ${source.provider} / ${source.credit} / ${source.query} / ${source.sourceUrl}`).join("\n")
    : "- 없음";

  return `# ${finalScript.keyword}\n\n## 핵심 각도\n${finalScript.core_angle}\n\n## 신뢰도\n- ${finalScript.confidence_label}\n\n## 제목 후보\n${finalScript.title_options.map((v) => `- ${v}`).join("\n")}\n\n## 썸네일 문구 후보\n${finalScript.thumbnail_text_options.map((v) => `- ${v}`).join("\n")}\n\n## 훅\n${finalScript.hook}\n\n## 한 줄 요약\n${finalScript.summary}\n\n## 전체 스톡 검색어\n${(finalScript.stock_search_queries || []).map((v) => `- ${v}`).join("\n")}\n\n## 스크립트\n\n${beats}\n\n## CTA\n${finalScript.cta}\n\n## 캡션\n${finalScript.caption}\n\n## 해시태그\n${finalScript.hashtags.map((v) => `- ${v}`).join("\n")}\n\n## 검증 필요 주장\n${finalScript.claims_to_verify.length ? finalScript.claims_to_verify.map((v) => `- ${v}`).join("\n") : "- 없음"}\n\n## 부족한 사실\n${finalScript.missing_facts.length ? finalScript.missing_facts.map((v) => `- ${v}`).join("\n") : "- 없음"}\n\n## 사용된 스톡 소스\n${stockSection}\n\n## 검수 요약\n- 승인 여부: ${review.approved}\n- 점수: ${review.overall_score}\n- 요약: ${review.summary}\n`;
}

async function main() {
  await loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  const finalScriptImportPath = args["final-script-json"] ? path.resolve(args["final-script-json"]) : "";
  const reviewImportPath = args["review-json"] ? path.resolve(args["review-json"]) : "";
  const workerModel = process.env.SHORTS_WORKER_MODEL || "gpt-5.4";
  const reviewerModel = process.env.SHORTS_REVIEWER_MODEL || "gpt-5.4-mini";
  const voice = args.voice || process.env.SHORTS_TTS_VOICE || "coral";
  const ttsProvider = resolveTtsProvider(args);
  const allowTtsFallback = parseBool(args["allow-tts-fallback"], parseBool(process.env.SHORTS_ALLOW_TTS_FALLBACK, false));
  const apiKey = process.env.OPENAI_API_KEY;
  const mockMode = args.mock === "true" || !apiKey;

  const [workerPrompt, reviewerPrompt, scriptSchema, reviewSchema, importedFinalScript, importedReview, baseJob] = await Promise.all([
    readText(path.join(ROOT, "prompts/worker.md")),
    readText(path.join(ROOT, "prompts/reviewer.md")),
    readJson(path.join(ROOT, "schemas/script-schema.json")),
    readJson(path.join(ROOT, "schemas/review-schema.json")),
    finalScriptImportPath ? readJson(finalScriptImportPath) : Promise.resolve(null),
    reviewImportPath ? readJson(reviewImportPath) : Promise.resolve(null),
    finalScriptImportPath ? Promise.resolve(null) : buildJob(args)
  ]);

  const runKeyword = importedFinalScript?.keyword || baseJob?.keyword || "shorts";
  const runDir = path.join(RUNS_DIR, `${nowStamp()}-${slugify(runKeyword)}`);
  await fs.mkdir(runDir, { recursive: true });
  const job = baseJob ? await enrichJobWithYouTubeReferences(baseJob, runDir) : null;
  await fs.writeFile(
    path.join(runDir, "input.json"),
    JSON.stringify(
      importedFinalScript
        ? {
            mode: "final-script-import",
            final_script_json: finalScriptImportPath,
            review_json: reviewImportPath || null
          }
        : job,
      null,
      2
    )
  );

  if (importedFinalScript) {
    const finalScript = importedFinalScript;
    const review = importedReview || buildImportedReview(finalScript);
    await fs.writeFile(path.join(runDir, "draft.json"), JSON.stringify(finalScript, null, 2));
    await fs.writeFile(path.join(runDir, "review.json"), JSON.stringify(review, null, 2));
    await fs.writeFile(path.join(runDir, "final.json"), JSON.stringify(finalScript, null, 2));
    const rendered = await renderVideo({
      finalScript,
      runDir,
      voice,
      ttsProvider,
      allowTtsFallback,
      useSilentAudio: false
    });
    await fs.writeFile(path.join(runDir, "final.md"), toMarkdown(finalScript, review, rendered.stockSources));
    console.log(`완료: ${runDir}`);
    console.log(`- mode: final-script-import`);
    console.log(`- tts provider: ${rendered.ttsInfo.provider}`);
    if (rendered.ttsInfo.fallbackUsed) {
      console.log(`- tts fallback: ${rendered.ttsInfo.fallbackReason}`);
    }
    console.log(`- tts voice: ${voice}`);
    console.log(`- final.json`);
    console.log(`- final.md`);
    console.log(`- ${path.basename(rendered.audioPath)}`);
    console.log(`- ${path.basename(rendered.assPath)}`);
    console.log(`- ${path.basename(rendered.videoPath)}`);
    console.log(`- stock clips used: ${rendered.stockSources.length}`);
    return;
  }

  const draft = mockMode
    ? buildMockScript(job)
    : await callChatCompletion({
        model: workerModel,
        systemPrompt: workerPrompt,
        userPayload: {
          mode: "draft",
          job,
          output_contract: "반드시 스키마에 맞는 초안을 생성하라. 사실이 부족하면 claims_to_verify와 missing_facts에 남겨라."
        },
        schema: scriptSchema
      });

  await fs.writeFile(path.join(runDir, "draft.json"), JSON.stringify(draft, null, 2));

  const review = mockMode
    ? buildMockReview(draft)
    : await callChatCompletion({
        model: reviewerModel,
        systemPrompt: reviewerPrompt,
        userPayload: {
          job,
          draft,
          review_goal: "초안을 냉정하게 검수하고 승인 여부와 수정 지시를 만든다."
        },
        schema: reviewSchema
      });

  await fs.writeFile(path.join(runDir, "review.json"), JSON.stringify(review, null, 2));

  const finalScript = mockMode
    ? {
        ...draft,
        hook: review.suggested_hook_fix || draft.hook,
        title_options: [review.suggested_title_fix || draft.title_options[0], ...draft.title_options.slice(1)]
      }
    : await callChatCompletion({
        model: workerModel,
        systemPrompt: workerPrompt,
        userPayload: {
          mode: "revise",
          job,
          draft,
          review,
          output_contract: "검수 결과를 반영한 최종본을 다시 생성하라. critical_issues와 revision_tasks를 반드시 처리하라."
        },
        schema: scriptSchema
      });

  await fs.writeFile(path.join(runDir, "final.json"), JSON.stringify(finalScript, null, 2));
  const rendered = await renderVideo({
    finalScript,
    runDir,
    voice,
    ttsProvider,
    allowTtsFallback,
    useSilentAudio: false
  });
  await fs.writeFile(path.join(runDir, "final.md"), toMarkdown(finalScript, review, rendered.stockSources));

  console.log(`완료: ${runDir}`);
  console.log(`- mode: ${mockMode ? "mock" : "api"}`);
  console.log(`- tts provider: ${rendered.ttsInfo.provider}`);
  if (rendered.ttsInfo.fallbackUsed) {
    console.log(`- tts fallback: ${rendered.ttsInfo.fallbackReason}`);
  }
  console.log(`- tts voice: ${voice}`);
  console.log(`- draft.json`);
  console.log(`- review.json`);
  console.log(`- final.json`);
  console.log(`- final.md`);
  console.log(`- ${path.basename(rendered.audioPath)}`);
  console.log(`- ${path.basename(rendered.assPath)}`);
  console.log(`- ${path.basename(rendered.videoPath)}`);
  console.log(`- stock clips used: ${rendered.stockSources.length}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
