(() => {
  // lib/api.js
  async function requestDeviceCode(clientId) {
    const response = await fetch("https://enter.pollinations.ai/api/device/code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId })
    });
    if (!response.ok) throw new Error("Could not start the sign-in. Try again.");
    return response.json();
  }
  async function pollDeviceToken({ deviceCode, clientId, interval = 5e3, signal }) {
    const deadline = Date.now() + 15 * 60 * 1e3;
    while (Date.now() < deadline) {
      if (signal?.aborted) throw new Error("Sign-in cancelled.");
      const response = await fetch("https://enter.pollinations.ai/api/device/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_code: deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          client_id: clientId
        })
      });
      const data = await response.json().catch(() => ({}));
      if (data.access_token) return data.access_token;
      if (data.error && data.error !== "authorization_pending" && data.error !== "slow_down") {
        throw new Error(data.error === "expired_token" ? "That code expired. Start again." : data.error);
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    throw new Error("Timed out waiting for approval.");
  }

  // background.js
  var CLIENT_ID = "";
  var pending = null;
  async function startSignIn() {
    const code = await requestDeviceCode(CLIENT_ID);
    pending = new AbortController();
    pollDeviceToken({
      deviceCode: code.device_code,
      clientId: CLIENT_ID,
      signal: pending.signal
    }).then((apiKey) => {
      chrome.storage.session.set({ apiKey });
      chrome.action.setBadgeText({ text: "" });
    }).catch(() => {
      chrome.action.setBadgeText({ text: "!" });
    });
    return {
      userCode: code.user_code,
      url: code.verification_uri_complete ?? code.verification_uri
    };
  }
  async function activeTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }
  async function ensureContentScript(tabId) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "status" });
    } catch {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    }
  }
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "sign-in") {
      startSignIn().then(sendResponse).catch((error) => sendResponse({ error: error.message }));
      return true;
    }
    if (message?.type === "sign-out") {
      pending?.abort();
      pending = null;
      chrome.storage.session.remove("apiKey").then(() => sendResponse({ ok: true }));
      return true;
    }
    if (message?.type === "toggle") {
      (async () => {
        const tab = await activeTab();
        if (!tab?.id) return { error: "No active tab." };
        await ensureContentScript(tab.id);
        const result = await chrome.tabs.sendMessage(tab.id, { type: "toggle" });
        return result;
      })().then(sendResponse).catch((error) => sendResponse({ error: error.message }));
      return true;
    }
    return false;
  });
})();
