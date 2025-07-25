const s = document.createElement("script");
s.src = chrome.runtime.getURL("interceptor.js");
s.onload = function () {
  this.remove();
};
(document.head || document.documentElement).appendChild(s);

let badgeContainer = null;
let badgeIframe = null;

function createBadge() {
  if (badgeContainer) return;

  badgeContainer = document.createElement("div");
  badgeContainer.id = "snitch-badge-container";
  badgeContainer.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 2147483647;
    width: 300px;
    height: 60px;
    pointer-events: all;
  `;

  badgeIframe = document.createElement("iframe");
  badgeIframe.src = chrome.runtime.getURL("badge.html");
  badgeIframe.style.cssText = `
    width: 100%;
    height: 100%;
    border: none;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  `;

  badgeContainer.appendChild(badgeIframe);
  document.body.appendChild(badgeContainer);

  chrome.runtime.sendMessage({
    action: "setCaptureState",
    isCapturing: true,
  });
}

function removeBadge() {
  if (badgeContainer) {
    badgeContainer.remove();
    badgeContainer = null;
    badgeIframe = null;

    chrome.runtime.sendMessage({
      action: "setCaptureState",
      isCapturing: false,
    });
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "showBadge") {
    createBadge();
    sendResponse({ success: true });
  } else if (request.action === "hideBadge") {
    removeBadge();
    sendResponse({ success: true });
  }
});

window.addEventListener("message", (event) => {
  if (event.source === window && event.data.type === "SENATOR_RESPONSE") {
    chrome.runtime.sendMessage(event.data);
  } else if (event.data.type === "SNITCH_CLOSE_BADGE") {
    removeBadge();
  }
});
