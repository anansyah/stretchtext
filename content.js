/**
 * Content script: turn paragraphs into stretchtext.
 *
 * The reader picks "Stretchable" from the toolbar; from then on clicking any
 * phrase in a paragraph grows it in place, and clicking the grown passage
 * shrinks it back. Only the clicked paragraph is touched — the rest of the page
 * keeps working exactly as before.
 */

import { phrases, sentences } from "./lib/stretch.js";
import { createExpander } from "./lib/expander.js";
import { getKey, getModel } from "./lib/storage.js";

const MARK = "data-stretchtext";
const MIN_PARAGRAPH = 120;

let active = false;
let expander = null;
let busy = false;

function settingsKey() {
    return { apiKey: getKey(), model: getModel() };
}

function refreshExpander() {
    const { apiKey, model } = settingsKey();
    expander = apiKey ? createExpander({ apiKey, model }) : null;
    return Boolean(expander);
}

function isVisible(element) {
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 200 && rect.height > 0;
}

function targetParagraphs() {
    const found = [];
    for (const element of document.querySelectorAll("p, li, article, blockquote")) {
        if (element.hasAttribute(MARK)) continue;
        if (element.querySelector("p, li, article, blockquote")) continue;
        const text = element.innerText?.trim() ?? "";
        if (text.length < MIN_PARAGRAPH) continue;
        if (element.querySelector("a, button, input, textarea, select, code, pre")) continue;
        if (!isVisible(element)) continue;
        found.push(element);
    }
    return found.slice(0, 40);
}

function span(text, kind, extra = {}) {
    const element = document.createElement("span");
    element.className = `stretchtext-${kind}`;
    element.textContent = text;
    Object.assign(element.dataset, extra);
    return element;
}

function decorate(paragraph) {
    const text = paragraph.textContent ?? "";
    if (text.length < MIN_PARAGRAPH) return;

    const fragment = document.createDocumentFragment();
    for (const sentence of sentences(text)) {
        for (const phrase of phrases(sentence)) {
            const piece = span(phrase, "phrase", { depth: "1" });
            piece.title = "Click to stretch";
            fragment.appendChild(piece);
            fragment.appendChild(document.createTextNode(" "));
        }
    }
    paragraph.textContent = "";
    paragraph.appendChild(fragment);
    paragraph.setAttribute(MARK, "on");
}

function contextAround(node) {
    const paragraph = node.closest(`[${MARK}]`);
    return (paragraph?.innerText ?? "").slice(0, 1500);
}

async function grow(phraseSpan) {
    if (busy) return;
    busy = true;
    const { phrase, depth } = {
        phrase: phraseSpan.dataset.original ?? phraseSpan.textContent,
        depth: Number(phraseSpan.dataset.depth || 1),
    };
    phraseSpan.classList.add("stretchtext-loading");
    try {
        const text = await expander.stretch({
            phrase,
            context: contextAround(phraseSpan),
            depth,
        });
        const detail = span(text, "detail", {
            depth: String(depth),
            original: phrase,
        });
        phraseSpan.dataset.original = phrase;
        phraseSpan.replaceWith(detail);
    } catch (error) {
        phraseSpan.classList.remove("stretchtext-loading");
        phraseSpan.classList.add("stretchtext-error");
        phraseSpan.title = error.message;
        setTimeout(() => phraseSpan.classList.remove("stretchtext-error"), 2500);
    } finally {
        busy = false;
    }
}

function shrink(detailSpan) {
    const back = span(detailSpan.dataset.original ?? detailSpan.textContent, "phrase", {
        depth: detailSpan.dataset.depth ?? "1",
    });
    back.title = "Click to stretch";
    detailSpan.replaceWith(back);
}

function onClick(event) {
    if (!active) return;
    const el = event.target;
    if (!(el instanceof HTMLElement)) return;

    if (el.classList.contains("stretchtext-phrase")) {
        event.preventDefault();
        event.stopPropagation();
        if (!refreshExpander()) {
            el.title = "Connect your Pollen from the StretchText toolbar first.";
            return;
        }
        grow(el);
    } else if (el.classList.contains("stretchtext-detail")) {
        event.preventDefault();
        event.stopPropagation();
        shrink(el);
    }
}

function activate() {
    active = true;
    refreshExpander();
    for (const paragraph of targetParagraphs()) decorate(paragraph);
    document.documentElement.setAttribute("data-stretchtext-active", "on");
}

function deactivate() {
    active = false;
    document.documentElement.removeAttribute("data-stretchtext-active");
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "toggle") {
        if (active) deactivate();
        else activate();
        sendResponse({ active, hasKey: Boolean(getKey()) });
        return true;
    }
    if (message?.type === "status") {
        sendResponse({ active, hasKey: Boolean(getKey()) });
        return true;
    }
    return false;
});

document.addEventListener("click", onClick, true);
