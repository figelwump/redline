# Redline

Redline is a Chrome extension for visual UI feedback. It lets you draw boxes, add text callouts, and save an annotated screenshot to your local machine.

## What It Does

- Toggles annotation mode on the current tab.
- Draws rectangle highlights.
- Adds text callouts anchored to points on the page.
- Captures the visible tab with annotations.
- Saves screenshots and metadata to `~/.redline/feedback`.

## Requirements

- macOS or Linux
- Google Chrome
- Node.js 18+ (used by the native messaging host)

## Install

1. Clone this repo.
2. Load the extension as unpacked:
   - Open `chrome://extensions`
   - Enable Developer mode
   - Click **Load unpacked**
   - Select this repository directory
3. Copy the extension ID from the Redline card in `chrome://extensions`.
4. Run the installer:

```bash
./install.sh --extension-id <your_extension_id>
```

Optional: install the Codex skill helper file too.

```bash
./install.sh --extension-id <your_extension_id> --install-skill
```

## Usage

1. Open a page to annotate.
2. Click the Redline extension action button.
3. Use toolbar controls:
   - Rectangle
   - Text
   - Clear
   - Send
4. Press **Send** to capture and store the screenshot.
5. Find output in `~/.redline/feedback`:
   - `feedback-<timestamp>.png`
   - `latest.json`

## Keyboard Shortcuts

- `r`: rectangle tool
- `t`: text tool
- `x`: clear annotations
- `Shift+Enter`: send capture
- `Escape`: remove focused annotation, then exit annotation mode

## Development

Install dependencies:

```bash
npm ci
```

Run tests:

```bash
npm test
```

## Project Layout

- `manifest.json`: Chrome extension manifest
- `background.js`: extension service worker
- `content.js`: annotation UI logic
- `content.css`: annotation UI styles
- `native-messaging/host.js`: native messaging entry point
- `native-messaging/lib.js`: native messaging and file-writing helpers
- `install.sh`: native host installer
- `test/`: unit and behavior tests
