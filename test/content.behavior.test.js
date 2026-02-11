const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { JSDOM } = require("jsdom");

function setupContentHarness(options = {}) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost:3000",
    pretendToBeVisual: true,
  });

  const { window } = dom;
  const listeners = {};
  const pendingSendCallbacks = [];

  function onSendMessage(message, callback) {
    if (typeof options.onSendMessage === "function") {
      options.onSendMessage(message, callback, pendingSendCallbacks);
      return;
    }

    pendingSendCallbacks.push(() => callback({ success: true, path: "/tmp/mock.png" }));
  }

  const chrome = {
    runtime: {
      lastError: null,
      onMessage: {
        addListener(listener) {
          listeners.onMessage = listener;
        },
      },
      sendMessage(message, callback) {
        onSendMessage(message, callback);
      },
    },
  };

  const previousGlobals = {
    window: global.window,
    document: global.document,
    Node: global.Node,
    navigator: global.navigator,
    HTMLElement: global.HTMLElement,
    HTMLButtonElement: global.HTMLButtonElement,
    MouseEvent: global.MouseEvent,
    KeyboardEvent: global.KeyboardEvent,
    chrome: global.chrome,
  };

  global.window = window;
  global.document = window.document;
  global.Node = window.Node;
  global.navigator = window.navigator;
  global.HTMLElement = window.HTMLElement;
  global.HTMLButtonElement = window.HTMLButtonElement;
  global.MouseEvent = window.MouseEvent;
  global.KeyboardEvent = window.KeyboardEvent;
  global.chrome = chrome;

  const modulePath = path.resolve(__dirname, "../content.js");
  delete require.cache[modulePath];
  require(modulePath);
  if (typeof listeners.onMessage !== "function") {
    throw new Error("content.js did not register a runtime onMessage listener");
  }

  async function toggleAnnotation() {
    return new Promise((resolve) => {
      listeners.onMessage({ type: "redline:toggle" }, {}, (response) => resolve(response));
    });
  }

  function cleanup() {
    try {
      delete require.cache[modulePath];
      dom.window.close();
    } finally {
      if (previousGlobals.window === undefined) {
        delete global.window;
      } else {
        global.window = previousGlobals.window;
      }

      if (previousGlobals.document === undefined) {
        delete global.document;
      } else {
        global.document = previousGlobals.document;
      }

      if (previousGlobals.Node === undefined) {
        delete global.Node;
      } else {
        global.Node = previousGlobals.Node;
      }

      if (previousGlobals.navigator === undefined) {
        delete global.navigator;
      } else {
        global.navigator = previousGlobals.navigator;
      }

      if (previousGlobals.HTMLElement === undefined) {
        delete global.HTMLElement;
      } else {
        global.HTMLElement = previousGlobals.HTMLElement;
      }

      if (previousGlobals.HTMLButtonElement === undefined) {
        delete global.HTMLButtonElement;
      } else {
        global.HTMLButtonElement = previousGlobals.HTMLButtonElement;
      }

      if (previousGlobals.MouseEvent === undefined) {
        delete global.MouseEvent;
      } else {
        global.MouseEvent = previousGlobals.MouseEvent;
      }

      if (previousGlobals.KeyboardEvent === undefined) {
        delete global.KeyboardEvent;
      } else {
        global.KeyboardEvent = previousGlobals.KeyboardEvent;
      }

      if (previousGlobals.chrome === undefined) {
        delete global.chrome;
      } else {
        global.chrome = previousGlobals.chrome;
      }
    }
  }

  return {
    window,
    document: window.document,
    toggleAnnotation,
    cleanup,
  };
}

function dispatchMouse(target, window, type, x, y, extra = {}) {
  target.dispatchEvent(
    new window.MouseEvent(type, {
      bubbles: true,
      clientX: x,
      clientY: y,
      ...extra,
    })
  );
}

test("toggle message creates and removes overlay UI", async () => {
  const harness = setupContentHarness();

  try {
    await harness.toggleAnnotation();
    assert.ok(harness.document.querySelector("#rl-overlay"));
    assert.ok(harness.document.querySelector("#rl-toolbar"));

    await harness.toggleAnnotation();
    assert.equal(harness.document.querySelector("#rl-overlay"), null);
    assert.equal(harness.document.querySelector("#rl-toolbar"), null);
  } finally {
    harness.cleanup();
  }
});

test("rectangle tool creates finalized rectangle and centered text pill", async () => {
  const harness = setupContentHarness();

  try {
    await harness.toggleAnnotation();
    const overlay = harness.document.querySelector("#rl-overlay");
    assert.ok(overlay);

    dispatchMouse(overlay, harness.window, "mousedown", 10, 10, { button: 0 });
    dispatchMouse(overlay, harness.window, "mousemove", 120, 80);
    dispatchMouse(overlay, harness.window, "mouseup", 120, 80);

    const rectangles = harness.document.querySelectorAll(".rl-rect-annotation");
    assert.equal(rectangles.length, 1);
    const rectangle = rectangles[0];
    assert.equal(rectangle.style.left, "10px");
    assert.equal(rectangle.style.top, "10px");
    assert.equal(rectangle.style.width, "110px");
    assert.equal(rectangle.style.height, "70px");

    const textAnnotations = harness.document.querySelectorAll(".rl-text-annotation");
    assert.equal(textAnnotations.length, 1);
    const textPill = textAnnotations[0].querySelector(".rl-text-pill");
    assert.ok(textPill);
    assert.equal(textPill.contentEditable, "true");
  } finally {
    harness.cleanup();
  }
});

test("text tool creates dot/connector/pill and commits on Enter", async () => {
  const harness = setupContentHarness();

  try {
    await harness.toggleAnnotation();

    const textButton = harness.document.querySelector("button[data-action='tool-text']");
    assert.ok(textButton);
    textButton.dispatchEvent(new harness.window.MouseEvent("click", { bubbles: true }));

    const overlay = harness.document.querySelector("#rl-overlay");
    assert.ok(overlay);
    dispatchMouse(overlay, harness.window, "click", 80, 60);

    const annotation = harness.document.querySelector(".rl-text-annotation");
    assert.ok(annotation);
    assert.ok(annotation.querySelector(".rl-text-dot"));
    assert.ok(annotation.querySelector(".rl-text-connector"));

    const pill = annotation.querySelector(".rl-text-pill");
    assert.ok(pill);
    pill.textContent = "Needs spacing fix";
    pill.dispatchEvent(new harness.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    pill.dispatchEvent(new harness.window.FocusEvent("blur", { bubbles: true }));

    assert.equal(pill.contentEditable, "false");
    assert.equal(pill.textContent, "Needs spacing fix");
  } finally {
    harness.cleanup();
  }
});

test("send action shows success toast under toolbar and keeps UI active", async () => {
  const pending = [];
  const harness = setupContentHarness({
    onSendMessage(message, callback) {
      pending.push({ message, callback });
    },
  });

  try {
    await harness.toggleAnnotation();

    const toolbar = harness.document.querySelector("#rl-toolbar");
    const root = harness.document.querySelector("#rl-root");
    const sendButton = harness.document.querySelector("button[data-action='send']");
    const saveTabButton = harness.document.querySelector("button[data-action='save-tab']");
    const toast = harness.document.querySelector("#rl-toast");
    assert.ok(toolbar);
    assert.ok(root);
    assert.ok(sendButton);
    assert.ok(saveTabButton);
    assert.ok(toast);

    sendButton.dispatchEvent(new harness.window.MouseEvent("click", { bubbles: true }));
    assert.equal(toolbar.classList.contains("rl-hidden"), true);
    assert.equal(sendButton.disabled, true);
    assert.equal(saveTabButton.disabled, true);
    assert.equal(pending.length, 1);
    assert.equal(pending[0].message.type, "redline:capture");
    assert.equal(pending[0].message.metadata.captureMode, "annotated");

    pending[0].callback({ success: true, path: "/tmp/mock.png" });
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(toolbar.classList.contains("rl-hidden"), false);
    assert.equal(sendButton.disabled, false);
    assert.equal(saveTabButton.disabled, false);
    assert.match(
      toast.textContent,
      /Successfully sent\. Use \/redline in your agent to pull them in\./
    );
    assert.equal(toast.classList.contains("rl-visible"), true);
    assert.notEqual(toast.style.top, "");
    assert.notEqual(toast.style.left, "");

    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(harness.document.querySelector("#rl-root"));
  } finally {
    harness.cleanup();
  }
});

test("save-tab creates full-tab rectangle and centered text without sending", async () => {
  const pending = [];
  const harness = setupContentHarness({
    onSendMessage(message, callback) {
      pending.push({ message, callback });
    },
  });

  try {
    await harness.toggleAnnotation();

    const saveTabButton = harness.document.querySelector("button[data-action='save-tab']");
    assert.ok(saveTabButton);

    saveTabButton.dispatchEvent(new harness.window.MouseEvent("click", { bubbles: true }));

    assert.equal(pending.length, 0);
    const rectangles = harness.document.querySelectorAll(".rl-rect-annotation.rl-full-tab-annotation");
    assert.equal(rectangles.length, 1);

    const rectangle = rectangles[0];
    assert.equal(rectangle.style.left, "2px");
    assert.equal(rectangle.style.top, "2px");

    const textAnnotations = harness.document.querySelectorAll(".rl-text-annotation");
    assert.equal(textAnnotations.length, 1);
    const pill = textAnnotations[0].querySelector(".rl-text-pill");
    assert.ok(pill);
    assert.equal(pill.contentEditable, "true");
  } finally {
    harness.cleanup();
  }
});
