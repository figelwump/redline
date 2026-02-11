const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const MAX_NATIVE_MESSAGE_BYTES = 10 * 1024 * 1024;

function defaultFeedbackDirectory() {
  return path.join(os.homedir(), ".claude", "feedback");
}

function parsePngDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") {
    throw new Error("dataUrl must be a string.");
  }

  const match = dataUrl.match(/^data:image\/png;base64,(.+)$/);
  if (!match) {
    throw new Error("dataUrl must be a PNG data URL.");
  }

  const payload = match[1];
  const pngBuffer = Buffer.from(payload, "base64");
  if (pngBuffer.length === 0) {
    throw new Error("PNG payload was empty.");
  }

  return pngBuffer;
}

function formatTimestamp(timestamp) {
  const parsed = timestamp ? new Date(timestamp) : new Date();
  const effectiveDate = Number.isNaN(parsed.valueOf()) ? new Date() : parsed;
  return effectiveDate.toISOString().replace(/[:.]/g, "-");
}

function buildFeedbackPath(feedbackDir, timestamp) {
  return path.join(feedbackDir, `feedback-${formatTimestamp(timestamp)}.png`);
}

function ensureDirectory(feedbackDir) {
  fs.mkdirSync(feedbackDir, { recursive: true });
}

function writeLatestJson(latestPath, payload) {
  const tempPath = `${latestPath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tempPath, latestPath);
}

function saveFeedbackMessage(message, options = {}) {
  if (message?.action !== "save") {
    throw new Error("Unsupported action. Expected action='save'.");
  }

  const feedbackDir = options.feedbackDir ?? process.env.REDLINE_FEEDBACK_DIR ?? defaultFeedbackDirectory();
  ensureDirectory(feedbackDir);

  const pngBuffer = parsePngDataUrl(message.dataUrl);
  const metadata = message.metadata ?? {};
  const timestamp = metadata.timestamp ?? metadata.capturedAt ?? new Date().toISOString();

  const outputPath = buildFeedbackPath(feedbackDir, timestamp);
  fs.writeFileSync(outputPath, pngBuffer);

  const latestPath = path.join(feedbackDir, "latest.json");
  writeLatestJson(latestPath, {
    path: outputPath,
    url: metadata.url ?? metadata.tabUrl ?? null,
    timestamp,
  });

  return {
    success: true,
    path: outputPath,
  };
}

function encodeNativeMessage(message) {
  const messageBuffer = Buffer.from(JSON.stringify(message), "utf8");
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32LE(messageBuffer.length, 0);
  return Buffer.concat([lengthBuffer, messageBuffer]);
}

function decodeNativeMessages(buffer) {
  const decodedMessages = [];
  let cursor = 0;

  while (buffer.length - cursor >= 4) {
    const messageLength = buffer.readUInt32LE(cursor);
    if (messageLength <= 0 || messageLength > MAX_NATIVE_MESSAGE_BYTES) {
      throw new Error(`Invalid native message length: ${messageLength}`);
    }

    if (buffer.length - cursor < 4 + messageLength) {
      break;
    }

    const payloadStart = cursor + 4;
    const payloadEnd = payloadStart + messageLength;
    const payloadBuffer = buffer.subarray(payloadStart, payloadEnd);
    const payloadText = payloadBuffer.toString("utf8");

    let parsed;
    try {
      parsed = JSON.parse(payloadText);
    } catch (_error) {
      throw new Error("Received malformed JSON payload from Chrome.");
    }

    decodedMessages.push(parsed);
    cursor = payloadEnd;
  }

  return {
    messages: decodedMessages,
    remaining: buffer.subarray(cursor),
  };
}

module.exports = {
  MAX_NATIVE_MESSAGE_BYTES,
  decodeNativeMessages,
  defaultFeedbackDirectory,
  encodeNativeMessage,
  parsePngDataUrl,
  saveFeedbackMessage,
};
