if (!window.__SNITCH_INTERCEPTOR_LOADED__) {
  window.__SNITCH_INTERCEPTOR_LOADED__ = true;

  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);

    try {
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
        try {
          const arrayBuffer = await responseClone.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          body = Array.from(uint8Array);
        } catch (e) {
          body = null;
        }
      } else if (
        contentType.includes("json") ||
        contentType.includes("text/") ||
        contentType.includes("javascript") ||
        contentType.includes("xml")
      ) {
        try {
          body = await responseClone.text();
        } catch (e) {
          body = null;
        }
      } else {
        body = null;
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
    } catch (error) {
      console.log("Error intercepting fetch response:", error);
    }

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
        try {
          const contentType = this.getResponseHeader("content-type") || "";
          let body;

          if (
            contentType.startsWith("image/") ||
            contentType.startsWith("video/") ||
            contentType.startsWith("audio/")
          ) {
            try {
              if (this.response instanceof ArrayBuffer) {
                const uint8Array = new Uint8Array(this.response);
                body = Array.from(uint8Array);
              } else {
                body = this.response;
              }
            } catch (e) {
              body = null;
            }
          } else if (
            contentType.includes("json") ||
            contentType.includes("text/") ||
            contentType.includes("javascript") ||
            contentType.includes("xml")
          ) {
            try {
              body = this.response;
            } catch (e) {
              body = null;
            }
          } else {
            body = null;
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
        } catch (error) {
          console.log("Error intercepting XHR response:", error);
        }
      }
    });
    return originalXhrSend.apply(this, arguments);
  };
}
