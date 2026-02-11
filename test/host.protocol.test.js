const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MAX_NATIVE_MESSAGE_BYTES,
  decodeNativeMessages,
  encodeNativeMessage,
} = require("../native-messaging/lib");

test("encodeNativeMessage + decodeNativeMessages roundtrip", () => {
  const message = {
    action: "save",
    metadata: {
      url: "http://localhost:3000",
    },
  };

  const framed = encodeNativeMessage(message);
  const decoded = decodeNativeMessages(framed);

  assert.equal(decoded.messages.length, 1);
  assert.deepEqual(decoded.messages[0], message);
  assert.equal(decoded.remaining.length, 0);
});

test("decodeNativeMessages leaves incomplete payload in remaining buffer", () => {
  const first = encodeNativeMessage({ action: "save", dataUrl: "data:image/png;base64,Zm9v" });
  const second = encodeNativeMessage({ action: "save", dataUrl: "data:image/png;base64,YmFy" });
  const secondPrefix = second.subarray(0, 7);

  const combined = Buffer.concat([first, secondPrefix]);
  const decoded = decodeNativeMessages(combined);

  assert.equal(decoded.messages.length, 1);
  assert.equal(decoded.remaining.length, secondPrefix.length);

  const resumed = decodeNativeMessages(Buffer.concat([decoded.remaining, second.subarray(secondPrefix.length)]));
  assert.equal(resumed.messages.length, 1);
  assert.equal(resumed.remaining.length, 0);
});

test("decodeNativeMessages rejects oversized message length", () => {
  const header = Buffer.alloc(4);
  header.writeUInt32LE(MAX_NATIVE_MESSAGE_BYTES + 1, 0);
  const payload = Buffer.from("{}", "utf8");
  const invalidFrame = Buffer.concat([header, payload]);

  assert.throws(() => decodeNativeMessages(invalidFrame), /Invalid native message length/);
});

test("decodeNativeMessages rejects zero-length framed payload", () => {
  const header = Buffer.alloc(4);
  header.writeUInt32LE(0, 0);

  assert.throws(() => decodeNativeMessages(header), /Invalid native message length/);
});

test("decodeNativeMessages rejects malformed JSON payload", () => {
  const payload = Buffer.from("{\"incomplete\":", "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  const malformedFrame = Buffer.concat([header, payload]);

  assert.throws(() => decodeNativeMessages(malformedFrame), /malformed JSON payload/);
});
