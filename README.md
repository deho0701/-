# shorts-keyword-agents

롱폼 영상 또는 키워드 입력을 받아 한국어 Shorts/TikTok/Reels용 세로 영상을 만드는 로컬 CLI입니다.

핵심 기능:
- 유튜브 롱폼 다운로드
- `faster-whisper` 전사
- 전사 기반 `hook -> setup -> body -> payoff` 재구성
- GPT 수동 개입용 packet export
- 원본 화면 유지 + 한국어 TTS/자막 재렌더
- 키워드만으로 새 쇼츠 생성
- 무료 스톡 검색과 fallback 프롬프트 생성

## 바로 쓰는 방법

```bash
git clone <YOUR_REPO_URL>
cd shorts-keyword-agents
./scripts/bootstrap.sh
./scripts/install_codex_skill.sh
```

필수 시스템 의존성:
- Node.js 18+
- Python 3.10+
- ffmpeg

권장:
- mpv

파이썬 패키지는 `bootstrap.sh`가 `.venv`에 설치합니다.  
이 프로젝트는 `.venv/bin/python`, `.venv/bin/yt-dlp`를 자동으로 우선 사용하므로, clone 후 별도 PATH 수정 없이 바로 실행됩니다.

## 자주 쓰는 명령

의존성 점검:

```bash
./scripts/doctor.sh
```

문법 체크:

```bash
npm run check
```

유튜브 롱폼 분석:

```bash
node split-longform-into-shorts.mjs \
  --youtube "https://www.youtube.com/watch?v=VIDEO_ID" \
  --count 4 \
  --min-duration 24 \
  --max-duration 42 \
  --target-duration 32 \
  --template vibrant \
  --asr-model small \
  --strategy recompose
```

GPT에 넘길 구조화 packet만 뽑기:

```bash
node split-longform-into-shorts.mjs \
  --youtube "https://www.youtube.com/watch?v=VIDEO_ID" \
  --strategy external-gpt \
  --count 4 \
  --asr-model small
```

하이브리드 렌더:

```bash
node render-hybrid-source-shorts.mjs \
  --video "/path/to/video.mp4" \
  --packet-json "/path/to/gpt-hybrid-script-packet.json" \
  --hybrid-script-json "/path/to/gpt-hybrid-script-response.json" \
  --tts-provider edge
```

키워드 기반 새 쇼츠:

```bash
node generate-shorts.mjs --keyword "불면증" --mock
```

## 환경 변수

`.env.example`를 복사해 `.env`로 쓰면 됩니다.

주요 값:
- `OPENAI_API_KEY`
- `SHORTS_LLM_API_KEY`
- `PEXELS_API_KEY`
- `PIXABAY_API_KEY`
- `SHORTS_TTS_PROVIDER`
- `SHORTS_TTS_VOICE`
- `SHORTS_ASR_MODEL`

## 저장소에 포함하지 않는 것

아래는 `.gitignore`로 제외됩니다.
- `runs/`
- `.env`
- `.venv/`
- 대용량 산출 영상/오디오

즉 GitHub에는 재사용 가능한 코드, 프롬프트, 스키마, 예시, 설치 스크립트, 그리고 바로 테스트 가능한 작은 데모 소스풀(`assets/source-pools/`)이 올라갑니다.

## Codex skill 설치

다른 컴퓨터에서 Codex가 바로 이 워크플로를 쓰게 하려면:

```bash
./scripts/install_codex_skill.sh
```

이 스크립트는 현재 clone 경로를 기준으로 `~/.codex/skills/shorts-recomposer/SKILL.md`를 생성합니다.

## GitHub에 올리는 순서

```bash
git init
git add .
git commit -m "Prepare portable shorts pipeline"
```

그다음 원격 저장소 연결:

```bash
git remote add origin <YOUR_GITHUB_REPO_URL>
git branch -M main
git push -u origin main
```
