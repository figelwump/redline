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
    Element: global.Element,
    HTMLInputElement: global.HTMLInputElement,
    HTMLTextAreaElement: global.HTMLTextAreaElement,
    HTMLSelectElement: global.HTMLSelectElement,
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
  global.Element = window.Element;
  global.HTMLInputElement = window.HTMLInputElement;
  global.HTMLTextAreaElement = window.HTMLTextAreaElement;
  global.HTMLSelectElement = window.HTMLSelectElement;
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

      if (previousGlobals.Element === undefined) {
        delete global.Element;
      } else {
        global.Element = previousGlobals.Element;
      }

      if (previousGlobals.HTMLInputElement === undefined) {
        delete global.HTMLInputElement;
      } else {
        global.HTMLInputElement = previousGlobals.HTMLInputElement;
      }

      if (previousGlobals.HTMLTextAreaElement === undefined) {
        delete global.HTMLTextAreaElement;
      } else {
        global.HTMLTextAreaElement = previousGlobals.HTMLTextAreaElement;
      }

      if (previousGlobals.HTMLSelectElement === undefined) {
        delete global.HTMLSelectElement;
      } else {
        global.HTMLSelectElement = previousGlobals.HTMLSelectElement;
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

function dispatchKey(target, window, key, extra = {}) {
  target.dispatchEvent(
    new window.KeyboardEvent("keydown", {
      bubbles: true,
      key,
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

test("text tool click on existing rectangle re-adds text pill", async () => {
  const harness = setupContentHarness();

  try {
    await harness.toggleAnnotation();
    const overlay = harness.document.querySelector("#rl-overlay");
    assert.ok(overlay);

    dispatchMouse(overlay, harness.window, "mousedown", 20, 20, { button: 0 });
    dispatchMouse(overlay, harness.window, "mousemove", 140, 90);
    dispatchMouse(overlay, harness.window, "mouseup", 140, 90);

    const initialPill = harness.document.querySelector(".rl-text-pill");
    assert.ok(initialPill);
    initialPill.textContent = "";
    initialPill.dispatchEvent(new harness.window.FocusEvent("blur", { bubbles: true }));

    const rectangle = harness.document.querySelector(".rl-rect-annotation");
    assert.ok(rectangle);
    assert.equal(harness.document.querySelectorAll(".rl-text-annotation").length, 0);

    const textButton = harness.document.querySelector("button[data-action='tool-text']");
    assert.ok(textButton);
    textButton.dispatchEvent(new harness.window.MouseEvent("click", { bubbles: true }));

    dispatchMouse(rectangle, harness.window, "click", 80, 55);

    const textAnnotations = harness.document.querySelectorAll(".rl-text-annotation");
    assert.equal(textAnnotations.length, 1);
    const newPill = textAnnotations[0].querySelector(".rl-text-pill");
    assert.ok(newPill);
    assert.equal(newPill.contentEditable, "true");
  } finally {
    harness.cleanup();
  }
});

test("text tool click inside existing pill reopens editing", async () => {
  const harness = setupContentHarness();

  try {
    await harness.toggleAnnotation();
    const overlay = harness.document.querySelector("#rl-overlay");
    assert.ok(overlay);

    dispatchMouse(overlay, harness.window, "mousedown", 30, 30, { button: 0 });
    dispatchMouse(overlay, harness.window, "mousemove", 150, 95);
    dispatchMouse(overlay, harness.window, "mouseup", 150, 95);

    const pill = harness.document.querySelector(".rl-text-pill");
    assert.ok(pill);
    pill.textContent = "Editable note";
    pill.dispatchEvent(new harness.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    pill.dispatchEvent(new harness.window.FocusEvent("blur", { bubbles: true }));
    assert.equal(pill.contentEditable, "false");

    const textButton = harness.document.querySelector("button[data-action='tool-text']");
    assert.ok(textButton);
    textButton.dispatchEvent(new harness.window.MouseEvent("click", { bubbles: true }));

    dispatchMouse(pill, harness.window, "click", 90, 70);
    assert.equal(harness.document.querySelectorAll(".rl-text-annotation").length, 1);
    assert.equal(pill.contentEditable, "true");
  } finally {
    harness.cleanup();
  }
});

test("clicking inside icon SVG switches tool state", async () => {
  const harness = setupContentHarness();

  try {
    await harness.toggleAnnotation();

    const textButton = harness.document.querySelector("button[data-action='tool-text']");
    assert.ok(textButton);
    const iconPath = textButton.querySelector("svg path");
    assert.ok(iconPath);

    iconPath.dispatchEvent(new harness.window.MouseEvent("click", { bubbles: true }));
    assert.equal(textButton.classList.contains("rl-active"), true);
  } finally {
    harness.cleanup();
  }
});

test("send action shows success toast with done button that clears and hides UI", async () => {
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
    const toast = harness.document.querySelector("#rl-toast");
    assert.ok(toolbar);
    assert.ok(root);
    assert.ok(sendButton);
    assert.ok(toast);

    sendButton.dispatchEvent(new harness.window.MouseEvent("click", { bubbles: true }));
    assert.equal(toolbar.classList.contains("rl-hidden"), false);
    assert.equal(sendButton.disabled, true);
    assert.equal(pending.length, 1);
    assert.equal(pending[0].message.type, "redline:capture");
    assert.equal(pending[0].message.metadata.captureMode, "annotated");

    pending[0].callback({ success: true, path: "/tmp/mock.png" });
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(toolbar.classList.contains("rl-hidden"), false);
    assert.equal(sendButton.disabled, false);
    assert.match(
      toast.textContent,
      /Successfully saved feedback\. Use \/redline in your agent\./
    );
    assert.equal(toast.classList.contains("rl-visible"), true);
    assert.notEqual(toast.style.top, "");
    assert.notEqual(toast.style.left, "");
    const doneButton = toast.querySelector(".rl-toast-action");
    assert.ok(doneButton);
    assert.equal(doneButton.textContent, "Done");

    doneButton.dispatchEvent(new harness.window.MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(harness.document.querySelector("#rl-root"), null);
  } finally {
    harness.cleanup();
  }
});

test("success toast dismisses on Enter key", async () => {
  const pending = [];
  const harness = setupContentHarness({
    onSendMessage(message, callback) {
      pending.push({ message, callback });
    },
  });

  try {
    await harness.toggleAnnotation();

    const sendButton = harness.document.querySelector("button[data-action='send']");
    const toast = harness.document.querySelector("#rl-toast");
    assert.ok(sendButton);
    assert.ok(toast);

    sendButton.dispatchEvent(new harness.window.MouseEvent("click", { bubbles: true }));
    assert.equal(pending.length, 1);
    pending[0].callback({ success: true, path: "/tmp/mock.png" });
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(toast.classList.contains("rl-visible"), true);
    assert.ok(toast.querySelector(".rl-toast-action"));

    dispatchKey(harness.document, harness.window, "Enter");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(harness.document.querySelector("#rl-root"), null);
  } finally {
    harness.cleanup();
  }
});

test("success toast dismisses on Escape key", async () => {
  const pending = [];
  const harness = setupContentHarness({
    onSendMessage(message, callback) {
      pending.push({ message, callback });
    },
  });

  try {
    await harness.toggleAnnotation();

    const sendButton = harness.document.querySelector("button[data-action='send']");
    const toast = harness.document.querySelector("#rl-toast");
    assert.ok(sendButton);
    assert.ok(toast);

    sendButton.dispatchEvent(new harness.window.MouseEvent("click", { bubbles: true }));
    assert.equal(pending.length, 1);
    pending[0].callback({ success: true, path: "/tmp/mock.png" });
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(toast.classList.contains("rl-visible"), true);
    assert.ok(toast.querySelector(".rl-toast-action"));

    dispatchKey(harness.document, harness.window, "Escape");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(harness.document.querySelector("#rl-root"), null);
  } finally {
    harness.cleanup();
  }
});

test("save-tab control is hidden from toolbar", async () => {
  const harness = setupContentHarness();
  try {
    await harness.toggleAnnotation();

    const saveTabButton = harness.document.querySelector("button[data-action='save-tab']");
    assert.equal(saveTabButton, null);
  } finally {
    harness.cleanup();
  }
});

test("toolbar renders keyboard shortcut hints", async () => {
  const harness = setupContentHarness();

  try {
    await harness.toggleAnnotation();

    const hints = Array.from(harness.document.querySelectorAll(".rl-toolbar-hint")).map((node) =>
      node.textContent?.trim()
    );
    assert.deepEqual(hints, ["r", "t", "x", "cmd+enter"]);
  } finally {
    harness.cleanup();
  }
});

test("keyboard shortcuts switch tools and send", async () => {
  const pending = [];
  const harness = setupContentHarness({
    onSendMessage(message, callback) {
      pending.push({ message, callback });
    },
  });

  try {
    await harness.toggleAnnotation();

    const rectangleButton = harness.document.querySelector("button[data-action='tool-rectangle']");
    const textButton = harness.document.querySelector("button[data-action='tool-text']");
    assert.ok(rectangleButton);
    assert.ok(textButton);

    dispatchKey(harness.document, harness.window, "t");
    assert.equal(textButton.classList.contains("rl-active"), true);

    dispatchKey(harness.document, harness.window, "r");
    assert.equal(rectangleButton.classList.contains("rl-active"), true);

    dispatchKey(harness.document, harness.window, "Enter", { metaKey: true });
    assert.equal(pending.length, 1);
    assert.equal(pending[0].message.type, "redline:capture");
    assert.equal(pending[0].message.metadata.captureMode, "annotated");
  } finally {
    harness.cleanup();
  }
});

test("keyboard clear shortcut clears annotations", async () => {
  const harness = setupContentHarness();

  try {
    await harness.toggleAnnotation();
    const overlay = harness.document.querySelector("#rl-overlay");
    assert.ok(overlay);

    dispatchMouse(overlay, harness.window, "mousedown", 20, 20, { button: 0 });
    dispatchMouse(overlay, harness.window, "mousemove", 100, 70);
    dispatchMouse(overlay, harness.window, "mouseup", 100, 70);
    assert.equal(harness.document.querySelectorAll(".rl-rect-annotation").length, 1);

    const pill = harness.document.querySelector(".rl-text-pill");
    assert.ok(pill);
    pill.textContent = "note";
    pill.dispatchEvent(new harness.window.FocusEvent("blur", { bubbles: true }));
    const rectangleButton = harness.document.querySelector("button[data-action='tool-rectangle']");
    assert.ok(rectangleButton);
    rectangleButton.focus();

    dispatchKey(rectangleButton, harness.window, "x");
    assert.equal(harness.document.querySelectorAll(".rl-rect-annotation").length, 0);
    assert.equal(harness.document.querySelectorAll(".rl-text-annotation").length, 0);
  } finally {
    harness.cleanup();
  }
});

test("shortcuts are ignored while editing text pill", async () => {
  const harness = setupContentHarness();

  try {
    await harness.toggleAnnotation();
    const textButton = harness.document.querySelector("button[data-action='tool-text']");
    assert.ok(textButton);
    textButton.dispatchEvent(new harness.window.MouseEvent("click", { bubbles: true }));

    const overlay = harness.document.querySelector("#rl-overlay");
    assert.ok(overlay);
    dispatchMouse(overlay, harness.window, "click", 80, 60);

    const pill = harness.document.querySelector(".rl-text-pill");
    assert.ok(pill);
    assert.equal(pill.contentEditable, "true");

    dispatchKey(pill, harness.window, "x");
    assert.equal(harness.document.querySelectorAll(".rl-text-annotation").length, 1);
  } finally {
    harness.cleanup();
  }
});

test("cmd+enter sends while editing text pill", async () => {
  const pending = [];
  const harness = setupContentHarness({
    onSendMessage(message, callback) {
      pending.push({ message, callback });
    },
  });

  try {
    await harness.toggleAnnotation();
    const textButton = harness.document.querySelector("button[data-action='tool-text']");
    assert.ok(textButton);
    textButton.dispatchEvent(new harness.window.MouseEvent("click", { bubbles: true }));

    const overlay = harness.document.querySelector("#rl-overlay");
    assert.ok(overlay);
    dispatchMouse(overlay, harness.window, "click", 80, 60);

    const pill = harness.document.querySelector(".rl-text-pill");
    assert.ok(pill);
    assert.equal(pill.contentEditable, "true");

    dispatchKey(pill, harness.window, "Enter", { metaKey: true });
    assert.equal(pending.length, 1);
    assert.equal(pending[0].message.type, "redline:capture");
    assert.equal(pending[0].message.metadata.captureMode, "annotated");
  } finally {
    harness.cleanup();
  }
});

test("escape clears focused text-pill annotation before hiding app", async () => {
  const harness = setupContentHarness();

  try {
    await harness.toggleAnnotation();
    const overlay = harness.document.querySelector("#rl-overlay");
    assert.ok(overlay);

    dispatchMouse(overlay, harness.window, "mousedown", 20, 20, { button: 0 });
    dispatchMouse(overlay, harness.window, "mousemove", 100, 70);
    dispatchMouse(overlay, harness.window, "mouseup", 100, 70);

    assert.equal(harness.document.querySelectorAll(".rl-rect-annotation").length, 1);
    assert.equal(harness.document.querySelectorAll(".rl-text-annotation").length, 1);
    assert.ok(harness.document.activeElement?.classList.contains("rl-text-pill"));

    harness.document.dispatchEvent(new harness.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(harness.document.querySelectorAll(".rl-rect-annotation").length, 0);
    assert.equal(harness.document.querySelectorAll(".rl-text-annotation").length, 0);
    assert.ok(harness.document.querySelector("#rl-overlay"));

    harness.document.dispatchEvent(new harness.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(harness.document.querySelector("#rl-overlay"), null);
  } finally {
    harness.cleanup();
  }
});

test("escape while editing a pill clears only the focused annotation", async () => {
  const harness = setupContentHarness();

  try {
    await harness.toggleAnnotation();
    const overlay = harness.document.querySelector("#rl-overlay");
    assert.ok(overlay);

    dispatchMouse(overlay, harness.window, "mousedown", 20, 20, { button: 0 });
    dispatchMouse(overlay, harness.window, "mousemove", 100, 70);
    dispatchMouse(overlay, harness.window, "mouseup", 100, 70);

    const firstPill = harness.document.querySelector(".rl-text-pill");
    assert.ok(firstPill);
    firstPill.textContent = "first";
    firstPill.dispatchEvent(new harness.window.FocusEvent("blur", { bubbles: true }));

    dispatchMouse(overlay, harness.window, "mousedown", 140, 100, { button: 0 });
    dispatchMouse(overlay, harness.window, "mousemove", 220, 160);
    dispatchMouse(overlay, harness.window, "mouseup", 220, 160);

    assert.equal(harness.document.querySelectorAll(".rl-rect-annotation").length, 2);
    assert.equal(harness.document.querySelectorAll(".rl-text-annotation").length, 2);
    assert.ok(harness.document.activeElement?.classList.contains("rl-text-pill"));

    harness.document.dispatchEvent(new harness.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(harness.document.querySelectorAll(".rl-rect-annotation").length, 1);
    assert.equal(harness.document.querySelectorAll(".rl-text-annotation").length, 1);
    assert.ok(harness.document.querySelector("#rl-overlay"));
  } finally {
    harness.cleanup();
  }
});

test("escape with no focused annotation hides app", async () => {
  const harness = setupContentHarness();

  try {
    await harness.toggleAnnotation();
    assert.ok(harness.document.querySelector("#rl-overlay"));

    harness.document.dispatchEvent(new harness.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(harness.document.querySelector("#rl-overlay"), null);
  } finally {
    harness.cleanup();
  }
});
