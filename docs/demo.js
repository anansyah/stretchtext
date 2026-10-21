// Live demo of the stretchtext loop, calling the Pollinations text API in the
// browser with the reader's own key. This is the same logic the extension
// ships in content.js + lib/api.js, in one file the reviewer can read.

const API = "https://gen.pollinations.ai";
const CHAT_COMPLETIONS = `${API}/v1/chat/completions`;
const DEFAULT_MODEL = "openai/gpt-5.4-nano";

let active = false;
let apiKey = "";
const cache = new Map();

const statusEl = document.getElementById("status");
const keyInput = document.getElementById("key");
const goBtn = document.getElementById("go");
const stopBtn = document.getElementById("stop");

function say(html) {
    statusEl.innerHTML = html;
}

function sentences(text) {
    return text
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

function phrases(sentence) {
    const tokens = sentence.split(/(\s+)/).filter(Boolean);
    const groups = [];
    let current = [];
    let words = 0;
    for (const token of tokens) {
        if (/^\s+$/.test(token)) {
            current.push(token);
            continue;
        }
        current.push(token);
        words += 1;
        if (words >= 3) {
            groups.push(current.join(""));
            current = [];
            words = 0;
        }
    }
    if (current.length) groups.push(current.join(""));
    return groups.filter((group) => group.trim());
}

function decorate(paragraph) {
    const fragment = document.createDocumentFragment();
    for (const sentence of sentences(paragraph.textContent)) {
        for (const phrase of phrases(sentence)) {
            const span = document.createElement("span");
            span.className = "stretchtext-phrase";
            span.textContent = phrase;
            fragment.append(span, document.createTextNode(" "));
        }
    }
    paragraph.textContent = "";
    paragraph.append(fragment);
}

// One Pollinations chat completion per stretch, paid with the reader's key.
async function requestStretch(phrase, context) {
    const response = await fetch(CHAT_COMPLETIONS, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: DEFAULT_MODEL,
            max_tokens: 400,
            messages: [
                {
                    role: "system",
                    content:
                        "You expand a passage the way Ted Nelson's stretchtext does: the reader clicks a phrase and more detail appears exactly there, in place, without repeating what is already written. Return only the expanded passage, one paragraph, no headings, no preamble, no quotes. Keep the original language, names, numbers and claims exactly as given. Add 1 to 3 sentences of new detail.",
                },
                {
                    role: "user",
                    content: `Phrase to expand: "${phrase}"\n\nSurrounding text:\n${context}`,
                },
            ],
        }),
    });
    if (!response.ok) {
        throw new Error(`gen.pollinations.ai returned ${response.status}`);
    }
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("Pollinations returned no text");
    return text;
}

async function stretch(phrase, context) {
    const cacheKey = `${phrase}\u0000${context.slice(0, 200)}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const text = await requestStretch(phrase, context);
    cache.set(cacheKey, text);
    return text;
}

document.addEventListener("click", async (event) => {
    if (!active) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.classList.contains("stretchtext-phrase")) {
        if (!apiKey) {
            say("Paste a key above first.");
            return;
        }
        const paragraph = target.closest("p");
        const context = paragraph?.textContent ?? "";
        const original = target.textContent;
        target.classList.add("stretchtext-loading");
        try {
            const text = await stretch(original, context);
            const detail = document.createElement("span");
            detail.className = "stretchtext-detail";
            detail.dataset.original = original;
            detail.textContent = text;
            target.replaceWith(detail);
            say("Grown in place. Click the highlighted passage to fold it back.");
        } catch (error) {
            target.classList.remove("stretchtext-loading");
            say(`Could not stretch: ${error.message}`);
        }
        return;
    }

    if (target.classList.contains("stretchtext-detail")) {
        const span = document.createElement("span");
        span.className = "stretchtext-phrase";
        span.textContent = target.dataset.original ?? target.textContent;
        target.replaceWith(span);
    }
});

goBtn.addEventListener("click", () => {
    apiKey = keyInput.value.trim();
    if (!apiKey) {
        say("Paste your Pollinations key (sk_…) to try this live.");
        return;
    }
    active = true;
    for (const paragraph of document.querySelectorAll("#demo p")) decorate(paragraph);
    goBtn.hidden = true;
    stopBtn.hidden = false;
    say(`Click any phrase. Each click is one POST to <code>${CHAT_COMPLETIONS}</code>.`);
});

stopBtn.addEventListener("click", () => {
    active = false;
    stopBtn.hidden = true;
    goBtn.hidden = false;
    say("Stopped. Reload to restore the original text.");
});
