/**
 * Background service worker: owns the device-flow sign-in and forwards the
 * toolbar's toggle to the tab the reader is looking at.
 */

import { pollDeviceToken, requestDeviceCode } from "./lib/api.js";

// The extension's publishable app key. Create one at
// https://enter.pollinations.ai/keys with this extension's redirect URL.
// Empty means the consent screen falls back to the redirect hostname and
// traffic is not attributed to a Pollinations account.
const CLIENT_ID = "";

let pending = null;

async function startSignIn() {
    const code = await requestDeviceCode(CLIENT_ID);
    pending = new AbortController();
    pollDeviceToken({
        deviceCode: code.device_code,
        clientId: CLIENT_ID,
        signal: pending.signal,
    })
        .then((apiKey) => {
            chrome.storage.session.set({ apiKey });
            chrome.action.setBadgeText({ text: "" });
        })
        .catch(() => {
            chrome.action.setBadgeText({ text: "!" });
        });
    return {
        userCode: code.user_code,
        url: code.verification_uri_complete ?? code.verification_uri,
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
        startSignIn()
            .then(sendResponse)
            .catch((error) => sendResponse({ error: error.message }));
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
        })()
            .then(sendResponse)
            .catch((error) => sendResponse({ error: error.message }));
        return true;
    }
    return false;
});
