/**
 * DOM test: run the real content script in jsdom and click a phrase, to prove
 * the page is actually rewritten and the click grows and shrinks it.
 *
 * The content script talks to chrome.*, so the test provides the small surface
 * the script uses.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

import vm from "node:vm";

const SCRIPT = await readFile(new URL("../dist/content.js", import.meta.url), "utf8");

const PARAGRAPH =
    "Stretchtext is a hypertext feature that lets a reader expand a passage in place. " +
    "Ted Nelson described it in 1967, and it never caught on because writing every level by hand was too much work. " +
    "Generated text makes the extra levels cheap enough to be worth writing.";

function makePage({ apiKey = "sk_test_key" } = {}) {
    const dom = new JSDOM(
        `<!doctype html><html><body><article><p id="p">${PARAGRAPH}</p></article></body></html>`,
        { pretendToBeVisual: true, url: "https://example.com/story" },
    );
    const { window } = dom;
    const listeners = [];
    const storage = new Map();
    if (apiKey) storage.set("stretchtext.apiKey", apiKey);

    window.chrome = {
        runtime: {
            onMessage: {
                addListener: (fn) => listeners.push(fn),
            },
            sendMessage: async () => ({}),
        },
    };
    // Storage in jsdom is a real Storage object with prototypal methods; the
    // bundle reads through the instance, so define own properties to win.
    Object.defineProperty(window, "sessionStorage", {
        configurable: true,
        value: {
            getItem: (key) => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, value),
            removeItem: (key) => storage.delete(key),
        },
    });
    Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: {
            getItem: (key) => null,
            setItem: () => {},
            removeItem: () => {},
        },
    });
    // jsdom has no layout, so visibility checks are stubbed to "visible".
    window.HTMLElement.prototype.getBoundingClientRect = () => ({
        width: 640,
        height: 20,
        top: 0,
        left: 0,
        bottom: 20,
        right: 640,
    });

    // jsdom implements textContent but not innerText, which the content script
    // reads. Map it to textContent for the test only.
    Object.defineProperty(window.HTMLElement.prototype, "innerText", {
        configurable: true,
        get() {
            return this.textContent;
        },
        set(value) {
            this.textContent = value;
        },
    });

    return { dom, window, listeners };
}

function runScript(window) {
    // jsdom's own global is reachable through the DOM constructor; running the
    // bundle there gives it document, chrome and fetch exactly like a tab.
    const context = window.document.defaultView;
    if (!context.__stretchtext) {
        const script = new vm.Script(SCRIPT);
        script.runInContext(vm.createContext(context, { name: "page" }));
        context.__stretchtext = true;
    }
}



function toggle(listeners) {
    const listener = listeners[0];
    let response;
    listener({ type: "toggle" }, {}, (value) => {
        response = value;
    });
    return response;
}

test("activating rewrites the paragraph into clickable phrases", () => {
    const { window, listeners } = makePage();
    runScript(window);
    const paragraph = window.document.getElementById("p");
    assert.equal(paragraph.querySelectorAll(".stretchtext-phrase").length, 0);

    const response = toggle(listeners);
    assert.equal(response.active, true);
    assert.equal(response.hasKey, true);

    const phrases = paragraph.querySelectorAll(".stretchtext-phrase");
    assert.ok(phrases.length >= 4, `expected several phrases, got ${phrases.length}`);
    // The reading order is preserved: joining the spans gives the sentence back.
    const rebuilt = paragraph.textContent.replace(/\s+/g, " ").trim();
    assert.equal(rebuilt, PARAGRAPH.replace(/\s+/g, " ").trim());
});

test("clicking a phrase grows it in place, clicking again shrinks it", async () => {
    const { window, listeners } = makePage();
    let calls = 0;
    window.fetch = async () => {
        calls += 1;
        return Response.json({
            choices: [
                {
                    message: {
                        content:
                            "Nelson meant text that grows where the reader wants more and folds back where they do not.",
                    },
                },
            ],
        });
    };
    runScript(window);
    toggle(listeners);

    const paragraph = window.document.getElementById("p");
    const first = paragraph.querySelector(".stretchtext-phrase");
    const originalText = first.textContent;

    first.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    const detail = paragraph.querySelector(".stretchtext-detail");
    assert.ok(detail, "the phrase should be replaced by a detail span");
    assert.match(detail.textContent, /grows where the reader wants more/);
    assert.equal(calls, 1);
    assert.equal(paragraph.querySelectorAll(".stretchtext-phrase").length >= 1, true);

    detail.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(paragraph.querySelector(".stretchtext-detail"), null);
    const back = paragraph.querySelector(".stretchtext-phrase");
    assert.equal(back.textContent, originalText);
});

test("without a key a click explains instead of calling the API", async () => {
    const { window, listeners } = makePage({ apiKey: "" });
    let calls = 0;
    window.fetch = async () => {
        calls += 1;
        throw new Error("must not be called");
    };
    runScript(window);
    const response = toggle(listeners);
    assert.equal(response.hasKey, false);

    const paragraph = window.document.getElementById("p");
    const first = paragraph.querySelector(".stretchtext-phrase");
    first.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(calls, 0);
    assert.match(first.title, /Connect your Pollen/);
});

test("toggle off leaves the already-decorated text alone", () => {
    const { window, listeners } = makePage();
    runScript(window);
    toggle(listeners);
    const paragraph = window.document.getElementById("p");
    const before = paragraph.textContent;
    const response = toggle(listeners);
    assert.equal(response.active, false);
    assert.equal(paragraph.textContent, before);
});

test("short paragraphs stay untouched", () => {
    const dom = new JSDOM(
        `<!doctype html><html><body><p id="p">Too short.</p></body></html>`,
        { pretendToBeVisual: true, url: "https://example.com" },
    );
    const { window } = dom;
    const listeners = [];
    window.chrome = { runtime: { onMessage: { addListener: (fn) => listeners.push(fn) }, sendMessage: async () => ({}) } };
    window.sessionStorage.getItem = () => "sk_test_key";
    window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 640, height: 20 });
    runScript(window);
    toggle(listeners);
    const paragraph = window.document.getElementById("p");
    assert.equal(paragraph.querySelectorAll(".stretchtext-phrase").length, 0);
    assert.equal(paragraph.textContent, "Too short.");
});
