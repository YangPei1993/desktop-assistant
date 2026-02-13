# manman (Codex)

A macOS floating desktop assistant built with Electron, with unified chat/automation/live-watch across CLI and cloud channels.

## Runtime Compatibility

- macOS only
- Node.js `>=18.14.1` (recommended: Node 20 LTS)
- npm `>=9`
- Electron `35.x` (managed in `devDependencies`)
- MCP runtime uses Electron embedded Node by default in app runtime (no system Node required for end users)
- Python 3 is required only when using `Settings -> Skills` install/create flows

## Features

- Always-on-top floating bubble button.
- Click bubble to open/hide a floating chat window on the current desktop.
- Multi-channel runtime in one window:
  - `CLI · Codex` (`codex exec` + `codex exec resume`)
  - `CLI · Claude`
  - `API · OpenAI/Azure/Custom`
- Desktop automation mode for app control (plan + execute until done).
- Live watch mode: continuously observe current screen and proactively point out issues/questions.
- Preconfigured Claude MCP desktop bundle:
  - `native-devtools-mcp` (screen/OCR/mouse/keyboard)
  - `applescript-mcp` (macOS app scripting)
  - `@playwright/mcp` (browser automation)
- Built-in settings tabs for:
  - API template/base/model/key
  - Live watch parameters
  - Skills management (install curated/GitHub skills, create/validate skills)
  - Agents + reusable workflows
  - macOS permissions diagnostics
- Inputs:
  - text
  - voice (speech-to-text in renderer)
  - image files (sent to Codex via `-i`)
  - file attachments (text files inlined; binary files summarized)
- Right-click bubble to quit.
- macOS system right-click integration via Quick Actions:
  - `Ask manman` (selected text)
  - `Ask manman Files` (selected files/images)

## Setup

1. Ensure Codex CLI works in terminal:

```bash
codex --version
```

2. Install dependencies:

```bash
cd /path/to/desktop-assistant
npm install
```

3. Configure environment:

```bash
cp .env.example .env
```

Optional env vars:

- `CLI_PROVIDER` (`codex` or `claude`, default `codex`)
- `RUNTIME_MODE` (`cli`/`api`, default `cli`)
- `CODEX_BIN` (default `codex`)
- `CODEX_MODEL` (empty = use Codex default)
- `CODEX_WORKDIR` (default = your home directory)
- `CODEX_TIMEOUT_MS` (default `300000`)
- `CLOUD_API_BASE_URL` (default `https://api.openai.com/v1`, OpenAI-compatible chat completions endpoint base)
- `CLOUD_API_MODEL` (default `gpt-4.1-mini`)
- `CLOUD_API_KEY` (default empty, can also use `OPENAI_API_KEY`)
- `CLOUD_API_TEMPLATE` (`openai`/`azure`/`custom`, default `openai`)
- `CLOUD_API_TIMEOUT_MS` (default `120000`)
- `CLOUD_API_REALTIME_ENABLED` (`true`/`false`, default `true`; enable realtime websocket path when model supports it)
- `CLOUD_API_REALTIME_CONNECT_TIMEOUT_MS` (default `8000`)
- `CLOUD_API_REALTIME_IDLE_CLOSE_MS` (default `45000`)
- `CLOUD_API_IMAGE_MAX_BYTES` (default `8388608`, inline image max bytes in API mode)
- `CLOUD_API_AUDIO_MODEL` (default `whisper-1`, used by Voice transcription)
- `CLOUD_API_AUDIO_MAX_BYTES` (default `26214400`, max uploaded voice size)
- `CLAUDE_BIN` (default `claude`)
- `CLAUDE_MODEL` (empty = Claude CLI default)
- `CLAUDE_TIMEOUT_MS` (default follows `CODEX_TIMEOUT_MS`)
- `CLAUDE_CHAT_TIMEOUT_MS` (default `120000`, applies to normal `Send` with Claude)
- `CLAUDE_CHAT_USE_MCP` (`true`/`false`, default `false`; enable MCP for normal `Send`)
- `CLAUDE_TOOLS` (default empty = no tools flag)
- `CLAUDE_PERMISSION_MODE` (optional, applies to regular Claude turns)
- `CLAUDE_AUTOMATION_PERMISSION_MODE` (default `bypassPermissions`, applies to Auto mode)
- `CLAUDE_MCP_CONFIG` (comma-separated MCP config file paths/JSON for Claude CLI; empty = use bundled config auto-generated from current app path; set `none` to disable MCP config)
- `MCP_NODE_BIN` (optional node binary override for MCP wrappers; default empty = use Electron embedded Node runtime)
- `PYTHON_BIN` (optional Python 3 binary override for skill installer/creator scripts)
- `CLI_MAX_TEXT_CHARS` (default `12000`)
- `AUTOMATION_PLAN_TIMEOUT_MS` (default `180000`)
- `AUTOMATION_MCP_TIMEOUT_MS` (default `120000`, timeout for MCP direct automation call)
- `AUTOMATION_PLAN_BATCH_STEPS` (default `3`, planner returns a small action batch each round)
- `AUTOMATION_UNREAD_MAX_CLICKS` (default `6`, max unread-badge heuristic clicks before planner fallback)
- `AUTOMATION_CAPTURE_SCOPE` (`window` or `full`, default `window` for faster runs)
- `AUTOMATION_ENGINE` (`auto`/`screen`/`mcp`, default `auto`)
- `LIVE_WATCH_INTERVAL_MS` (default `2500`)
- `LIVE_WATCH_ANALYZE_TIMEOUT_MS` (default `90000`, max ms for each cloud visual analysis round)
- `LIVE_WATCH_NOTIFY_COOLDOWN_MS` (default `8000`, minimum gap between proactive notifications)
- `LIVE_WATCH_IDLE_STATUS_COOLDOWN_MS` (default `12000`, idle heartbeat status interval)
- `LIVE_WATCH_MIN_CHANGE_DISTANCE` (default `0.015`, lower bound for perceptual frame-difference trigger)
- `LIVE_WATCH_MIN_CHANGE_RATIO` (default `0.06`, lower bound for changed-pixel ratio trigger)
- `LIVE_WATCH_SUMMARY_FRAMES` (default `3`)
- `LIVE_WATCH_MAX_IMAGE_MEMORY` (default `30`)
- `LIVE_WATCH_MAX_IMAGES_PER_ANALYSIS` (default `3`)
- `LIVE_WATCH_TEXT_ONLY_MAX_ROUNDS` (default `4`, number of text-only incremental live rounds before forced visual refresh)
- `LIVE_WATCH_ATTACHMENT_MAX_WIDTH` (default `1280`, image resize upper bound before upload)
- `LIVE_WATCH_ATTACHMENT_JPEG_QUALITY` (default `68`, JPEG quality used for live-watch image compression)

4. Start app:

```bash
npm start
```

5. Install macOS system right-click Quick Action (optional, recommended):

```bash
bash scripts/install_system_quick_action.sh
```

Then enable it if needed:

- `System Settings` -> `Keyboard` -> `Keyboard Shortcuts...` -> `Services`
- enable `Ask manman` and `Ask manman Files`

To remove Quick Actions later:

```bash
bash scripts/uninstall_system_quick_action.sh
```

## Development & Packaging

- `npm run check:runtime` -> validate Node/macOS compatibility
- `npm run dev` -> run Electron app in dev mode
- `npm start` -> run Electron app (same entry)
- `npm run pack` -> generate unpacked app bundle
- `npm run dist` -> build distributable macOS artifacts (`dmg` + `zip`)

## Usage

- Left click bubble: show/hide chat window.
- Right click bubble: quit app.
- In quick reply window:
  - Opened by clicking a bubble notification item
  - Type and press Enter to send quickly without changing main chat workflow
  - `Chat` button opens the full assistant chat window
- In chat window:
  - Top `Run` selector switches channels in one box (e.g. `CLI · Codex`, `CLI · Claude`, `API · OpenAI/Azure/Custom`)
  - Only available channels are shown (configured/ready ones)
  - Click `Settings` to configure API
  - `Settings -> About -> Open manman Product Homepage` opens a standalone product intro page with visual assets
  - `Settings -> API`: save default run channel and cloud API config
  - `Settings -> Live`: tune live-watch rolling context and analysis frequency
  - `Settings -> Skills`: refresh/install/create/validate Codex skills
  - `Settings -> Agents`: save agent/workflow presets and run workflows quickly
  - API settings support provider templates: `OpenAI` / `Azure OpenAI` / `Custom` (`Fill` button pre-fills defaults)
  - Configure `API base/model/key` and click `Save API`
  - Settings -> `Permissions` tab: check/request Microphone / Screen Recording / Accessibility and jump to macOS Settings directly
  - Top `Dir` row: `Pick` to choose a folder, or input path + `Apply` to switch CLI workdir
  - Type goal in input box and click `Auto` (next to `Send`) to let assistant operate desktop UI
  - Click `Live` to start continuous screen watching and proactive discussion
  - Click `Watching` to stop live watch
  - Enter to send
  - Shift+Enter newline
  - Attach button for files/images
  - Drag files into composer
  - Paste files from clipboard
  - Voice button to dictate speech into input text
- In other apps (system-level):
  - Select text (or select file/image in Finder) and right-click
  - Choose `Ask manman` (text) or `Ask manman Files` (files/images)
  - Assistant window opens and auto-sends the selected content

## Notes

- Voice prefers microphone recording + cloud transcription (OpenAI/Azure/custom API template), and falls back to browser speech recognition when cloud transcription is unavailable.
- API chat now supports streaming partial reply updates; UI no longer looks frozen while model is responding.
- Floating bubble now shows a waiting indicator while processing.
- When chat window is hidden/minimized, final reply/error is shown near bubble as persistent toast bubbles.
- Up to 3 toast bubbles are kept in chronological order; when full, the oldest rolls out.
- Quick reply window is anchored under the toast stack when opened from a toast item.
- If API model name contains `realtime` (for example `gpt-realtime`) and payload is text-only, app uses long-lived Realtime WebSocket transport automatically.
- Image files are passed to Codex as CLI image inputs.
- Conversation context is preserved through Codex thread resume until you click `Clear`.
- Desktop automation requires granting Accessibility permission in macOS Privacy settings.
- Voice input requires granting Microphone permission in macOS Privacy settings.
- Automation runs until planner returns `done` (no fixed step cap).
- `Send` respects runtime mode: `CLI` uses Codex/Claude CLI; `API` uses configured cloud endpoint.
- API template behavior: `openai/custom` uses `Authorization: Bearer`, `azure` uses `api-key` header.
- Realtime transport currently supports `openai` template only; image payloads still fallback to standard chat completions.
- Live watch follows current `Run` channel. In current implementation it is available when `Run` is set to `API`.
- Live watch runs in in-memory mode (no screenshot files written to disk) and requires configured cloud API.
- Live watch interval can be configured by env `LIVE_WATCH_INTERVAL_MS` (default `2500` ms).
- Live watch rolling window is configurable in `Settings -> Live` (`Rolling Context Frames`, `Max Images Per Analysis`).
- Live watch now uses compressed in-memory frames and performs incremental rolling analysis (latest frame + recent context frames).
- Live watch now uses two-tier scheduling: local high-frequency change detection + lower-frequency cloud visual analysis, with text-only incremental reasoning between visual rounds.
- Live watch is change-aware: compares current frame with previous frame and suppresses repeated conclusions when there is no meaningful change.
- If provider is Claude and MCP config is available (bundled default or `CLAUDE_MCP_CONFIG`), automation can run in MCP direct mode (faster, less screenshot-dependent).
- Normal `Send` with Claude does not attach MCP by default (set `CLAUDE_CHAT_USE_MCP=true` to enable).
- Auto mode now reports planning elapsed time and supports fallback to screen mode if MCP direct run fails (`AUTOMATION_ENGINE=auto`).
- Unread-message goals use a local red-badge detector first (chat apps), then fallback to planner.
- Reference MCP template is at `mcp/desktop-control.mcp.json`; runtime also supports bundled auto-generated MCP config without absolute paths.
- Packaged builds include MCP config + wrapper scripts (`scripts/mcp` / `mcp`) and use embedded Node runtime for MCP by default.
- Protocol deep-link used by system quick action: `manman://...` (legacy `desktopassistant://...` remains compatible).
- For MCP desktop control, macOS may prompt for:
  - Screen Recording
  - Accessibility
  - Automation (for AppleScript-controlled apps)
