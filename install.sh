#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./install.sh --extension-id <chrome_extension_id> [options]

Options:
  --native-host-dir <path>  Override Chrome native host manifest directory.
  --feedback-dir <path>     Override feedback output directory. Default: ~/.claude/feedback
  --skills-dir <path>       Override Claude skills directory. Default: ~/.claude/skills
  -h, --help                Show this help text.
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION_ID=""
NATIVE_HOST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
FEEDBACK_DIR="$HOME/.claude/feedback"
SKILLS_DIR="$HOME/.claude/skills"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --extension-id)
      EXTENSION_ID="${2:-}"
      shift 2
      ;;
    --native-host-dir)
      NATIVE_HOST_DIR="${2:-}"
      shift 2
      ;;
    --feedback-dir)
      FEEDBACK_DIR="${2:-}"
      shift 2
      ;;
    --skills-dir)
      SKILLS_DIR="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$EXTENSION_ID" ]]; then
  echo "Missing required flag: --extension-id" >&2
  usage
  exit 1
fi

if [[ ! "$EXTENSION_ID" =~ ^[a-p]{32}$ ]]; then
  echo "Extension ID looks invalid: $EXTENSION_ID" >&2
  echo "Expected 32 lowercase characters in the range a-p." >&2
  exit 1
fi

HOST_SCRIPT_PATH="$SCRIPT_DIR/native-messaging/host.js"
HOST_TEMPLATE_PATH="$SCRIPT_DIR/native-messaging/com.claude.feedback.json"
HOST_MANIFEST_PATH="$NATIVE_HOST_DIR/com.claude.feedback.json"
SKILL_SOURCE_PATH="$SCRIPT_DIR/skills/feedback.md"
SKILL_TARGET_PATH="$SKILLS_DIR/feedback.md"

if [[ ! -f "$HOST_TEMPLATE_PATH" ]]; then
  echo "Missing host manifest template: $HOST_TEMPLATE_PATH" >&2
  exit 1
fi

if [[ ! -f "$HOST_SCRIPT_PATH" ]]; then
  echo "Missing host script: $HOST_SCRIPT_PATH" >&2
  exit 1
fi

if [[ ! -f "$SKILL_SOURCE_PATH" ]]; then
  echo "Missing skill template: $SKILL_SOURCE_PATH" >&2
  exit 1
fi

mkdir -p "$NATIVE_HOST_DIR" "$FEEDBACK_DIR" "$SKILLS_DIR"
chmod +x "$HOST_SCRIPT_PATH"

node - "$HOST_TEMPLATE_PATH" "$HOST_MANIFEST_PATH" "$HOST_SCRIPT_PATH" "$EXTENSION_ID" <<'NODE'
const fs = require("node:fs");

const [sourcePath, targetPath, hostScriptPath, extensionId] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
manifest.path = hostScriptPath;
manifest.allowed_origins = [`chrome-extension://${extensionId}/`];
fs.writeFileSync(targetPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
NODE

cp "$SKILL_SOURCE_PATH" "$SKILL_TARGET_PATH"

cat <<EOF
Redline installation complete.

Configured native host manifest:
  $HOST_MANIFEST_PATH

Feedback directory:
  $FEEDBACK_DIR

Installed skill:
  $SKILL_TARGET_PATH

Next:
  1. Load this directory as an unpacked extension in chrome://extensions
  2. Verify the extension ID matches the one passed to --extension-id
  3. Test capture from a localhost page
EOF
