import assert from "node:assert/strict";
import test from "node:test";
import {
    isUsableExpansion,
    phrases,
    sentences,
    stretchKey,
    stretchPrompt,
} from "../lib/stretch.js";
import { createExpander } from "../lib/expander.js";

test("sentences splits on terminal punctuation and blank lines", () => {
    assert.deepEqual(sentences("One. Two! Three?\n\nFour"), [
        "One.",
        "Two!",
        "Three?",
        "Four",
    ]);
    assert.deepEqual(sentences(""), []);
    assert.deepEqual(sentences(null), []);
});

test("phrases groups words into clickable chunks without losing text", () => {
    const sentence = "The quick brown fox jumps over the lazy dog.";
    const parts = phrases(sentence);
    assert.ok(parts.length >= 2);
    assert.equal(parts.join("").replace(/\s+/g, " "), sentence.replace(/\s+/g, " "));
});

test("phrases keeps whitespace so the page reflows the same", () => {
    const parts = phrases("Alpha beta gamma delta.");
    for (const part of parts) {
        assert.ok(part.trim().length > 0);
    }
    assert.equal(parts.join("").includes("  "), false);
});

test("stretchKey is stable and differs by depth, context and model", () => {
    const base = { text: "quantum", context: "a page", depth: 1, model: "m" };
    assert.equal(stretchKey(base), stretchKey({ ...base }));
    assert.notEqual(stretchKey(base), stretchKey({ ...base, depth: 2 }));
    assert.notEqual(stretchKey(base), stretchKey({ ...base, context: "other" }));
    assert.notEqual(stretchKey(base), stretchKey({ ...base, model: "n" }));
});

test("stretchPrompt asks for in-place detail in the same language", () => {
    const messages = stretchPrompt({ phrase: "the treaty", context: "In 1967..." });
    assert.equal(messages.length, 2);
    assert.match(messages[0].content, /stretchtext/);
    assert.match(messages[0].content, /original language/);
    assert.match(messages[1].content, /the treaty/);
    const deeper = stretchPrompt({ phrase: "the treaty", context: "x", depth: 2 });
    assert.match(deeper[1].content, /expand once more/);
});

test("isUsableExpansion rejects empty, tiny and echoed answers", () => {
    assert.equal(isUsableExpansion("phrase", ""), false);
    assert.equal(isUsableExpansion("phrase", "   "), false);
    assert.equal(isUsableExpansion("phrase", "too short"), false);
    assert.equal(isUsableExpansion("phrase", "PHRASE"), false);
    assert.equal(
        isUsableExpansion("phrase", "A genuinely new sentence of detail."),
        true,
    );
    assert.equal(isUsableExpansion("phrase", "x".repeat(5000)), false);
});

test("createExpander caches a stretch so a second click is free", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => {
        calls += 1;
        return Response.json({
            choices: [{ message: { content: "New detail that was not there before." } }],
        });
    });
    const expander = createExpander({ apiKey: "sk_test" });
    const args = { phrase: "the treaty", context: "In 1967 Nelson wrote", depth: 1 };
    const first = await expander.stretch(args);
    const second = await expander.stretch(args);
    assert.equal(first, second);
    assert.equal(calls, 1);
    assert.equal(expander.size(), 1);
});

test("createExpander surfaces a 402 as a top-up message", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({ error: { message: "Insufficient" } }, { status: 402 }),
    );
    const expander = createExpander({ apiKey: "sk_test" });
    await assert.rejects(
        () => expander.stretch({ phrase: "x", context: "y" }),
        /Not enough Pollen/,
    );
});

test("createExpander refuses a keyless stretch", async () => {
    const expander = createExpander({ apiKey: "" });
    await assert.rejects(
        () => expander.stretch({ phrase: "x", context: "y" }),
        /Connect your Pollen/,
    );
});
