/**
 * Stretchtext segmentation: turn a sentence the reader grew into clickable
 * spans, so any word or clause can grow again or shrink back.
 *
 * Pure functions only. No DOM, so the segmentation and the caching logic can
 * be unit tested in Node.
 */

const BOUNDARY = /(?<=[.!?])\s+|\n{2,}/;

/** Split a grown passage into sentence-ish pieces. */
export function sentences(text) {
    return String(text ?? "")
        .split(BOUNDARY)
        .map((part) => part.trim())
        .filter(Boolean);
}

/** Split a sentence into word and punctuation spans, keeping whitespace. */
export function words(sentence) {
    return String(sentence ?? "")
        .split(/(\s+)/)
        .filter((part) => part !== "");
}

/**
 * Group words into short clickable phrases (2-4 words), which read better than
 * one span per word and cost fewer separate requests.
 */
export function phrases(sentence, min = 2, max = 4) {
    const tokens = words(sentence);
    const groups = [];
    let current = [];
    let count = 0;
    const target = min + Math.floor((max - min) / 2);
    for (const token of tokens) {
        if (/^\s+$/.test(token)) {
            // Keep the space inside whichever group is open, so joining the
            // groups reproduces the sentence.
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

/**
 * A stable cache key for one stretch request. The same passage, the same
 * surrounding context and the same depth must hit the same entry.
 */
export function stretchKey({ text, context, depth, model }) {
    const payload = [text, context, depth, model].join("\u0000");
    let hash = 2166136261;
    for (let i = 0; i < payload.length; i += 1) {
        hash ^= payload.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return `st:${(hash >>> 0).toString(36)}:${payload.length}`;
}

/**
 * The prompt that grows a phrase. Kept in one place so the wording can be
 * tested, and so the "stay in the same language" rule can't drift.
 */
export function stretchPrompt({ phrase, context, depth = 1 }) {
    const more = depth > 1 ? `This is already an expanded detail; expand once more.` : "";
    return [
        {
            role: "system",
            content:
                "You expand a passage of text the way Ted Nelson's stretchtext does: " +
                "the reader clicks a phrase and more detail appears exactly there, in place, " +
                "without repeating what is already written. Return only the expanded passage, " +
                "on a single paragraph, no headings, no preamble, no quotes. " +
                "Keep the original language, names, numbers and any claims exactly as given. " +
                "Add 1 to 3 sentences of genuinely new detail. Never add a disclaimer about being an AI.",
        },
        {
            role: "user",
            content: `${more}\nPhrase the reader wants expanded: "${phrase}"\n\nSurrounding text:\n${context}`.trim(),
        },
    ];
}

/**
 * Reject expansions that are empty, echo the input, or balloon.
 */
export function isUsableExpansion(original, expanded) {
    const next = String(expanded ?? "").trim();
    if (!next) return false;
    if (next.length < 12) return false;
    if (next.length > Math.max(1200, original.length * 12)) return false;
    return next.toLowerCase() !== String(original ?? "").trim().toLowerCase();
}
