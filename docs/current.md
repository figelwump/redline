# Redline - Page Annotation Chrome Extension

## Context

When developing a web UI locally, there's no fast way to visually annotate what's wrong and send that to a coding agent. This extension lets you draw rectangles and place text callouts on any page, then saves an annotated screenshot to `~/.redline/feedback/`. A `/redline` command prompt can pull the latest screenshot into the conversation.

Primary target is local development. The repo should still be open-source friendly so other developers can install it on their own machines with minimal manual tweaks.

## Architecture

### User flow

1. Click extension icon → toggles **annotation mode** on the current tab
2. A floating toolbar appears: `[Rectangle] [Text] [Clear] [Send]`
3. A full-page transparent overlay captures mouse events for drawing
4. **Rectangle tool**: click + drag to draw colored rectangles (red border, semi-transparent fill)
5. **Text tool**: click anywhere → a red dot appears at the click point, connected by a short line to an expandable pill. The pill is editable - type your feedback, click elsewhere or press Enter to commit.
6. **Send**: hides toolbar → captures visible tab screenshot → saves to `~/.redline/feedback/feedback-{timestamp}.png` → writes `~/.redline/feedback/latest.json` → shows confirmation toast with saved path
7. Click extension icon again or press Escape to exit annotation mode

### Key design decisions

- **Annotations are DOM elements** (absolutely positioned divs), not canvas. `chrome.tabs.captureVisibleTab()` captures them as part of the visible page. No compositing step needed.
- **Viewport-relative annotations are intentional (for now)**: annotations are pinned to the current viewport, not to full-document coordinates. This keeps implementation simple and matches capture of the visible tab.
- **Least-privilege extension scope**: inject scripts only when the user clicks the extension action on a tab (no always-on `<all_urls>` content script).
- **Scroll pass-through**: overlay intercepts clicks for drawing but passes scroll events so you can scroll while annotating.
- **Native Messaging Host**: a tiny Node script writes directly to `~/.redline/feedback/`. The extension sends the PNG data URL + metadata, the native host writes the file. No downloads directory detour.

### Agent notification: `/redline` command prompt

A command prompt at `commands/redline.md` that:
- Reads `~/.redline/feedback/latest.json` to get the latest screenshot path, URL, and timestamp
- Tells the agent to read the screenshot image at that path
- The agent sees the annotated page and can act on the feedback

## Components

### 1. Chrome Extension

```
redline/
├── manifest.json          # Manifest V3
├── background.js          # Service worker: toggle mode, capture screenshot
├── content.js             # Annotation overlay, drawing, toolbar
├── content.css            # Styles
├── native-messaging/
│   ├── host.js            # Node.js native messaging host - writes files to ~/.redline/feedback/
│   └── com.redline.feedback.json  # Native messaging host manifest
├── install.sh             # Sets up native messaging host + feedback directory + optional command prompt install
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### 2. Command Prompt Template

```
commands/redline.md
```

## Detailed Design

### manifest.json
- Manifest V3
- Permissions: `activeTab`, `nativeMessaging`, `scripting`
- No always-on `content_scripts`; inject `content.js` + `content.css` into the active tab when extension icon is clicked
- `background.service_worker`: `background.js`
- `action`: click handler (no popup)

### background.js
- `chrome.action.onClicked`:
  1. Ensures `content.js` + `content.css` are injected in the active tab
  2. Sends `toggle` message to content script
- Listens for `"capture"` message from content script:
  1. `chrome.tabs.captureVisibleTab(null, { format: 'png' })` → data URL
  2. Sends data URL + metadata to native messaging host
  3. Host writes PNG + `latest.json` to `~/.redline/feedback/`
  4. Returns file path to content script
  5. Content script shows toast with file path

### content.js

**State:**
- `annotationMode: boolean`
- `currentTool: 'rectangle' | 'text'`
- `annotations: Array<RectAnnotation | TextAnnotation>`

**DOM structure:**
```
#pf-overlay (position: fixed, full viewport, z-index: 2147483646)
  #pf-toolbar (top-right, z-index: 2147483647)
    [Rectangle] [Text] [Clear] [Send]
  .pf-rect-annotation (red bordered rectangles)
  .pf-text-annotation (dot + connector line + pill)
```

**Rectangle drawing:**
- mousedown → record start point, create rect div
- mousemove → update rect size (position: absolute, border: 2px solid red, background: rgba(255,0,0,0.1))
- mouseup → finalize

**Text callout:**
- click → create annotation group:
  - `.pf-dot`: 10px red circle at click point
  - `.pf-connector`: thin red line (8-12px) connecting dot to pill
  - `.pf-pill`: rounded pill (border-radius: 12px, red background, white text, contenteditable)
- Pill auto-focuses for typing
- Enter or click-away commits (removes contenteditable, keeps display)
- Pill has min-width, expands with content

**Send flow:**
1. Hide `#pf-toolbar`
2. Send `"capture"` to background
3. Background captures tab → sends to native host → host writes files
4. Show toast with file path

### native-messaging/host.js
- Reads messages from stdin (Chrome native messaging protocol: 4-byte length prefix + JSON)
- Receives `{ action: "save", dataUrl: "data:image/png;base64,...", metadata: { url, timestamp } }`
- Decodes base64, writes PNG to `~/.redline/feedback/feedback-{timestamp}.png`
- Writes `~/.redline/feedback/latest.json`: `{ path, url, timestamp }`
- Responds with `{ success: true, path }`

### content.css
- Overlay: `position: fixed; inset: 0; z-index: 2147483646; cursor: crosshair;`
- Toolbar: frosted glass style, `backdrop-filter: blur(10px); background: rgba(0,0,0,0.7); border-radius: 8px; padding: 8px;`
- Tool buttons: icon-style, highlight when active
- Rectangles: `border: 2px solid #ff3333; background: rgba(255,51,51,0.1);`
- Text dot: `width: 10px; height: 10px; border-radius: 50%; background: #ff3333;`
- Text connector: `width: 2px; height: 12px; background: #ff3333;`
- Text pill: `background: #ff3333; color: white; border-radius: 12px; padding: 4px 12px; font-size: 14px; font-weight: 600;`

### commands/redline.md

```markdown
---
name: redline
description: Pick up the latest Redline annotated screenshot and start working on the feedback
---

Read the file at ~/.redline/feedback/latest.json to get the path and metadata of the latest feedback screenshot. Then read the screenshot image at that path and describe what you see - the user has annotated a web page with rectangles and text callouts to give you visual feedback.
```

## Installation

1. Build extension (no build step needed - plain JS)
2. Load unpacked in `chrome://extensions`
3. Install native messaging host:
   - Copy `com.redline.feedback.json` to `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`
   - Update the `path` field to point to `host.js`
   - Update `allowed_origins` to include your installed extension ID (from `chrome://extensions`)
   - `chmod +x host.js`
4. Optional command prompt install:
   - Claude: copy `commands/redline.md` to `~/.claude/commands/redline.md`
   - Codex: copy `commands/redline.md` to `~/.codex/prompts/redline.md`
5. Create `~/.redline/feedback/` directory

Or run `./install.sh` which automates all of the above.

## Automated Testing Plan

Use Node's built-in test runner (`node --test`) so setup stays minimal for local-dev contributors.

### Test layout

```
redline/
├── test/
│   ├── host.protocol.test.js      # Native messaging framing (length prefix + JSON)
│   ├── host.storage.test.js       # Writes PNG + latest.json to temp dir
│   ├── content.behavior.test.js   # Tool mode changes, annotation lifecycle
│   └── e2e.capture.test.js        # Optional smoke test with unpacked extension
└── package.json                   # `test` script and dev deps
```

### Unit tests

- `host.protocol.test.js`
  - Valid framed message is parsed.
  - Invalid length / malformed JSON is rejected with error response.
- `host.storage.test.js`
  - Base64 PNG payload writes an image file.
  - `latest.json` is updated atomically with `{ path, url, timestamp }`.
  - Path traversal attempts in filename inputs are rejected.
- `content.behavior.test.js` (JSDOM)
  - Toggle creates/removes overlay and toolbar.
  - Rectangle flow creates one finalized rectangle element.
  - Text flow creates dot + connector + pill and commits on Enter/click-away.
  - Send hides toolbar before capture request and restores UI after completion.

### Integration / E2E smoke

- `e2e.capture.test.js` (Playwright or Puppeteer, optional in CI)
  - Load extension unpacked.
  - Open a local fixture page.
  - Create one rectangle + one text callout.
  - Trigger Send and assert that a new PNG and `latest.json` appear in test output directory.

### CI checks

- Run on every PR:
  - `node --test`
  - lint (if configured)
- Run E2E smoke as:
  - required on `main` branch merges, or
  - optional/manual until stabilized (to avoid flaky gate early on)

## Verification

1. Load extension in Chrome
2. Navigate to any localhost page
3. Click extension icon → toolbar appears
4. Draw a rectangle around something
5. Click Text tool, click on page → dot + pill appears, type feedback
6. Click Send
7. Check `~/.claude/feedback/` for PNG + latest.json
8. In Claude Code, type `/feedback` → agent should read and describe the annotated screenshot

## Execution Notes

### 2026-02-11 - Chunk 1 (core extension scaffold)

- Added `manifest.json` with MV3 action-based injection permissions (`activeTab`, `scripting`, `nativeMessaging`).
- Implemented `background.js` toggle injection flow and capture relay to native messaging host (`com.claude.feedback`).
- Implemented `content.js` annotation mode lifecycle, rectangle drawing, text callouts, clear/send actions, toast feedback, and Escape-to-exit.
- Added `content.css` for overlay, toolbar, annotation visuals, and toast states.
- Validation run:
  - `node --check background.js`
  - `node --check content.js`
  - JSON parse check for `manifest.json`

### 2026-02-11 - Chunk 1 Claude review reconciliation

- Reviewer run completed with `claude` reviewer sub-agent (change-set mode).
- Accepted and implemented:
  - Clear pending toast timeout during annotation-mode teardown.
  - Add explicit capture error handling and payload validation in `background.js`.
  - Add defensive selection handling in `focusEditable`.
  - Add text length guard for text pills (280 character cap).
- Rejected with rationale:
  - `return true` in synchronous message handlers: not required for current synchronous `sendResponse` usage.
  - Focus-microtask deferral: not needed after adding defensive focus/selection handling.
  - `spellcheck` claim: existing `pill.spellcheck = false` usage is valid.
  - `backdrop-filter` support warning: non-blocking cosmetic concern for MVP.
- Validation run after fixes:
  - `node --check background.js`
  - `node --check content.js`

### 2026-02-11 - Chunk 2 (native messaging host)

- Added `native-messaging/lib.js` with:
  - Native message framing decode/encode helpers.
  - PNG data URL decoding and validation.
  - Feedback file write + atomic `latest.json` update.
- Added `native-messaging/host.js` (Node stdio native host entrypoint).
- Added `native-messaging/com.claude.feedback.json` host manifest template.
- Validation run:
  - `node --check native-messaging/lib.js`
  - `node --check native-messaging/host.js`
  - End-to-end host smoke test with framed stdin/stdout message exchange.

### 2026-02-11 - Chunk 2 Claude review reconciliation

- Reviewer run completed with `claude` reviewer sub-agent (change-set mode).
- Accepted and implemented:
  - Avoid PNG overwrite on timestamp collisions by suffixing duplicate filenames.
  - Improve `latest.json` atomic write failure handling with temp-file cleanup and contextual error.
  - Explicitly validate `message.dataUrl` presence/type early.
  - Add stderr host error logging.
  - Remove explicit `process.exit(0)` on stdin end and allow natural process shutdown.
- Rejected with rationale:
  - Batch message-count DoS concern: framing + max-byte guard already bounds input size for this host.
  - Origin validation in host code: handled by Chrome native host manifest `allowed_origins`.
  - URL metadata sanitization/path traversal concern: metadata URL is stored only as opaque JSON value, never used as filesystem path.
- Validation run after fixes:
  - `node --check native-messaging/lib.js`
  - `node --check native-messaging/host.js`
  - Host collision smoke test (same timestamp twice) confirmed unique output files.

### 2026-02-11 - Chunk 3 (installation automation + command template)

- Added `install.sh` to automate:
  - Native host manifest generation with extension ID origin.
  - Native host executable permissions.
  - Feedback directory creation.
  - Optional command prompt install from `commands/redline.md`.
- Added `commands/redline.md` template source in-repo.
- Validation run:
  - `bash -n install.sh`
  - Full install simulation in temp home directory with generated manifest/command checks.

### 2026-02-11 - Chunk 3 Claude review reconciliation

- Reviewer run completed with `claude` reviewer sub-agent (change-set mode).
- Accepted and implemented:
  - OS-aware default native host path (`darwin` + `linux`) with explicit unsupported-OS error.
  - Directory permission hardening for feedback/command directories (`700`).
  - Host script syntax check (`node --check`) before completion.
  - Post-install validation for manifest path/origin and required output files.
- Rejected with rationale:
  - Extracting inline Node manifest generation into separate file: unnecessary for current script size/scope.
  - Extension ID runtime existence validation: not deterministically available in a local shell installer.
  - Auto-backup prompts on re-run: script is intentionally idempotent and deterministic by overwrite.
- Validation run after fixes:
  - `bash -n install.sh`
  - Temp-home install simulation including permission/matching-manifest assertions.

### 2026-02-11 - Chunk 4 (host unit test harness)

- Added `package.json` with Node built-in test runner entry (`npm test` -> `node --test`).
- Added host unit tests:
  - `test/host.protocol.test.js` for framing decode/encode and malformed payload handling.
  - `test/host.storage.test.js` for PNG writes, `latest.json` updates, collision handling, and validation errors.
- Added `.gitignore` for `node_modules/`.
- Validation run:
  - `npm test` (10 tests passing).

### 2026-02-11 - Chunk 4 Claude review reconciliation

- Reviewer run completed with `claude` reviewer sub-agent (change-set mode).
- Accepted and implemented:
  - Added zero-length frame rejection coverage.
  - Added explicit PNG magic-byte assertion for written files.
  - Added missing-metadata fallback behavior test.
  - Improved one test title to clarify oversized-length behavior.
- Rejected with rationale:
  - "Missing module implementation" finding was incorrect (tests already run/passed against existing module).
  - Time-mocking/concurrency concerns are low for current synchronous host implementation and deterministic timestamp-injected tests.
  - Additional install-script concerns from this review were out-of-scope for this chunk.
- Validation run after fixes:
  - `npm test` (10 tests passing).

### 2026-02-11 - Chunk 5 (content behavior tests)

- Added `test/content.behavior.test.js` using JSDOM to cover:
  - overlay/toolbar toggle lifecycle
  - rectangle drawing flow
  - text callout creation + Enter/blur commit
  - send-button pending/restore UI behavior
- Added `jsdom` dev dependency to support browser-like DOM tests.
- Validation run:
  - `npm test` (14 tests passing).

### 2026-02-11 - Chunk 5 Claude review reconciliation

- Reviewer run completed with `claude` reviewer sub-agent (change-set mode).
- Accepted and implemented:
  - Explicit guard that `content.js` registered runtime message listener in harness setup.
  - Stronger rectangle geometry assertions (`left/top/width/height`).
  - Text callout persistence assertion after commit (`pill.textContent`).
  - More defensive cleanup ordering with `try/finally` to ensure global restoration.
- Rejected with rationale:
  - Parallel global-race concerns are overstated for current test-runner execution model in this suite.
  - "Missing content script validation" as a blocker was incorrect; script load already fails hard in setup.
  - Additional mouse event field expansion (`pageX/buttons`) was not needed for current content script semantics.
- Validation run after fixes:
  - `npm test` (14 tests passing).
