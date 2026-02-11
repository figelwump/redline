const REDLINE_FLAG = "__redlineLoaded";

if (!window[REDLINE_FLAG]) {
  window[REDLINE_FLAG] = true;
  bootstrapRedline();
}

function bootstrapRedline() {
  const TOOL_RECTANGLE = "rectangle";
  const TOOL_TEXT = "text";
  const TEXT_PILL_MAX_CHARS = 280;

  const state = {
    annotationMode: false,
    currentTool: TOOL_RECTANGLE,
    rootElement: null,
    overlayElement: null,
    toolbarElement: null,
    sendButtonElement: null,
    saveTabButtonElement: null,
    toastElement: null,
    annotations: new Set(),
    activeRectangle: null,
    isSending: false,
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "redline:ping") {
      sendResponse({ ready: true });
      return;
    }

    if (message?.type === "redline:toggle") {
      if (state.annotationMode) {
        teardownAnnotationMode();
      } else {
        setupAnnotationMode();
      }

      sendResponse({ active: state.annotationMode });
      return;
    }
  });

  function setupAnnotationMode() {
    if (state.annotationMode) {
      return;
    }

    state.rootElement = document.createElement("div");
    state.rootElement.id = "rl-root";

    state.overlayElement = document.createElement("div");
    state.overlayElement.id = "rl-overlay";
    state.overlayElement.addEventListener("mousedown", onOverlayMouseDown);
    state.overlayElement.addEventListener("mousemove", onOverlayMouseMove);
    state.overlayElement.addEventListener("mouseup", onOverlayMouseUp);
    state.overlayElement.addEventListener("click", onOverlayClick);
    state.overlayElement.addEventListener("wheel", onOverlayWheel, { passive: false });

    state.toolbarElement = renderToolbar();
    state.toastElement = document.createElement("div");
    state.toastElement.id = "rl-toast";

    state.rootElement.appendChild(state.overlayElement);
    state.rootElement.appendChild(state.toolbarElement);
    state.rootElement.appendChild(state.toastElement);
    document.documentElement.appendChild(state.rootElement);

    document.addEventListener("keydown", onDocumentKeyDown, true);
    state.annotationMode = true;
    setTool(TOOL_RECTANGLE);
    showToast("Annotation mode enabled");
  }

  function teardownAnnotationMode() {
    if (!state.annotationMode) {
      return;
    }

    document.removeEventListener("keydown", onDocumentKeyDown, true);
    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = 0;

    if (state.overlayElement) {
      state.overlayElement.removeEventListener("mousedown", onOverlayMouseDown);
      state.overlayElement.removeEventListener("mousemove", onOverlayMouseMove);
      state.overlayElement.removeEventListener("mouseup", onOverlayMouseUp);
      state.overlayElement.removeEventListener("click", onOverlayClick);
      state.overlayElement.removeEventListener("wheel", onOverlayWheel);
    }

    state.rootElement?.remove();
    state.rootElement = null;
    state.overlayElement = null;
    state.toolbarElement = null;
    state.sendButtonElement = null;
    state.saveTabButtonElement = null;
    state.toastElement = null;
    state.annotations.clear();
    state.activeRectangle = null;
    state.currentTool = TOOL_RECTANGLE;
    state.annotationMode = false;
  }

  function renderToolbar() {
    const toolbar = document.createElement("div");
    toolbar.id = "rl-toolbar";
    toolbar.innerHTML = `
      <button type="button" class="rl-icon-button" data-action="tool-rectangle" title="Rectangle" aria-label="Rectangle">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="2.5" y="3.5" width="11" height="9" rx="1"></rect>
        </svg>
      </button>
      <button type="button" class="rl-icon-button" data-action="tool-text" title="Text" aria-label="Text">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 3.5h10M8 3.5v9M6 12.5h4"></path>
        </svg>
      </button>
      <button type="button" class="rl-icon-button" data-action="clear" title="Clear" aria-label="Clear">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 10.5h8.75l2.25-6H4.75zM6 4.5l1-2h3l1 2"></path>
        </svg>
      </button>
      <button type="button" class="rl-icon-button" data-action="save-tab" title="Save Tab Highlight" aria-label="Save Tab Highlight">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="2.5" y="2.5" width="11" height="11" rx="1"></rect>
          <path d="M2.5 5.5h11"></path>
        </svg>
      </button>
      <button type="button" data-action="send">Send</button>
    `;

    toolbar.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) {
        return;
      }

      const { action } = target.dataset;
      if (action === "tool-rectangle") {
        setTool(TOOL_RECTANGLE);
        return;
      }

      if (action === "tool-text") {
        setTool(TOOL_TEXT);
        return;
      }

      if (action === "clear") {
        clearAnnotations();
        showToast("Annotations cleared");
        return;
      }

      if (action === "send") {
        void saveAnnotatedCapture();
        return;
      }

      if (action === "save-tab") {
        highlightWholeTab();
      }
    });

    state.sendButtonElement = toolbar.querySelector("button[data-action='send']");
    state.saveTabButtonElement = toolbar.querySelector("button[data-action='save-tab']");
    return toolbar;
  }

  function setTool(tool) {
    state.currentTool = tool;

    if (!state.toolbarElement) {
      return;
    }

    const toolbarButtons = state.toolbarElement.querySelectorAll("button[data-action^='tool-']");
    toolbarButtons.forEach((button) => button.classList.remove("rl-active"));

    const activeSelector =
      tool === TOOL_RECTANGLE ? "button[data-action='tool-rectangle']" : "button[data-action='tool-text']";
    const activeButton = state.toolbarElement.querySelector(activeSelector);
    activeButton?.classList.add("rl-active");
  }

  function onDocumentKeyDown(event) {
    if (event.key === "Escape") {
      teardownAnnotationMode();
    }
  }

  function onOverlayWheel(event) {
    window.scrollBy({
      left: event.deltaX,
      top: event.deltaY,
      behavior: "auto",
    });
    event.preventDefault();
  }

  function onOverlayMouseDown(event) {
    if (state.currentTool !== TOOL_RECTANGLE || event.button !== 0) {
      return;
    }

    if (isInToolbar(event.target)) {
      return;
    }

    const startPoint = { x: event.clientX, y: event.clientY };
    const element = document.createElement("div");
    element.className = "rl-rect-annotation";
    state.overlayElement?.appendChild(element);
    state.annotations.add(element);
    state.activeRectangle = { element, startPoint };
    updateRectangleElement(element, startPoint, startPoint);
    event.preventDefault();
  }

  function onOverlayMouseMove(event) {
    if (!state.activeRectangle) {
      return;
    }

    updateRectangleElement(state.activeRectangle.element, state.activeRectangle.startPoint, {
      x: event.clientX,
      y: event.clientY,
    });
  }

  function onOverlayMouseUp(event) {
    if (!state.activeRectangle) {
      return;
    }

    const { element, startPoint } = state.activeRectangle;
    const left = Math.min(startPoint.x, event.clientX);
    const top = Math.min(startPoint.y, event.clientY);
    const width = Math.abs(event.clientX - startPoint.x);
    const height = Math.abs(event.clientY - startPoint.y);
    updateRectangleElement(element, startPoint, { x: event.clientX, y: event.clientY });
    state.activeRectangle = null;

    if (width < 4 || height < 4) {
      state.annotations.delete(element);
      element.remove();
      return;
    }

    createTextAnnotation(left + width / 2, top + height / 2);
  }

  function onOverlayClick(event) {
    if (state.currentTool !== TOOL_TEXT) {
      return;
    }

    if (isInToolbar(event.target)) {
      return;
    }

    createTextAnnotation(event.clientX, event.clientY);
  }

  function updateRectangleElement(element, start, end) {
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);

    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
  }

  function createTextAnnotation(x, y) {
    const wrapper = document.createElement("div");
    wrapper.className = "rl-text-annotation";
    wrapper.style.left = `${x}px`;
    wrapper.style.top = `${y}px`;

    const dot = document.createElement("div");
    dot.className = "rl-text-dot";

    const connector = document.createElement("div");
    connector.className = "rl-text-connector";

    const pill = document.createElement("div");
    pill.className = "rl-text-pill";
    pill.contentEditable = "true";
    pill.spellcheck = false;
    pill.textContent = "";
    pill.setAttribute("aria-label", "Feedback callout text");
    pill.addEventListener("input", () => {
      const content = pill.textContent ?? "";
      if (content.length <= TEXT_PILL_MAX_CHARS) {
        return;
      }

      pill.textContent = content.slice(0, TEXT_PILL_MAX_CHARS);
      placeCursorAtEnd(pill);
    });

    const commit = () => {
      pill.contentEditable = "false";
      if (!pill.textContent?.trim()) {
        wrapper.remove();
        state.annotations.delete(wrapper);
      }
    };

    pill.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        pill.blur();
      }
    });

    pill.addEventListener("blur", commit, { once: true });

    wrapper.appendChild(dot);
    wrapper.appendChild(connector);
    wrapper.appendChild(pill);

    state.overlayElement?.appendChild(wrapper);
    state.annotations.add(wrapper);
    focusEditable(pill);
  }

  function placeCursorAtEnd(element) {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function focusEditable(element) {
    if (!element.parentElement) {
      return;
    }

    element.focus();
    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    try {
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (_error) {
      // Leave focus in place even if selection initialization fails.
    }
  }

  function clearAnnotations() {
    state.annotations.forEach((annotation) => annotation.remove());
    state.annotations.clear();
    state.activeRectangle = null;
  }

  function highlightWholeTab() {
    if (!state.overlayElement) {
      return;
    }

    const inset = 2;
    const width = Math.max(window.innerWidth - inset * 2, 4);
    const height = Math.max(window.innerHeight - inset * 2, 4);

    const element = document.createElement("div");
    element.className = "rl-rect-annotation rl-full-tab-annotation";
    state.overlayElement.appendChild(element);
    state.annotations.add(element);
    element.style.left = `${inset}px`;
    element.style.top = `${inset}px`;
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;

    createTextAnnotation(inset + width / 2, inset + height / 2);
    showToast("Tab highlighted. Add notes, then Send.");
  }

  async function saveAnnotatedCapture() {
    if (state.isSending) {
      return;
    }

    state.isSending = true;
    setCaptureButtonsDisabled(true);
    state.toolbarElement?.classList.add("rl-hidden");

    try {
      const response = await sendRuntimeMessage({
        type: "redline:capture",
        metadata: {
          url: window.location.href,
          timestamp: new Date().toISOString(),
          captureMode: "annotated",
        },
      });

      if (!response?.success) {
        throw new Error(response?.error ?? "Capture failed");
      }

      showToast("Successfully sent. Use /redline in your agent to pull them in.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send capture";
      showToast(message, true);
    } finally {
      setCaptureButtonsDisabled(false);
      state.toolbarElement?.classList.remove("rl-hidden");
      state.isSending = false;
    }
  }

  function setCaptureButtonsDisabled(isDisabled) {
    if (state.sendButtonElement instanceof HTMLButtonElement) {
      state.sendButtonElement.disabled = isDisabled;
    }

    if (state.saveTabButtonElement instanceof HTMLButtonElement) {
      state.saveTabButtonElement.disabled = isDisabled;
    }
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        resolve(response);
      });
    });
  }

  function showToast(message, isError = false) {
    if (!state.toastElement) {
      return;
    }

    positionToastUnderToolbar();
    state.toastElement.textContent = message;
    state.toastElement.classList.toggle("rl-error", isError);
    state.toastElement.classList.add("rl-visible");

    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => {
      state.toastElement?.classList.remove("rl-visible", "rl-error");
    }, 2600);
  }

  showToast.timeoutId = 0;

  function positionToastUnderToolbar() {
    if (!state.toolbarElement || !state.toastElement) {
      return;
    }

    const toolbarRect = state.toolbarElement.getBoundingClientRect();
    const toastWidth = Math.min(420, window.innerWidth - 24);
    const margin = 8;
    const left = Math.max(12, Math.min(toolbarRect.right - toastWidth, window.innerWidth - toastWidth - 12));
    const top = Math.min(window.innerHeight - 48, toolbarRect.bottom + margin);

    state.toastElement.style.left = `${left}px`;
    state.toastElement.style.top = `${top}px`;
    state.toastElement.style.width = `${toastWidth}px`;
  }

  function isInToolbar(target) {
    if (!(target instanceof Node)) {
      return false;
    }

    return Boolean(state.toolbarElement?.contains(target));
  }
}
