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

  const startCaptureBtn = document.getElementById("startCaptureBtn");
  const isCapturing = await chrome.runtime.sendMessage({
    action: "getCaptureState",
    tabId: currentTabId,
  });

  updateCaptureButton(isCapturing);

  startCaptureBtn.addEventListener("click", async () => {
    const currentState = await chrome.runtime.sendMessage({
      action: "getCaptureState",
      tabId: currentTabId,
    });

    if (!currentState) {
      await chrome.tabs.sendMessage(currentTabId, { action: "showBadge" });
    }
  });

  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "updateLogs") {
      loadLogs();
    } else if (request.action === "captureStateChanged") {
      updateCaptureButton(request.isCapturing);
      if (request.isCapturing) {
        loadLogs();
      }
    }
  });

  await loadSettings();
  await loadLogs();
}

function updateCaptureButton(isCapturing) {
  const startCaptureBtn = document.getElementById("startCaptureBtn");

  if (isCapturing) {
    startCaptureBtn.title = "Already Capturing";
    startCaptureBtn.style.opacity = "0.6";
    startCaptureBtn.style.cursor = "not-allowed";
    startCaptureBtn.disabled = true;
  } else {
    startCaptureBtn.title = "Start Capturing";
    startCaptureBtn.style.opacity = "1";
    startCaptureBtn.style.cursor = "pointer";
    startCaptureBtn.disabled = false;
  }
}

async function loadSettings() {
  await loadApiKey();
  await loadKeptDomains();
}

function setupEventListeners() {
  document
    .getElementById("settingsBtn")
    .addEventListener("click", toggleSettings);

  document.getElementById("clearBtn").addEventListener("click", clearLogs);

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
    .getElementById("saveSettingsBtn")
    .addEventListener("click", saveSettings);
}

async function loadApiKey() {
  const response = await chrome.runtime.sendMessage({ action: "getApiKey" });
  if (response.apiKey) {
    document.getElementById("apiKeyInputModal").value = response.apiKey;
    hasApiKey = true;
  }
}

async function loadKeptDomains() {
  const domains = await chrome.runtime.sendMessage({
    action: "getKeptDomains",
  });
  document.getElementById("keptDomainsInput").value = domains.join(", ");
}

async function saveSettings() {
  await saveApiKey();
  await saveKeptDomains();
  toggleSettings();
  loadLogs(); // Reload logs to apply highlighting
}

async function saveKeptDomains() {
  const domains = document
    .getElementById("keptDomainsInput")
    .value.split(",")
    .map((d) => d.trim())
    .filter(Boolean);

  await chrome.runtime.sendMessage({
    action: "setKeptDomains",
    domains: domains,
  });
  showNotification("Kept domains saved.");
}

async function saveApiKey() {
  const apiKey = document.getElementById("apiKeyInputModal").value.trim();
  if (!apiKey) {
    // Silently ignore if no key is entered, but clear it if it was there before.
    if (hasApiKey) {
      await chrome.runtime.sendMessage({ action: "setApiKey", apiKey: "" });
      hasApiKey = false;
      showNotification("API key removed.");
    }
    return;
  }

  const response = await chrome.runtime.sendMessage({
    action: "setApiKey",
    apiKey: apiKey,
  });

  if (response.success) {
    hasApiKey = !!apiKey;
    showNotification("API key saved.");
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
  filterLogs(currentFilter);
}

function displayLogs() {
  const container = document.getElementById("logsContainer");

  if (filteredLogs.length === 0) {
    container.innerHTML =
      '<tr class="no-logs"><td colspan="4">No requests found for the selected filter.</td></tr>';
    return;
  }

  const recentLogs = filteredLogs.slice(-50).reverse();
  container.innerHTML = recentLogs
    .map((log) => createLogTableRow(log))
    .join("");

  const logRows = container.querySelectorAll("tr:not(.no-logs)");
  logRows.forEach((row, index) => {
    row.addEventListener("click", () => showLogDetails(recentLogs[index]));
  });
}

function createLogTableRow(log) {
  const url = new URL(log.url);
  const fileName = url.pathname.split("/").pop() || url.hostname;
  const domain = url.hostname;

  const statusClass = getStatusClass(log.status);
  const statusText =
    log.status === "pending"
      ? "PENDING"
      : log.status === "error"
      ? "ERROR"
      : log.status;

  const keptDomains = document
    .getElementById("keptDomainsInput")
    .value.split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  const isKept = keptDomains.some((kd) => domain.includes(kd));
  const rowClass = isKept ? "kept-row" : "";

  return `
    <tr class="${rowClass}">
      <td class="request-name">${fileName}</td>
      <td><span class="request-method ${log.method.toLowerCase()}">${
    log.method
  }</span></td>
      <td class="request-status ${statusClass}">${statusText}</td>
      <td class="request-domain">${domain}</td>
    </tr>
  `;
}

function getStatusClass(status) {
  if (status === "pending") return "status-pending";
  if (status === "error") return "status-error";
  if (typeof status === "number") {
    if (status >= 200 && status < 300) return "status-success";
    if (status >= 300 && status < 400) return "status-redirect";
    if (status >= 400) return "status-error";
  }
  return "status-error";
}

let filteredLogs = [];
let currentFilter = "ALL";
let currentDetailLog = null;

function filterLogs(method) {
  currentFilter = method;
  if (method === "ALL") {
    filteredLogs = [...currentLogs];
  } else if (method === "SUCCESS") {
    filteredLogs = currentLogs.filter(
      (log) => log.status >= 200 && log.status < 300
    );
  } else if (method === "FAILED") {
    filteredLogs = currentLogs.filter(
      (log) =>
        (typeof log.status === "number" &&
          (log.status < 200 || log.status >= 300)) ||
        log.status === "error" ||
        log.status === "pending"
    );
  } else if (method === "FAVORITES") {
    const keptDomains = document
      .getElementById("keptDomainsInput")
      .value.split(",")
      .map((d) => d.trim())
      .filter(Boolean);

    filteredLogs = currentLogs.filter((log) => {
      const domain = new URL(log.url).hostname;
      return keptDomains.some((kd) => domain.includes(kd));
    });
  } else if (method === "MEDIA") {
    filteredLogs = currentLogs.filter(
      (log) => log.type === "image" || log.type === "media"
    );
  } else if (method === "SCRIPTS") {
    filteredLogs = currentLogs.filter((log) => log.type === "script");
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

  document.body.scrollTop = 0;
  document.documentElement.scrollTop = 0;

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
  document.getElementById(
    "detailUrl"
  ).innerHTML = `<a href="${log.url}" target="_blank" rel="noopener noreferrer" style="color: var(--accent-gold); text-decoration: none;">${log.url}</a>`;

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

    const contentType =
      log.responseContentType || getContentTypeFromHeaders(log.responseHeaders);

    if (
      (contentType && contentType.startsWith("text/")) ||
      (contentType && contentType.includes("javascript")) ||
      (contentType && contentType.includes("json"))
    ) {
      try {
        let content = "";
        if (log.isTruncated) {
          content += `<div class="truncation-warning">Response body truncated to 100KB</div>`;
        }
        if (contentType.includes("json")) {
          const jsonData = JSON.parse(log.responseBody);
          content += formatJSON(jsonData);
        } else {
          content += `<pre>${log.responseBody}</pre>`;
        }
        responseBodyContainer.innerHTML = content;
      } catch (e) {
        responseBodyContainer.innerHTML = `<pre>${log.responseBody}</pre>`;
      }
    } else {
      responseBodyContainer.innerHTML =
        '<div class="binary-content">Binary content - see preview section below</div>';
    }
  } else {
    responseBodySection.style.display = "block";
    const responseBodyContainer = document.getElementById("detailResponseBody");
    const contentType = getContentTypeFromHeaders(log.responseHeaders);
    responseBodyContainer.innerHTML = `<div class="binary-content">Response body not captured.<br><br>Content-Type: ${
      contentType || "unknown"
    }<br>Status: ${log.status}<br>From Cache: ${
      log.fromCache ? "Yes" : "No"
    }</div>`;
  }

  const mediaPreviewSection = document.getElementById("mediaPreviewSection");
  mediaPreviewSection.style.display = "none";

  const iframePreviewSection = document.getElementById("iframePreviewSection");
  iframePreviewSection.style.display = "none";

  if (
    log.type === "xmlhttprequest" &&
    typeof log.responseBody === "string" &&
    log.responseBody.trim().startsWith("<")
  ) {
    iframePreviewSection.style.display = "block";
    const iframeContent = document.getElementById("iframePreviewContent");
    const iframe = document.createElement("iframe");
    iframe.srcdoc = log.responseBody;
    iframeContent.innerHTML = "";
    iframeContent.appendChild(iframe);
    previewSection.style.display = "none";
  }

  const previewSection = document.getElementById("previewSection");
  const previewContent = document.getElementById("previewContent");

  if (log.responseBody) {
    previewSection.style.display = "block";

    const contentType =
      log.responseContentType || getContentTypeFromHeaders(log.responseHeaders);

    if (contentType && contentType.startsWith("image/")) {
      if (Array.isArray(log.responseBody)) {
        const uint8Array = new Uint8Array(log.responseBody);
        const blob = new Blob([uint8Array], { type: contentType });
        const imageUrl = URL.createObjectURL(blob);
        previewContent.innerHTML = `<img src="${imageUrl}" alt="Response Image" style="max-width: 100%; height: auto;" />`;
      } else {
        previewContent.innerHTML = `<img src="${log.url}" alt="Response Image" style="max-width: 100%; height: auto;" />`;
      }
    } else if (contentType && contentType.startsWith("video/")) {
      if (Array.isArray(log.responseBody)) {
        const uint8Array = new Uint8Array(log.responseBody);
        const blob = new Blob([uint8Array], { type: contentType });
        const videoUrl = URL.createObjectURL(blob);
        previewContent.innerHTML = `<video controls style="max-width: 100%;"><source src="${videoUrl}" type="${contentType}"></video>`;
      } else {
        previewContent.innerHTML = `<video controls style="max-width: 100%;"><source src="${log.url}" type="${contentType}"></video>`;
      }
    } else if (contentType && contentType.startsWith("audio/")) {
      if (Array.isArray(log.responseBody)) {
        const uint8Array = new Uint8Array(log.responseBody);
        const blob = new Blob([uint8Array], { type: contentType });
        const audioUrl = URL.createObjectURL(blob);
        previewContent.innerHTML = `<audio controls style="width: 100%;"><source src="${audioUrl}" type="${contentType}"></audio>`;
      } else {
        previewContent.innerHTML = `<audio controls style="width: 100%;"><source src="${log.url}" type="${contentType}"></audio>`;
      }
    } else if (
      contentType &&
      (contentType.includes("json") ||
        contentType.includes("javascript") ||
        contentType.includes("text/"))
    ) {
      try {
        if (contentType.includes("json")) {
          const jsonData = JSON.parse(log.responseBody);
          previewContent.innerHTML = `<pre>${formatJSON(jsonData)}</pre>`;
        } else {
          previewContent.innerHTML = `<pre>${log.responseBody}</pre>`;
        }
      } catch (e) {
        previewContent.innerHTML = `<pre>${log.responseBody}</pre>`;
      }
    } else {
      previewContent.innerHTML =
        '<div class="no-preview">No preview available for this content type</div>';
    }
  } else {
    previewSection.style.display = "block";
    const contentType = getContentTypeFromHeaders(log.responseHeaders);

    if (contentType && contentType.startsWith("image/")) {
      previewContent.innerHTML = `<img src="${log.url}" alt="Response Image" style="max-width: 100%; height: auto;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" /><div style="display: none;" class="no-preview">Image could not be loaded from URL</div>`;
    } else if (contentType && contentType.startsWith("video/")) {
      previewContent.innerHTML = `<video controls style="max-width: 100%;"><source src="${log.url}" type="${contentType}" onerror="this.parentElement.style.display='none'; this.parentElement.nextElementSibling.style.display='block';"></video><div style="display: none;" class="no-preview">Video could not be loaded from URL</div>`;
    } else if (contentType && contentType.startsWith("audio/")) {
      previewContent.innerHTML = `<audio controls style="width: 100%;"><source src="${log.url}" type="${contentType}" onerror="this.parentElement.style.display='none'; this.parentElement.nextElementSibling.style.display='block';"></audio><div style="display: none;" class="no-preview">Audio could not be loaded from URL</div>`;
    } else {
      previewContent.innerHTML =
        '<div class="no-preview">No response body captured - cannot display preview</div>';
    }
  }

  if (
    contentType &&
    (contentType.startsWith("image/") ||
      contentType.startsWith("video/") ||
      contentType.startsWith("audio/"))
  ) {
    mediaPreviewSection.style.display = "block";
    const mediaPreviewContent = document.getElementById("mediaPreviewContent");
    mediaPreviewContent.innerHTML = `
      <p>This is a media file. To view it, open it in a new tab.</p>
      <a href="${log.url}" target="_blank" rel="noopener noreferrer" class="btn">Open Media</a>
    `;
    responseBodySection.style.display = "none";
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

async function clearLogs() {
  await chrome.runtime.sendMessage({
    action: "clearLogs",
    tabId: currentTabId,
  });
  loadLogs();
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
