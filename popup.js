let currentTabId = null;
let currentLogs = [];
let hasApiKey = false;

document.addEventListener("DOMContentLoaded", async () => {
  await initializePopup();
  setupEventListeners();
});

async function initializePopup() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab.id;

  await loadApiKey();
  await loadLogs();
  updateStats();
}

function setupEventListeners() {
  document
    .getElementById("settingsBtn")
    .addEventListener("click", toggleSettings);

  const filterTabs = document.querySelectorAll(".filter-tab");
  filterTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      filterTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      filterLogs(tab.dataset.filter);
    });
  });

  document.getElementById("backBtn").addEventListener("click", showMainView);

  document
    .getElementById("analyzeBtn")
    .addEventListener("click", analyzeCurrentRequest);

  document
    .getElementById("fullscreenBtn")
    .addEventListener("click", () => toggleFullscreen("Request Body"));
  document
    .getElementById("fullscreenResponseBtn")
    .addEventListener("click", () => toggleFullscreen("Response Body"));
  document
    .getElementById("closeFullscreenBtn")
    .addEventListener("click", () => toggleFullscreen(null));
  document
    .getElementById("increaseFontBtn")
    .addEventListener("click", () => changeFontSize(2, "request"));
  document
    .getElementById("decreaseFontBtn")
    .addEventListener("click", () => changeFontSize(-2, "request"));
  document
    .getElementById("increaseResponseFontBtn")
    .addEventListener("click", () => changeFontSize(2, "response"));
  document
    .getElementById("decreaseResponseFontBtn")
    .addEventListener("click", () => changeFontSize(-2, "response"));

  document
    .getElementById("closeSettingsBtn")
    .addEventListener("click", toggleSettings);
  document
    .getElementById("saveApiKeyModal")
    .addEventListener("click", saveApiKey);
}

async function loadApiKey() {
  const response = await chrome.runtime.sendMessage({ action: "getApiKey" });
  if (response.apiKey) {
    document.getElementById("apiKeyInputModal").value = response.apiKey;
    hasApiKey = true;
  }
}

async function saveApiKey() {
  const apiKey = document.getElementById("apiKeyInputModal").value.trim();
  if (!apiKey) {
    alert("Please enter a valid OpenAI API key");
    return;
  }

  const response = await chrome.runtime.sendMessage({
    action: "setApiKey",
    apiKey: apiKey,
  });

  if (response.success) {
    hasApiKey = !!apiKey;
    showNotification(apiKey ? "API key saved." : "API key removed.");
    toggleSettings();

    if (document.getElementById("detailContent").style.display !== "none") {
      document.getElementById("analyzeBtn").style.display = hasApiKey
        ? "flex"
        : "none";
    }
  }
}

async function loadLogs() {
  const response = await chrome.runtime.sendMessage({
    action: "getLogs",
    tabId: currentTabId,
  });

  currentLogs = response.logs || [];
  filteredLogs = [...currentLogs];
  displayLogs();
  updateStats();
}

function displayLogs() {
  const container = document.getElementById("logsContainer");

  const successfulLogs = filteredLogs.filter(
    (log) => log.status >= 200 && log.status < 300
  );

  if (successfulLogs.length === 0) {
    container.innerHTML =
      '<div class="no-logs">No successful requests found for the selected filter.</div>';
    return;
  }

  const recentLogs = successfulLogs.slice(-20).reverse();
  container.innerHTML = recentLogs.map((log) => createLogItem(log)).join("");

  const logItems = container.querySelectorAll(".log-item");
  logItems.forEach((item, index) => {
    item.addEventListener("click", () => showLogDetails(recentLogs[index]));
  });
}

function createLogItem(log) {
  const statusClass = getStatusClass(log.status);
  const statusText =
    log.status >= 200 && log.status < 300 ? "Success" : "Failed";

  return `
    <div class="log-item">
        <div class="log-group">
            <span class="log-method ${log.method.toLowerCase()}">${
    log.method
  }</span>
            <span class="log-url">${truncateUrl(log.url)}</span>
        </div>
        <span class="log-status ${statusClass}">${statusText}</span>
    </div>
  `;
}

function getStatusClass(status) {
  if (status === "pending") return "status-pending";
  if (status === "error") return "status-error";
  if (status >= 200 && status < 300) return "status-success";
  return "status-error";
}

function truncateUrl(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const pathname = urlObj.pathname;

    if (pathname.length <= 30) {
      return hostname + pathname;
    }

    const pathStart = pathname.substring(0, 15);
    const pathEnd = pathname.substring(pathname.length - 15);

    return hostname + pathStart + "..." + pathEnd;
  } catch {
    if (url.length <= 50) {
      return url;
    }
    return url.substring(0, 25) + "..." + url.substring(url.length - 25);
  }
}

let filteredLogs = [];
let currentFilter = "ALL";
let currentDetailLog = null;

function updateStats() {
  const totalRequests = currentLogs.length;
  const successfulRequests = currentLogs.filter(
    (log) => log.status >= 200 && log.status < 300
  ).length;
  const failedRequests = totalRequests - successfulRequests;

  document.getElementById("totalRequests").textContent = totalRequests;
  document.getElementById("successfulRequests").textContent =
    successfulRequests;
  document.getElementById("failedRequests").textContent = failedRequests;
}

function filterLogs(method) {
  currentFilter = method;
  if (method === "ALL") {
    filteredLogs = [...currentLogs];
  } else {
    filteredLogs = currentLogs.filter((log) => log.method === method);
  }
  displayLogs();
}

function toggleSettings() {
  const settingsOverlay = document.getElementById("settings-overlay");
  settingsOverlay.classList.toggle("hidden");
}

function showLogDetails(log) {
  currentDetailLog = log;

  document.getElementById("mainContent").style.display = "none";
  document.getElementById("detailContent").style.display = "block";

  document.getElementById("detailTitle").textContent = `${log.method} Request`;

  const detailMethod = document.getElementById("detailMethod");
  detailMethod.textContent = log.method;
  detailMethod.className = `method-badge ${log.method.toLowerCase()}`;

  const detailStatus = document.getElementById("detailStatus");
  detailStatus.textContent = log.status;
  const statusType =
    log.status >= 200 && log.status < 300 ? "success" : "error";
  detailStatus.className = `status-badge ${statusType}`;

  document.getElementById("detailType").textContent = log.type;
  document.getElementById("detailTimestamp").textContent = new Date(
    log.timestamp
  ).toLocaleString();
  document.getElementById("detailUrl").textContent = log.url;

  const requestBodySection = document.getElementById("requestBodySection");
  if (log.requestBody) {
    requestBodySection.style.display = "block";
    const requestBodyContainer = document.getElementById("detailRequestBody");
    if (typeof log.requestBody === "object") {
      requestBodyContainer.innerHTML = formatJSON(log.requestBody);
    } else {
      requestBodyContainer.innerHTML = `<pre>${log.requestBody}</pre>`;
    }
  } else {
    requestBodySection.style.display = "none";
  }

  const responseBodySection = document.getElementById("responseBodySection");
  if (log.responseBody) {
    responseBodySection.style.display = "block";
    const responseBodyContainer = document.getElementById("detailResponseBody");
    try {
      const jsonData = JSON.parse(log.responseBody);
      responseBodyContainer.innerHTML = formatJSON(jsonData);
    } catch (e) {
      responseBodyContainer.innerHTML = `<pre>${log.responseBody}</pre>`;
    }
  } else {
    responseBodySection.style.display = "none";
  }

  const previewSection = document.getElementById("previewSection");
  const previewContent = document.getElementById("previewContent");

  if (log.method === "GET" && log.responseBody) {
    previewSection.style.display = "block";

    const contentType =
      log.responseContentType || getContentTypeFromHeaders(log.responseHeaders);

    if (contentType && contentType.startsWith("image/")) {
      if (Array.isArray(log.responseBody)) {
        const uint8Array = new Uint8Array(log.responseBody);
        const blob = new Blob([uint8Array], { type: contentType });
        const imageUrl = URL.createObjectURL(blob);
        previewContent.innerHTML = `<img src="${imageUrl}" alt="Response Image" />`;
      } else {
        previewContent.innerHTML = `<img src="${log.url}" alt="Response Image" />`;
      }
    } else if (contentType && contentType.startsWith("video/")) {
      if (Array.isArray(log.responseBody)) {
        const uint8Array = new Uint8Array(log.responseBody);
        const blob = new Blob([uint8Array], { type: contentType });
        const videoUrl = URL.createObjectURL(blob);
        previewContent.innerHTML = `<video controls><source src="${videoUrl}" type="${contentType}"></video>`;
      } else {
        previewContent.innerHTML = `<video controls><source src="${log.url}" type="${contentType}"></video>`;
      }
    } else if (contentType && contentType.startsWith("audio/")) {
      if (Array.isArray(log.responseBody)) {
        const uint8Array = new Uint8Array(log.responseBody);
        const blob = new Blob([uint8Array], { type: contentType });
        const audioUrl = URL.createObjectURL(blob);
        previewContent.innerHTML = `<audio controls><source src="${audioUrl}" type="${contentType}"></audio>`;
      } else {
        previewContent.innerHTML = `<audio controls><source src="${log.url}" type="${contentType}"></audio>`;
      }
    } else if (
      contentType &&
      (contentType.includes("json") || contentType.includes("javascript"))
    ) {
      try {
        const jsonData = JSON.parse(log.responseBody);
        previewContent.innerHTML = `<pre>${formatJSON(jsonData)}</pre>`;
      } catch (e) {
        previewContent.innerHTML = `<pre>${log.responseBody}</pre>`;
      }
    } else {
      previewContent.innerHTML = `<pre>${log.responseBody}</pre>`;
    }
  } else {
    previewSection.style.display = "none";
  }

  const responseHeadersSection = document.getElementById(
    "responseHeadersSection"
  );
  if (log.responseHeaders) {
    responseHeadersSection.style.display = "block";
    document.getElementById("detailResponseHeaders").innerHTML = formatHeaders(
      log.responseHeaders
    );
  } else {
    responseHeadersSection.style.display = "none";
  }

  const aiResult = document.getElementById("aiResult");
  aiResult.style.display = "none";

  const analyzeBtn = document.getElementById("analyzeBtn");
  if (hasApiKey) {
    analyzeBtn.style.display = "flex";
    analyzeBtn.disabled = false;
    analyzeBtn.querySelector("span").textContent = "Analyze with AI";
  } else {
    analyzeBtn.style.display = "none";
  }
}

function formatHeaders(headers) {
  if (!Array.isArray(headers)) return "";
  return headers
    .map(
      (header) =>
        `<div><span class="header-name">${header.name}:</span> ${header.value}</div>`
    )
    .join("");
}

function getContentTypeFromHeaders(headers) {
  if (!Array.isArray(headers)) return null;

  const contentTypeHeader = headers.find(
    (header) => header.name.toLowerCase() === "content-type"
  );

  return contentTypeHeader ? contentTypeHeader.value : null;
}

let isFullscreen = false;
let fullscreenType = null;

function toggleFullscreen(type) {
  const overlay = document.getElementById("fullscreen-overlay");
  isFullscreen = !isFullscreen;
  fullscreenType = isFullscreen ? type : null;

  if (isFullscreen) {
    const content =
      type === "Request Body"
        ? document.getElementById("detailRequestBody").innerText
        : document.getElementById("detailResponseBody").innerText;

    document.getElementById("fullscreen-title").innerText = type;
    document.getElementById("fullscreen-content").innerText = content;
    overlay.classList.remove("hidden");
  } else {
    overlay.classList.add("hidden");
  }
}

function changeFontSize(amount, type) {
  const content =
    type === "request"
      ? document.getElementById("detailRequestBody")
      : document.getElementById("detailResponseBody");

  const fullscreenContent = document.getElementById("fullscreen-content");

  const currentSize = parseInt(window.getComputedStyle(content).fontSize);
  const newSize = Math.max(8, currentSize + amount);

  content.style.fontSize = `${newSize}px`;
  if (
    fullscreenType &&
    ((type === "request" && fullscreenType === "Request Body") ||
      (type === "response" && fullscreenType === "Response Body"))
  ) {
    fullscreenContent.style.fontSize = `${newSize}px`;
  }
}

function formatJSON(obj) {
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }
  const jsonString = JSON.stringify(obj, null, 2);
  return jsonString
    .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
    .replace(/: "([^"]*)"/g, ': <span class="json-string">"$1"</span>')
    .replace(/\b(\d+\.?\d*)\b/g, '<span class="json-number">$1</span>')
    .replace(/\b(true|false)\b/g, '<span class="json-boolean">$1</span>')
    .replace(/\bnull\b/g, '<span class="json-null">null</span>');
}

function showMainView() {
  document.getElementById("detailContent").style.display = "none";
  document.getElementById("mainContent").style.display = "block";
}

function copyToClipboard(text) {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      showNotification("Copied to clipboard!");
    })
    .catch(() => {
      showNotification("Failed to copy to clipboard");
    });
}

async function analyzeCurrentRequest() {
  if (!currentDetailLog) return;

  const analyzeBtn = document.getElementById("analyzeBtn");
  const aiResult = document.getElementById("aiResult");

  analyzeBtn.disabled = true;
  analyzeBtn.querySelector("span").textContent = "Analyzing...";

  try {
    const response = await chrome.runtime.sendMessage({
      action: "explainRequest",
      requestData: currentDetailLog,
    });

    if (response.error) {
      aiResult.innerHTML = `<strong>Error:</strong> ${response.error}`;
    } else {
      aiResult.innerHTML = response.explanation;
    }

    aiResult.style.display = "block";
  } catch (error) {
    aiResult.innerHTML = `<strong>Error:</strong> ${error.message}`;
    aiResult.style.display = "block";
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.querySelector("span").textContent = "Analyze with AI";
  }
}

function showNotification(message) {
  const notification = document.createElement("div");
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #4CAF50;
    color: white;
    padding: 10px 20px;
    border-radius: 6px;
    z-index: 1000;
    animation: slideIn 0.3s ease-out;
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = "slideOut 0.3s ease-in";
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}
