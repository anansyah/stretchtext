(() => {
  // lib/stretch.js
  var BOUNDARY = /(?<=[.!?])\s+|\n{2,}/;
  function sentences(text) {
    return String(text ?? "").split(BOUNDARY).map((part) => part.trim()).filter(Boolean);
  }
  function words(sentence) {
    return String(sentence ?? "").split(/(\s+)/).filter((part) => part !== "");
  }
  function phrases(sentence, min = 2, max = 4) {
    const tokens = words(sentence);
    const groups = [];
    let current = [];
    let count = 0;
    const target = min + Math.floor((max - min) / 2);
    for (const token of tokens) {
      if (/^\s+$/.test(token)) {
        current.push(token);
        continue;
      }
      current.push(token);
      count += 1;
      if (count >= target) {
        groups.push(current.join(""));
        current = [];
        count = 0;
      }
    }
    if (current.length) groups.push(current.join(""));
    return groups.filter((group) => group.trim());
  }
  function stretchKey({ text, context, depth, model }) {
    const payload = [text, context, depth, model].join("\0");
    let hash = 2166136261;
    for (let i = 0; i < payload.length; i += 1) {
      hash ^= payload.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `st:${(hash >>> 0).toString(36)}:${payload.length}`;
  }
  function stretchPrompt({ phrase, context, depth = 1 }) {
    const more = depth > 1 ? `This is already an expanded detail; expand once more.` : "";
    return [
      {
        role: "system",
        content: "You expand a passage of text the way Ted Nelson's stretchtext does: the reader clicks a phrase and more detail appears exactly there, in place, without repeating what is already written. Return only the expanded passage, on a single paragraph, no headings, no preamble, no quotes. Keep the original language, names, numbers and any claims exactly as given. Add 1 to 3 sentences of genuinely new detail. Never add a disclaimer about being an AI."
      },
      {
        role: "user",
        content: `${more}
Phrase the reader wants expanded: "${phrase}"

Surrounding text:
${context}`.trim()
      }
    ];
  }
  function isUsableExpansion(original, expanded) {
    const next = String(expanded ?? "").trim();
    if (!next) return false;
    if (next.length < 12) return false;
    if (next.length > Math.max(1200, original.length * 12)) return false;
    return next.toLowerCase() !== String(original ?? "").trim().toLowerCase();
  }

  // lib/api.js
  var API = "https://gen.pollinations.ai";
  var DEFAULT_MODEL = "openai/gpt-5.4-nano";
  async function chat({ apiKey, messages, model = DEFAULT_MODEL }) {
    if (!apiKey) throw new Error("Connect your Pollen first.");
    const response = await fetch(`${API}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        max_tokens: 600,
        messages
      })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      if (response.status === 402) {
        throw new Error("Not enough Pollen for this stretch. Top up or pick a cheaper model.");
      }
      if (response.status === 401) {
        throw new Error("That key was rejected. Reconnect your Pollen.");
      }
      throw new Error(`Pollinations returned ${response.status}. ${detail.slice(0, 120)}`.trim());
    }
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error("Pollinations returned no text.");
    return String(text).trim();
  }

  // lib/expander.js
  var TTL = 1e3 * 60 * 60 * 6;
  function createExpander({ apiKey, model, now = () => Date.now() }) {
    const cache = /* @__PURE__ */ new Map();
    return {
      /** @returns {Promise<string>} expanded passage */
      async stretch({ phrase, context, depth = 1 }) {
        const chosen = model || DEFAULT_MODEL;
        const key = stretchKey({ text: phrase, context, depth, model: chosen });
        const hit = cache.get(key);
        if (hit && hit.expires > now()) return hit.text;
        const text = await chat({
          apiKey,
          model: chosen,
          messages: stretchPrompt({ phrase, context, depth })
        });
        if (!isUsableExpansion(phrase, text)) {
          throw new Error("The model returned nothing usable. Try another phrase.");
        }
        cache.set(key, { text, expires: now() + TTL });
        return text;
      },
      /** Exposed for the options page and tests. */
      size() {
        return cache.size;
      }
    };
  }

  // lib/storage.js
  var KEY = "stretchtext.apiKey";
  var MODEL = "stretchtext.model";
  function getKey() {
    try {
      return sessionStorage.getItem(KEY) || "";
    } catch {
      return "";
    }
  }
  function getModel() {
    try {
      return localStorage.getItem(MODEL) || "";
    } catch {
      return "";
    }
  }

  // content.js
  var MARK = "data-stretchtext";
  var MIN_PARAGRAPH = 120;
  var active = false;
  var expander = null;
  var busy = false;
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
      depth: Number(phraseSpan.dataset.depth || 1)
    };
    phraseSpan.classList.add("stretchtext-loading");
    try {
      const text = await expander.stretch({
        phrase,
        context: contextAround(phraseSpan),
        depth
      });
      const detail = span(text, "detail", {
        depth: String(depth),
        original: phrase
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
      depth: detailSpan.dataset.depth ?? "1"
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
})();
