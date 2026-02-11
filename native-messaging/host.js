#!/usr/bin/env node

const { decodeNativeMessages, encodeNativeMessage, saveFeedbackMessage } = require("./lib");

function writeNativeResponse(response) {
  process.stdout.write(encodeNativeMessage(response));
}

function safeErrorMessage(error) {
  return error instanceof Error ? error.message : "Unexpected native host error";
}

let bufferedInput = Buffer.alloc(0);

process.stdin.on("data", (chunk) => {
  bufferedInput = Buffer.concat([bufferedInput, chunk]);

  let decoded;
  try {
    decoded = decodeNativeMessages(bufferedInput);
  } catch (error) {
    writeNativeResponse({
      success: false,
      error: safeErrorMessage(error),
    });
    bufferedInput = Buffer.alloc(0);
    return;
  }

  bufferedInput = decoded.remaining;

  decoded.messages.forEach((message) => {
    try {
      const result = saveFeedbackMessage(message);
      writeNativeResponse(result);
    } catch (error) {
      writeNativeResponse({
        success: false,
        error: safeErrorMessage(error),
      });
    }
  });
});

process.stdin.on("end", () => {
  process.exit(0);
});
