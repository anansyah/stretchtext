/**
 * Where the reader's Pollen key lives. sessionStorage only: the key dies with
 * the tab, and nothing is written to disk or to sync storage.
 */

const KEY = "stretchtext.apiKey";
const MODEL = "stretchtext.model";

export function getKey() {
    try {
        return sessionStorage.getItem(KEY) || "";
    } catch {
        return "";
    }
}

export function setKey(apiKey) {
    sessionStorage.setItem(KEY, apiKey);
    chrome.runtime.sendMessage({ type: "key-changed" }).catch(() => {});
}

export function clearKey() {
    sessionStorage.removeItem(KEY);
    chrome.runtime.sendMessage({ type: "key-changed" }).catch(() => {});
}

export function getModel() {
    try {
        return localStorage.getItem(MODEL) || "";
    } catch {
        return "";
    }
}

export function setModel(model) {
    localStorage.setItem(MODEL, model);
}
