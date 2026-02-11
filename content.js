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
    annotations: new Map(),
    nextAnnotationId: 1,
    focusedAnnotationId: null,
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
    state.focusedAnnotationId = null;
    state.activeRectangle = null;
    state.currentTool = TOOL_RECTANGLE;
    state.annotationMode = false;
  }

  function renderToolbar() {
    const toolbar = document.createElement("div");
    toolbar.id = "rl-toolbar";
    toolbar.innerHTML = `
      <div class="rl-toolbar-control">
        <button type="button" class="rl-icon-button" data-action="tool-rectangle" title="Rectangle" aria-label="Rectangle">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="2.5" y="3.5" width="11" height="9" rx="1"></rect>
          </svg>
        </button>
        <span class="rl-toolbar-hint">r</span>
      </div>
      <div class="rl-toolbar-control">
        <button type="button" class="rl-icon-button" data-action="tool-text" title="Text" aria-label="Text">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 3.5h10M8 3.5v9M6 12.5h4"></path>
          </svg>
        </button>
        <span class="rl-toolbar-hint">t</span>
      </div>
      <div class="rl-toolbar-control">
        <button type="button" class="rl-icon-button" data-action="clear" title="Clear" aria-label="Clear">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="5.5"></circle>
            <path d="M6.75 6.75l2.5 2.5M9.25 6.75l-2.5 2.5"></path>
          </svg>
        </button>
        <span class="rl-toolbar-hint">x</span>
      </div>
      <div class="rl-toolbar-control">
        <button type="button" data-action="send">Send</button>
        <span class="rl-toolbar-hint">shift+enter</span>
      </div>
    `;

    toolbar.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const button = target.closest("button[data-action]");
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }

      const { action } = button.dataset;
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
    const toastActionButton = getVisibleToastActionButton();
    if (toastActionButton && (event.key === "Enter" || event.key === "Escape")) {
      if (!event.metaKey && !event.ctrlKey && !event.altKey) {
        toastActionButton.click();
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }

    if (event.key === "Escape") {
      if (state.focusedAnnotationId !== null) {
        removeAnnotation(state.focusedAnnotationId);
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      clearAnnotations();
      teardownAnnotationMode();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (!state.annotationMode || state.isSending) {
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    if (event.key === "Enter" && event.shiftKey) {
      void saveAnnotatedCapture();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (isEditableKeyboardTarget(event.target) || isEditableKeyboardTarget(document.activeElement)) {
      return;
    }

    const normalizedKey = event.key.toLowerCase();

    if (normalizedKey === "r") {
      setTool(TOOL_RECTANGLE);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (normalizedKey === "t") {
      setTool(TOOL_TEXT);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (normalizedKey === "x") {
      clearAnnotations();
      showToast("Annotations cleared");
      event.preventDefault();
      event.stopPropagation();
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

    const focusedId = getAnnotationIdFromTarget(event.target);
    if (focusedId !== null) {
      setFocusedAnnotation(focusedId);
      return;
    }

    const startPoint = { x: event.clientX, y: event.clientY };
    const element = document.createElement("div");
    element.className = "rl-rect-annotation";
    const annotation = createAnnotationEntry();
    attachElementToAnnotation(annotation.id, element, "rect");

    state.overlayElement?.appendChild(element);
    state.activeRectangle = { element, startPoint, annotationId: annotation.id };
    updateRectangleElement(element, startPoint, startPoint);
    setFocusedAnnotation(annotation.id);
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

    const { element, startPoint, annotationId } = state.activeRectangle;
    const left = Math.min(startPoint.x, event.clientX);
    const top = Math.min(startPoint.y, event.clientY);
    const width = Math.abs(event.clientX - startPoint.x);
    const height = Math.abs(event.clientY - startPoint.y);
    updateRectangleElement(element, startPoint, { x: event.clientX, y: event.clientY });
    state.activeRectangle = null;

    if (width < 4 || height < 4) {
      removeAnnotation(annotationId);
      return;
    }

    createTextAnnotation(left + width / 2, top + height / 2, { annotationId });
    setFocusedAnnotation(annotationId);
  }

  function onOverlayClick(event) {
    if (state.currentTool !== TOOL_TEXT) {
      return;
    }

    if (isInToolbar(event.target)) {
      return;
    }

    const focusedId = getAnnotationIdFromTarget(event.target);
    if (focusedId !== null) {
      setFocusedAnnotation(focusedId);
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

  function createTextAnnotation(x, y, options = {}) {
    const annotation = options.annotationId
      ? state.annotations.get(options.annotationId) ?? createAnnotationEntry()
      : createAnnotationEntry();

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
    pill.setAttribute("contenteditable", "true");
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
        if (annotation.rectElement) {
          detachTextFromAnnotation(annotation.id);
          return;
        }

        removeAnnotation(annotation.id);
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
    attachElementToAnnotation(annotation.id, wrapper, "text");
    annotation.textPill = pill;
    wrapper.addEventListener("mousedown", () => setFocusedAnnotation(annotation.id));
    pill.addEventListener("focus", () => setFocusedAnnotation(annotation.id));
    setFocusedAnnotation(annotation.id);
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
    Array.from(state.annotations.keys()).forEach((annotationId) => {
      removeAnnotation(annotationId);
    });
    state.focusedAnnotationId = null;
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
    const annotation = createAnnotationEntry();
    attachElementToAnnotation(annotation.id, element, "rect");
    element.addEventListener("mousedown", () => setFocusedAnnotation(annotation.id));

    state.overlayElement.appendChild(element);
    element.style.left = `${inset}px`;
    element.style.top = `${inset}px`;
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;

    createTextAnnotation(inset + width / 2, inset + height / 2, { annotationId: annotation.id });
    setFocusedAnnotation(annotation.id);
    showToast("Tab highlighted. Add notes, then Send.");
  }

  function createAnnotationEntry() {
    const annotation = {
      id: state.nextAnnotationId,
      rectElement: null,
      textWrapper: null,
      textPill: null,
    };
    state.nextAnnotationId += 1;
    state.annotations.set(annotation.id, annotation);
    return annotation;
  }

  function attachElementToAnnotation(annotationId, element, type) {
    const annotation = state.annotations.get(annotationId);
    if (!annotation) {
      return;
    }

    element.dataset.rlAnnotationId = String(annotationId);
    if (type === "rect") {
      annotation.rectElement = element;
    }
    if (type === "text") {
      annotation.textWrapper = element;
    }
  }

  function detachTextFromAnnotation(annotationId) {
    const annotation = state.annotations.get(annotationId);
    if (!annotation) {
      return;
    }

    annotation.textWrapper?.remove();
    annotation.textWrapper = null;
    annotation.textPill = null;

    if (!annotation.rectElement) {
      state.annotations.delete(annotationId);
      if (state.focusedAnnotationId === annotationId) {
        state.focusedAnnotationId = null;
      }
    } else if (state.focusedAnnotationId === annotationId) {
      setFocusedAnnotation(annotationId);
    }
  }

  function removeAnnotation(annotationId) {
    const annotation = state.annotations.get(annotationId);
    if (!annotation) {
      return;
    }

    annotation.rectElement?.remove();
    annotation.textWrapper?.remove();
    state.annotations.delete(annotationId);
    if (state.focusedAnnotationId === annotationId) {
      state.focusedAnnotationId = null;
    }
  }

  function setFocusedAnnotation(annotationId) {
    if (state.focusedAnnotationId === annotationId) {
      return;
    }

    state.annotations.forEach((annotation) => {
      annotation.rectElement?.classList.remove("rl-focused");
      annotation.textWrapper?.classList.remove("rl-focused");
    });

    state.focusedAnnotationId = annotationId;
    if (annotationId === null) {
      return;
    }

    const annotation = state.annotations.get(annotationId);
    annotation?.rectElement?.classList.add("rl-focused");
    annotation?.textWrapper?.classList.add("rl-focused");
  }

  function getAnnotationIdFromTarget(target) {
    if (!(target instanceof Element)) {
      return null;
    }

    const annotatedElement = target.closest("[data-rl-annotation-id]");
    if (!annotatedElement) {
      return null;
    }

    const parsed = Number.parseInt(annotatedElement.getAttribute("data-rl-annotation-id") ?? "", 10);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return parsed;
  }

  function isEditableKeyboardTarget(target) {
    let element = null;
    if (target instanceof Element) {
      element = target;
    } else if (target && typeof target === "object" && "parentElement" in target) {
      element = target.parentElement;
    }

    if (!(element instanceof Element)) {
      return false;
    }

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      return true;
    }

    if (element instanceof HTMLElement && element.isContentEditable) {
      return true;
    }

    return element.closest("[contenteditable]") !== null;
  }

  async function saveAnnotatedCapture() {
    if (state.isSending) {
      return;
    }

    state.isSending = true;
    setCaptureButtonsDisabled(true);

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

      showToast("Successfully saved feedback. Use /redline in your agent.", {
        actionLabel: "Done",
        onAction: () => {
          clearAnnotations();
          teardownAnnotationMode();
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send capture";
      showToast(message, true);
    } finally {
      setCaptureButtonsDisabled(false);
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

  function showToast(message, optionsOrIsError = false) {
    if (!state.toastElement) {
      return;
    }

    const options =
      typeof optionsOrIsError === "boolean" ? { isError: optionsOrIsError } : optionsOrIsError ?? {};
    const isError = options.isError ?? false;
    const actionLabel = typeof options.actionLabel === "string" ? options.actionLabel : null;
    const onAction = typeof options.onAction === "function" ? options.onAction : null;
    const hasAction = Boolean(actionLabel && onAction);

    positionToastUnderToolbar();
    state.toastElement.textContent = "";
    const messageElement = document.createElement("span");
    messageElement.className = "rl-toast-message";
    messageElement.textContent = message;
    state.toastElement.appendChild(messageElement);

    if (hasAction) {
      const actionButton = document.createElement("button");
      actionButton.type = "button";
      actionButton.className = "rl-toast-action";
      actionButton.textContent = actionLabel;
      actionButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        hideToast();
        onAction();
      });
      state.toastElement.appendChild(actionButton);
    }

    state.toastElement.classList.toggle("rl-error", isError);
    state.toastElement.classList.toggle("rl-has-action", hasAction);
    state.toastElement.classList.add("rl-visible");

    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = 0;

    if (!hasAction) {
      showToast.timeoutId = window.setTimeout(() => {
        hideToast();
      }, 2600);
    }
  }

  showToast.timeoutId = 0;

  function hideToast() {
    state.toastElement?.classList.remove("rl-visible", "rl-error", "rl-has-action");
  }

  function getVisibleToastActionButton() {
    if (!state.toastElement || !state.toastElement.classList.contains("rl-visible")) {
      return null;
    }

    const button = state.toastElement.querySelector(".rl-toast-action");
    if (!(button instanceof HTMLButtonElement)) {
      return null;
    }

    return button;
  }

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
