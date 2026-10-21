/**
 * Expand a phrase through Pollinations and remember the answer, so clicking
 * the same phrase twice costs nothing and shrinking back is instant.
 */

import { chat, DEFAULT_MODEL } from "./api.js";
import { isUsableExpansion, stretchKey, stretchPrompt } from "./stretch.js";

const TTL = 1000 * 60 * 60 * 6;

export function createExpander({ apiKey, model, now = () => Date.now() }) {
    const cache = new Map();

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
                messages: stretchPrompt({ phrase, context, depth }),
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
        },
    };
}
