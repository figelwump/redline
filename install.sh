#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./install.sh --extension-id <chrome_extension_id> [options]

Options:
  --native-host-dir <path>  Override Chrome native host manifest directory.
  --feedback-dir <path>     Override feedback output directory. Default: ~/.redline/feedback
  --install-command <target>  Install optional command prompt (target: claude|codex).
  --commands-dir <path>       Override command install directory for --install-command.
  -h, --help                Show this help text.
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION_ID=""
FEEDBACK_DIR="$HOME/.redline/feedback"
INSTALL_COMMAND_TARGET=""
COMMANDS_DIR=""

case "${OSTYPE:-}" in
  darwin*)
    NATIVE_HOST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    ;;
  linux*)
    NATIVE_HOST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
    ;;
  *)
    echo "Unsupported OS type: ${OSTYPE:-unknown}" >&2
    echo "Pass --native-host-dir to override explicitly if needed." >&2
    exit 1
    ;;
esac

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
    --install-command)
      INSTALL_COMMAND_TARGET="${2:-}"
      shift 2
      ;;
    --commands-dir)
      COMMANDS_DIR="${2:-}"
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

if [[ -n "$INSTALL_COMMAND_TARGET" && "$INSTALL_COMMAND_TARGET" != "claude" && "$INSTALL_COMMAND_TARGET" != "codex" ]]; then
  echo "Unsupported command target: $INSTALL_COMMAND_TARGET" >&2
  echo "Expected --install-command claude or --install-command codex." >&2
  exit 1
fi

if [[ -n "$INSTALL_COMMAND_TARGET" && -z "$COMMANDS_DIR" ]]; then
  if [[ "$INSTALL_COMMAND_TARGET" == "claude" ]]; then
    COMMANDS_DIR="$HOME/.claude/commands"
  else
    COMMANDS_DIR="$HOME/.codex/prompts"
  fi
fi

HOST_SCRIPT_PATH="$SCRIPT_DIR/native-messaging/host.js"
HOST_LAUNCHER_PATH="$SCRIPT_DIR/native-messaging/host-launcher.sh"
HOST_TEMPLATE_PATH="$SCRIPT_DIR/native-messaging/com.redline.feedback.json"
HOST_MANIFEST_PATH="$NATIVE_HOST_DIR/com.redline.feedback.json"
COMMAND_SOURCE_PATH="$SCRIPT_DIR/commands/redline.md"
COMMAND_TARGET_PATH="$COMMANDS_DIR/redline.md"
NODE_BIN_PATH="$(command -v node || true)"

if [[ ! -f "$HOST_TEMPLATE_PATH" ]]; then
  echo "Missing host manifest template: $HOST_TEMPLATE_PATH" >&2
  exit 1
fi

if [[ ! -f "$HOST_SCRIPT_PATH" ]]; then
  echo "Missing host script: $HOST_SCRIPT_PATH" >&2
  exit 1
fi

if [[ -z "$NODE_BIN_PATH" ]]; then
  echo "Node.js binary not found in PATH. Install Node.js and retry." >&2
  exit 1
fi

if [[ -n "$INSTALL_COMMAND_TARGET" && ! -f "$COMMAND_SOURCE_PATH" ]]; then
  echo "Missing command template: $COMMAND_SOURCE_PATH" >&2
  exit 1
fi

mkdir -p "$NATIVE_HOST_DIR" "$FEEDBACK_DIR"
chmod 700 "$FEEDBACK_DIR"

if [[ -n "$INSTALL_COMMAND_TARGET" ]]; then
  mkdir -p "$COMMANDS_DIR"
  chmod 700 "$COMMANDS_DIR"
fi

chmod +x "$HOST_SCRIPT_PATH"
"$NODE_BIN_PATH" --check "$HOST_SCRIPT_PATH" >/dev/null

cat > "$HOST_LAUNCHER_PATH" <<EOF
#!/bin/bash
exec "$NODE_BIN_PATH" "$HOST_SCRIPT_PATH"
EOF
chmod +x "$HOST_LAUNCHER_PATH"

"$NODE_BIN_PATH" - "$HOST_TEMPLATE_PATH" "$HOST_MANIFEST_PATH" "$HOST_LAUNCHER_PATH" "$EXTENSION_ID" <<'NODE'
const fs = require("node:fs");

const [sourcePath, targetPath, hostScriptPath, extensionId] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
manifest.path = hostScriptPath;
manifest.allowed_origins = [`chrome-extension://${extensionId}/`];
fs.writeFileSync(targetPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
NODE

if [[ -n "$INSTALL_COMMAND_TARGET" ]]; then
  cp "$COMMAND_SOURCE_PATH" "$COMMAND_TARGET_PATH"
fi

if [[ ! -f "$HOST_MANIFEST_PATH" ]]; then
  echo "Failed to create host manifest at $HOST_MANIFEST_PATH" >&2
  exit 1
fi

if [[ -n "$INSTALL_COMMAND_TARGET" && ! -f "$COMMAND_TARGET_PATH" ]]; then
  echo "Failed to install command file at $COMMAND_TARGET_PATH" >&2
  exit 1
fi

"$NODE_BIN_PATH" -e '
const fs = require("node:fs");
const [manifestPath, hostScriptPath, extensionId] = process.argv.slice(1);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (manifest.path !== hostScriptPath) {
  throw new Error(`Manifest path mismatch: ${manifest.path}`);
}
const expectedOrigin = `chrome-extension://${extensionId}/`;
if (!Array.isArray(manifest.allowed_origins) || !manifest.allowed_origins.includes(expectedOrigin)) {
  throw new Error("Manifest allowed_origins missing expected extension origin.");
}
' "$HOST_MANIFEST_PATH" "$HOST_LAUNCHER_PATH" "$EXTENSION_ID"

cat <<EOF
Redline installation complete.

Configured native host manifest:
  $HOST_MANIFEST_PATH

Feedback directory:
  $FEEDBACK_DIR

Installed command:
  $(if [[ -n "$INSTALL_COMMAND_TARGET" ]]; then printf '%s (%s)' "$COMMAND_TARGET_PATH" "$INSTALL_COMMAND_TARGET"; else printf '%s' "(skipped)"; fi)

Next:
  1. Load this directory as an unpacked extension in chrome://extensions
  2. Verify the extension ID matches the one passed to --extension-id
  3. Test capture from a localhost page
EOF
