const { fetch: originalFetch } = window;
window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  const responseClone = response.clone();

  const headers = {};
  for (const [key, value] of responseClone.headers.entries()) {
    headers[key] = value;
  }

  const body = await responseClone.text();

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
      window.postMessage(
        {
          type: "SENATOR_RESPONSE",
          payload: {
            url: this.responseURL,
            body: this.response,
            headers: this.getAllResponseHeaders(),
            status: this.status,
            statusText: this.statusText,
            type: "xhr",
          },
        },
        "*"
      );
    }
  });
  return originalXhrSend.apply(this, arguments);
};
