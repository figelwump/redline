const CONTENT_SCRIPT_FILES = ["content.js"];
const CONTENT_STYLE_FILES = ["content.css"];
const NATIVE_HOST_NAME = "com.claude.feedback";

async function ensureContentScript(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "redline:ping" });
    if (response?.ready) {
      return;
    }
  } catch (_error) {
    // Injection happens below when no listener is present on the tab.
  }

  await chrome.scripting.insertCSS({
    target: { tabId },
    files: CONTENT_STYLE_FILES,
  });

  await chrome.scripting.executeScript({
    target: { tabId },
    files: CONTENT_SCRIPT_FILES,
  });
}

async function toggleAnnotationMode(tab) {
  if (!tab.id) {
    return;
  }

  await ensureContentScript(tab.id);
  await chrome.tabs.sendMessage(tab.id, { type: "redline:toggle" });
}

async function captureAndSave(message, sender) {
  const senderTab = sender.tab;
  if (!senderTab?.windowId) {
    throw new Error("Capture request did not include tab context.");
  }

  let captureDataUrl;
  try {
    captureDataUrl = await chrome.tabs.captureVisibleTab(senderTab.windowId, {
      format: "png",
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown failure while capturing the visible tab.";
    throw new Error(`Failed to capture visible tab: ${errorMessage}`);
  }

  if (typeof captureDataUrl !== "string" || !captureDataUrl.startsWith("data:image/png")) {
    throw new Error("Screenshot capture returned an invalid PNG payload.");
  }

  const metadata = {
    ...(message?.metadata ?? {}),
    tabUrl: senderTab.url ?? null,
    capturedAt: new Date().toISOString(),
  };

  const nativeResponse = await chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, {
    action: "save",
    dataUrl: captureDataUrl,
    metadata,
  });

  if (!nativeResponse?.success) {
    throw new Error(nativeResponse?.error ?? "Native messaging host failed to save screenshot.");
  }

  return {
    success: true,
    path: nativeResponse.path,
  };
}

chrome.action.onClicked.addListener(async (tab) => {
  try {
    await toggleAnnotationMode(tab);
  } catch (error) {
    console.error("[redline] failed to toggle annotation mode", error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "redline:capture") {
    return false;
  }

  captureAndSave(message, sender)
    .then((result) => {
      sendResponse(result);
    })
    .catch((error) => {
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : "Unexpected capture error",
      });
    });

  return true;
});
