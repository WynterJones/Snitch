const s = document.createElement("script");
s.src = chrome.runtime.getURL("interceptor.js");
s.onload = function () {
  this.remove();
};
(document.head || document.documentElement).appendChild(s);

window.addEventListener("message", (event) => {
  if (event.source === window && event.data.type === "SENATOR_RESPONSE") {
    chrome.runtime.sendMessage(event.data);
  }
});
