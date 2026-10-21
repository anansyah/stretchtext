/**
 * Pollinations client for the extension. The reader's own key is passed in on
 * every call, so no key ever lives in the extension bundle.
 */

const API = "https://gen.pollinations.ai";
export const DEFAULT_MODEL = "openai/gpt-5.4-nano";

/**
 * @param {{apiKey: string, messages: Array<{role: string, content: string}>, model?: string}} options
 * @returns {Promise<string>} the assistant message text
 */
export async function chat({ apiKey, messages, model = DEFAULT_MODEL }) {
    if (!apiKey) throw new Error("Connect your Pollen first.");
    const response = await fetch(`${API}/v1/chat/completions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model,
            max_tokens: 600,
            messages,
        }),
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

/**
 * Device flow, step 1: ask for a code the reader approves in a browser tab.
 * @param {string} clientId the extension's pk_ app key
 */
export async function requestDeviceCode(clientId) {
    const response = await fetch("https://enter.pollinations.ai/api/device/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId }),
    });
    if (!response.ok) throw new Error("Could not start the sign-in. Try again.");
    return response.json();
}

/**
 * Device flow, step 3: poll until the reader approves. Resolves with the key.
 */
export async function pollDeviceToken({ deviceCode, clientId, interval = 5000, signal }) {
    const deadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < deadline) {
        if (signal?.aborted) throw new Error("Sign-in cancelled.");
        const response = await fetch("https://enter.pollinations.ai/api/device/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                device_code: deviceCode,
                grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                client_id: clientId,
            }),
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
