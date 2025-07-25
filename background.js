const STATE_KEYS = [
  "requestLogs",
  "tabCaptureState",
  "keptDomains",
  "openaiApiKey",
];
const MAX_LOGS = 50;
const MAX_BODY_SIZE_BYTES = 100 * 1024; // 100KB

async function getState() {
  const result = await chrome.storage.local.get(STATE_KEYS);
  return {
    requestLogs: result.requestLogs || {},
    tabCaptureState: result.tabCaptureState || {},
    keptDomains: result.keptDomains || [],
    openaiApiKey: result.openaiApiKey || "",
  };
}

async function setState(newState) {
  const stateToSave = {};
  for (const key of STATE_KEYS) {
    if (newState[key] !== undefined) {
      stateToSave[key] = newState[key];
    }
  }
  await chrome.storage.local.set(stateToSave);
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const state = await getState();
  delete state.tabCaptureState[tabId];
  delete state.requestLogs[tabId];
  await setState({
    tabCaptureState: state.tabCaptureState,
    requestLogs: state.requestLogs,
  });
});

chrome.webRequest.onBeforeRequest.addListener(
  async (details) => {
    const state = await getState();
    if (!state.tabCaptureState[details.tabId]) return;

    const tabId = details.tabId;
    if (tabId === -1) return;
    if (!state.requestLogs[tabId]) {
      state.requestLogs[tabId] = [];
    }

    const log = {
      id: Date.now() + Math.random(),
      requestId: details.requestId,
      timestamp: new Date().toISOString(),
      method: details.method,
      url: details.url,
      type: details.type,
      requestBody: null,
      responseBody: null,
      tabId: tabId,
      status: "pending",
      initiator: details.initiator,
      frameId: details.frameId,
    };

    if (["POST", "PUT", "PATCH"].includes(details.method)) {
      if (details.requestBody) {
        if (details.requestBody.formData) {
          log.requestBody = details.requestBody.formData;
        } else if (details.requestBody.raw) {
          try {
            const rawBody = details.requestBody.raw[0].bytes;
            const decodedBody = new TextDecoder("utf-8").decode(rawBody);
            try {
              log.requestBody = JSON.parse(decodedBody);
            } catch (e) {
              log.requestBody = decodedBody;
            }
          } catch (e) {
            console.error("Error parsing request body:", e);
          }
        }
      }
    }

    state.requestLogs[tabId].push(log);

    const keptLogs = [];
    const otherLogs = [];

    state.requestLogs[tabId].forEach((l) => {
      const domain = new URL(l.url).hostname;
      if (state.keptDomains.some((kd) => domain.includes(kd))) {
        keptLogs.push(l);
      } else {
        otherLogs.push(l);
      }
    });

    if (otherLogs.length > MAX_LOGS) {
      const trimmedOtherLogs = otherLogs.slice(otherLogs.length - MAX_LOGS);
      state.requestLogs[tabId] = [...keptLogs, ...trimmedOtherLogs].sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
      );
    }

    updateBadge(tabId, state.requestLogs);
    await saveLogs(state.requestLogs);
  },
  {
    urls: ["<all_urls>"],
    types: [
      "main_frame",
      "sub_frame",
      "stylesheet",
      "script",
      "image",
      "font",
      "object",
      "xmlhttprequest",
      "ping",
      "csp_report",
      "media",
      "websocket",
      "other",
    ],
  },
  ["requestBody"]
);

chrome.webRequest.onCompleted.addListener(
  async (details) => {
    const state = await getState();
    if (!state.tabCaptureState[details.tabId]) return;

    const tabId = details.tabId;
    if (tabId === -1 || !state.requestLogs[tabId]) return;

    const request = state.requestLogs[tabId].find(
      (r) =>
        r.requestId === details.requestId ||
        (r.url === details.url &&
          r.method === details.method &&
          r.status === "pending")
    );
    if (request) {
      request.status = details.statusCode;
      request.responseHeaders = details.responseHeaders;
      request.statusLine = details.statusLine;
      request.fromCache = details.fromCache;
      request.completed = true;

      if (details.fromCache || shouldFetchResponseBody(details)) {
        await fetchResponseBody(details.url, tabId, request);
      }

      updateBadge(tabId, state.requestLogs);
      await saveLogs(state.requestLogs);
    }
  },
  {
    urls: ["<all_urls>"],
    types: [
      "main_frame",
      "sub_frame",
      "stylesheet",
      "script",
      "image",
      "font",
      "object",
      "xmlhttprequest",
      "ping",
      "csp_report",
      "media",
      "websocket",
      "other",
    ],
  },
  ["responseHeaders"]
);

chrome.webRequest.onErrorOccurred.addListener(
  async (details) => {
    const state = await getState();
    if (!state.tabCaptureState[details.tabId]) return;

    const tabId = details.tabId;
    if (tabId === -1 || !state.requestLogs[tabId]) return;

    const request = state.requestLogs[tabId].find(
      (r) =>
        r.requestId === details.requestId ||
        (r.url === details.url &&
          r.method === details.method &&
          r.status === "pending")
    );
    if (request) {
      request.status = "error";
      request.error = details.error;
      request.completed = true;

      updateBadge(tabId, state.requestLogs);
      await saveLogs(state.requestLogs);
    }
  },
  {
    urls: ["<all_urls>"],
    types: [
      "main_frame",
      "sub_frame",
      "stylesheet",
      "script",
      "image",
      "font",
      "object",
      "xmlhttprequest",
      "ping",
      "csp_report",
      "media",
      "websocket",
      "other",
    ],
  }
);

function shouldFetchResponseBody(details) {
  const contentType =
    getContentTypeFromHeaders(details.responseHeaders) ||
    getContentTypeFromUrl(details.url);
  return (
    contentType &&
    (contentType.startsWith("text/") ||
      contentType.includes("json") ||
      contentType.includes("javascript") ||
      contentType.startsWith("image/") ||
      contentType.startsWith("video/") ||
      contentType.startsWith("audio/"))
  );
}

function getContentTypeFromHeaders(headers) {
  if (!Array.isArray(headers)) return null;
  const contentTypeHeader = headers.find(
    (header) => header.name.toLowerCase() === "content-type"
  );
  return contentTypeHeader ? contentTypeHeader.value : null;
}

async function fetchResponseBody(url, tabId, logEntry) {
  try {
    const response = await fetch(url);
    const contentType =
      response.headers.get("content-type") || getContentTypeFromUrl(url);

    if (!contentType) return;

    let body;
    if (
      contentType.startsWith("image/") ||
      contentType.startsWith("video/") ||
      contentType.startsWith("audio/")
    ) {
      const arrayBuffer = await response.arrayBuffer();
      body = Array.from(new Uint8Array(arrayBuffer));
    } else {
      body = await response.text();
    }

    logEntry.responseBody = body;
    logEntry.responseContentType = contentType;

    const state = await getState();
    await saveLogs(state.requestLogs);
  } catch (error) {
    console.log("Could not fetch response body for:", url, error.message);
  }
}

function updateBadge(tabId, requestLogs) {
  const allRequests = requestLogs[tabId] || [];
  const count = allRequests.length;

  chrome.action.setBadgeText({ text: count.toString(), tabId: tabId });
  chrome.action.setBadgeBackgroundColor({ color: "#4CAF50", tabId: tabId });

  chrome.runtime.sendMessage({ action: "updateLogs" }).catch((e) => {});
}

async function saveLogs(requestLogs) {
  const logsToSave = JSON.parse(JSON.stringify(requestLogs));

  for (const tabId in logsToSave) {
    logsToSave[tabId].forEach((log) => {
      if (log.responseBody) {
        if (
          typeof log.responseBody === "object" &&
          Array.isArray(log.responseBody)
        ) {
          log.responseBody = null; // Don't save binary data
          return;
        }

        const contentType = log.responseContentType || "";
        if (
          contentType.startsWith("image/") ||
          contentType.startsWith("video/") ||
          contentType.startsWith("audio/")
        ) {
          log.responseBody = null; // Don't save binary data
          return;
        }

        if (
          typeof log.responseBody === "string" &&
          log.responseBody.length > MAX_BODY_SIZE_BYTES
        ) {
          log.responseBody = log.responseBody.substring(0, MAX_BODY_SIZE_BYTES);
          log.isTruncated = true;
        }
      }
    });
  }

  await setState({ requestLogs: logsToSave });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    const state = await getState();
    if (request.action === "getLogs") {
      sendResponse({ logs: state.requestLogs[request.tabId] || [] });
    } else if (request.action === "setCaptureState") {
      const tabId = request.tabId || sender.tab?.id;
      if (tabId) {
        state.tabCaptureState[tabId] = request.isCapturing;
        if (!request.isCapturing) {
          chrome.action.setBadgeText({ text: "", tabId: tabId });
        }
        await setState({ tabCaptureState: state.tabCaptureState });

        chrome.runtime
          .sendMessage({
            action: "captureStateChanged",
            isCapturing: request.isCapturing,
            tabId: tabId,
          })
          .catch(() => {});
      }
      sendResponse({ success: true });
    } else if (request.action === "getCaptureState") {
      sendResponse(state.tabCaptureState[request.tabId] || false);
    } else if (request.action === "getKeptDomains") {
      sendResponse(state.keptDomains);
    } else if (request.action === "setKeptDomains") {
      state.keptDomains = request.domains;
      await setState({ keptDomains: state.keptDomains });
      sendResponse({ success: true });
    } else if (request.type === "SENATOR_RESPONSE") {
      const tabId = sender.tab?.id;
      if (tabId && state.tabCaptureState[tabId] && state.requestLogs[tabId]) {
        const log = state.requestLogs[tabId].find(
          (r) =>
            r.url === request.payload.url &&
            (!r.responseBody || r.responseBody === null) &&
            Math.abs(new Date(r.timestamp).getTime() - Date.now()) < 30000
        );
        if (log) {
          log.responseBody = request.payload.body;
          log.responseType = request.payload.type;
          log.responseContentType =
            request.payload.contentType ||
            request.payload.headers["content-type"];
          await saveLogs(state.requestLogs);
        }
      }
    } else if (request.action === "clearLogs") {
      const tabId = request.tabId || sender.tab?.id;
      if (tabId && state.requestLogs[tabId]) {
        state.requestLogs[tabId] = [];
      }
      await saveLogs(state.requestLogs);
      chrome.action.setBadgeText({ text: "", tabId: tabId });
      sendResponse({ success: true });
    } else if (request.action === "setApiKey") {
      state.openaiApiKey = request.apiKey;
      await setState({ openaiApiKey: state.openaiApiKey });
      sendResponse({ success: true });
    } else if (request.action === "getApiKey") {
      sendResponse({ apiKey: state.openaiApiKey });
    } else if (request.action === "explainRequest") {
      explainRequest(request.requestData, state.openaiApiKey).then(
        sendResponse
      );
    }
  })();
  return true;
});

async function explainRequest(requestData, openaiApiKey) {
  if (!openaiApiKey) {
    return { error: "OpenAI API key not set" };
  }

  const prompt = `Analyze this network request and provide a clear explanation for non-technical users:

URL: ${requestData.url}
Method: ${requestData.method}
Status: ${requestData.status}
Type: ${requestData.type}

Headers: ${JSON.stringify(requestData.responseHeaders || {}, null, 2)}
Body: ${JSON.stringify(requestData.requestBody || {}, null, 2)}

Please explain:
1. What this request does
2. Why it might have been made
3. Any potential issues or interesting aspects
4. What the response status means

Keep it simple and non-technical.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    return { explanation: data.choices[0].message.content };
  } catch (error) {
    return { error: "Failed to get explanation: " + error.message };
  }
}

function getContentTypeFromUrl(url) {
  const extension = url.split(".").pop().toLowerCase();
  const imageExtensions = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"];
  const videoExtensions = ["mp4", "webm", "ogg", "avi", "mov"];
  const audioExtensions = ["mp3", "wav", "ogg", "aac", "m4a"];

  if (imageExtensions.includes(extension)) {
    return `image/${extension === "jpg" ? "jpeg" : extension}`;
  } else if (videoExtensions.includes(extension)) {
    return `video/${extension}`;
  } else if (audioExtensions.includes(extension)) {
    return `audio/${extension}`;
  }
  return null;
}
