const { fetch: originalFetch } = window;
window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  const responseClone = response.clone();

  const headers = {};
  for (const [key, value] of responseClone.headers.entries()) {
    headers[key] = value;
  }

  const contentType = headers["content-type"] || "";
  let body;

  if (
    contentType.startsWith("image/") ||
    contentType.startsWith("video/") ||
    contentType.startsWith("audio/")
  ) {
    const arrayBuffer = await responseClone.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    body = Array.from(uint8Array);
  } else {
    body = await responseClone.text();
  }

  window.postMessage(
    {
      type: "SENATOR_RESPONSE",
      payload: {
        url: response.url,
        body,
        headers,
        status: response.status,
        statusText: response.statusText,
        type: "fetch",
        contentType,
      },
    },
    "*"
  );

  return response;
};

const originalXhrOpen = XMLHttpRequest.prototype.open;
const originalXhrSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function (method, url) {
  this._method = method;
  this._url = url;
  return originalXhrOpen.apply(this, arguments);
};

XMLHttpRequest.prototype.send = function () {
  this.addEventListener("load", () => {
    if (this.responseURL) {
      const contentType = this.getResponseHeader("content-type") || "";
      let body;

      if (
        contentType.startsWith("image/") ||
        contentType.startsWith("video/") ||
        contentType.startsWith("audio/")
      ) {
        if (this.response instanceof ArrayBuffer) {
          const uint8Array = new Uint8Array(this.response);
          body = Array.from(uint8Array);
        } else {
          body = this.response;
        }
      } else {
        body = this.response;
      }

      window.postMessage(
        {
          type: "SENATOR_RESPONSE",
          payload: {
            url: this.responseURL,
            body,
            headers: this.getAllResponseHeaders(),
            status: this.status,
            statusText: this.statusText,
            type: "xhr",
            contentType,
          },
        },
        "*"
      );
    }
  });
  return originalXhrSend.apply(this, arguments);
};
