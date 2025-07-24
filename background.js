let requestLogs = {};
let openaiApiKey = "";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["openaiApiKey"], (result) => {
    if (result.openaiApiKey) {
      openaiApiKey = result.openaiApiKey;
    }
  });
});

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const tabId = details.tabId;
    if (tabId === -1) return;

    if (!requestLogs[tabId]) {
      requestLogs[tabId] = [];
    }

    const log = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toISOString(),
      method: details.method,
      url: details.url,
      type: details.type,
      requestBody: null, // Initialize as null
      tabId: tabId,
      status: "pending",
    };

    if (details.method === "POST" || details.method === "PUT") {
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

    requestLogs[tabId].push(log);
    updateBadge(tabId);
    saveLogs();
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

chrome.webRequest.onCompleted.addListener(
  (details) => {
    const tabId = details.tabId;
    if (tabId === -1 || !requestLogs[tabId]) return;

    const request = requestLogs[tabId].find(
      (r) => r.url === details.url && r.method === details.method
    );
    if (request) {
      request.status = details.statusCode;
      request.responseHeaders = details.responseHeaders;
      request.statusLine = details.statusLine;
      request.fromCache = details.fromCache;
      request.completed = true;

      updateBadge(tabId);
      saveLogs();
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    const tabId = details.tabId;
    if (tabId === -1 || !requestLogs[tabId]) return;

    const request = requestLogs[tabId].find(
      (r) => r.url === details.url && r.method === details.method
    );
    if (request) {
      request.status = "error";
      request.error = details.error;
      request.completed = true;

      updateBadge(tabId);
      saveLogs();
    }
  },
  { urls: ["<all_urls>"] }
);

function updateBadge(tabId) {
  const count = requestLogs[tabId] ? requestLogs[tabId].length : 0;
  chrome.action.setBadgeText({ text: count.toString(), tabId: tabId });
  chrome.action.setBadgeBackgroundColor({ color: "#4CAF50", tabId: tabId });
}

function saveLogs() {
  chrome.storage.local.set({ requestLogs: requestLogs });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getLogs") {
    const tabId = request.tabId || sender.tab?.id;
    sendResponse({ logs: requestLogs[tabId] || [] });
  } else if (request.type === "SENATOR_RESPONSE") {
    const tabId = sender.tab?.id;
    if (tabId && requestLogs[tabId]) {
      const log = requestLogs[tabId].find((r) => r.url === request.payload.url);
      if (log) {
        log.responseBody = request.payload.body;
        saveLogs();
      }
    }
  } else if (request.action === "clearLogs") {
    const tabId = request.tabId || sender.tab?.id;
    if (tabId) {
      delete requestLogs[tabId];
      saveLogs();
    }
  } else if (request.action === "setApiKey") {
    openaiApiKey = request.apiKey;
    chrome.storage.local.set({ openaiApiKey: request.apiKey });
    sendResponse({ success: true });
  } else if (request.action === "getApiKey") {
    sendResponse({ apiKey: openaiApiKey });
  } else if (request.action === "explainRequest") {
    explainRequest(request.requestData).then(sendResponse);
    return true;
  }
});

async function explainRequest(requestData) {
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

chrome.tabs.onRemoved.addListener((tabId) => {
  delete requestLogs[tabId];
  saveLogs();
});

chrome.storage.local.get(["requestLogs", "openaiApiKey"], (result) => {
  if (result.requestLogs) {
    requestLogs = result.requestLogs;
  }
  if (result.openaiApiKey) {
    openaiApiKey = result.openaiApiKey;
  }
});
