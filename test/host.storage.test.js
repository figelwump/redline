const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { saveFeedbackMessage } = require("../native-messaging/lib");

const FIXTURE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9oN7nFkAAAAASUVORK5CYII=";

function withTempDir(callback) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "redline-host-test-"));
  try {
    callback(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test("saveFeedbackMessage writes PNG and latest metadata", () => {
  withTempDir((feedbackDir) => {
    const result = saveFeedbackMessage(
      {
        action: "save",
        dataUrl: FIXTURE_PNG,
        metadata: {
          url: "http://localhost:3000",
          timestamp: "2026-02-11T10:20:30.123Z",
        },
      },
      { feedbackDir }
    );

    assert.equal(result.success, true);
    assert.equal(path.dirname(result.path), feedbackDir);
    assert.equal(fs.existsSync(result.path), true);
    const outputPng = fs.readFileSync(result.path);
    assert.equal(outputPng.toString("hex", 0, 4), "89504e47");

    const latestPath = path.join(feedbackDir, "latest.json");
    assert.equal(fs.existsSync(latestPath), true);

    const latestMetadata = JSON.parse(fs.readFileSync(latestPath, "utf8"));
    assert.equal(latestMetadata.path, result.path);
    assert.equal(latestMetadata.url, "http://localhost:3000");
    assert.equal(latestMetadata.timestamp, "2026-02-11T10:20:30.123Z");
  });
});

test("saveFeedbackMessage supports missing metadata with fallback values", () => {
  withTempDir((feedbackDir) => {
    const result = saveFeedbackMessage(
      {
        action: "save",
        dataUrl: FIXTURE_PNG,
      },
      { feedbackDir }
    );

    const latestPath = path.join(feedbackDir, "latest.json");
    const latestMetadata = JSON.parse(fs.readFileSync(latestPath, "utf8"));
    assert.equal(latestMetadata.path, result.path);
    assert.equal(latestMetadata.url, null);
    assert.equal(typeof latestMetadata.timestamp, "string");
    assert.notEqual(latestMetadata.timestamp.length, 0);
  });
});

test("saveFeedbackMessage avoids overwriting file on timestamp collision", () => {
  withTempDir((feedbackDir) => {
    const payload = {
      action: "save",
      dataUrl: FIXTURE_PNG,
      metadata: {
        url: "http://localhost:3000",
        timestamp: "2026-02-11T10:20:30.123Z",
      },
    };

    const first = saveFeedbackMessage(payload, { feedbackDir });
    const second = saveFeedbackMessage(payload, { feedbackDir });

    assert.notEqual(first.path, second.path);
    assert.equal(fs.existsSync(first.path), true);
    assert.equal(fs.existsSync(second.path), true);
  });
});

test("saveFeedbackMessage rejects invalid PNG data URLs", () => {
  withTempDir((feedbackDir) => {
    assert.throws(
      () =>
        saveFeedbackMessage(
          {
            action: "save",
            dataUrl: "data:text/plain;base64,Zm9v",
            metadata: {},
          },
          { feedbackDir }
        ),
      /PNG data URL/
    );
  });
});

test("saveFeedbackMessage rejects missing dataUrl payload", () => {
  withTempDir((feedbackDir) => {
    assert.throws(
      () =>
        saveFeedbackMessage(
          {
            action: "save",
            metadata: {},
          },
          { feedbackDir }
        ),
      /non-empty PNG dataUrl/
    );
  });
});
