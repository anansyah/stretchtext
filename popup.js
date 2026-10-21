const toggle = document.getElementById("toggle");
const signin = document.getElementById("signin");
const signout = document.getElementById("signout");
const options = document.getElementById("options");
const device = document.getElementById("device");
const deviceCode = document.getElementById("device-code");
const deviceLink = document.getElementById("device-link");
const signinBlock = document.getElementById("signin-block");
const status = document.getElementById("status");

function say(message) {
    status.textContent = message ?? "";
}

async function hasKey() {
    const { apiKey } = await chrome.storage.session.get("apiKey");
    return Boolean(apiKey);
}

async function refresh() {
    const connected = await hasKey();
    toggle.disabled = false;
    signin.hidden = connected;
    signout.hidden = !connected;
    if (connected) signinBlock.hidden = true;
    const tab = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.[0]?.id) {
        toggle.disabled = true;
        say("Open a normal web page first.");
        return;
    }
    try {
        const state = await chrome.tabs.sendMessage(tab[0].id, { type: "status" });
        toggle.textContent = state.active ? "Stop stretching this page" : "Stretch this page";
    } catch {
        toggle.textContent = "Stretch this page";
    }
    if (!connected) say("Read-only until you connect: the click cost is yours.");
}

toggle.addEventListener("click", async () => {
    say("Working…");
    const result = await chrome.runtime.sendMessage({ type: "toggle" });
    if (result?.error) {
        say(result.error);
        return;
    }
    toggle.textContent = result.active ? "Stop stretching this page" : "Stretch this page";
    say(result.active ? "Click any phrase on the page." : "Stopped. The page is untouched.");
});

signin.addEventListener("click", async () => {
    say("Starting sign-in…");
    const result = await chrome.runtime.sendMessage({ type: "sign-in" });
    if (result?.error) {
        say(result.error);
        return;
    }
    deviceCode.textContent = result.userCode;
    deviceLink.href = result.url;
    device.hidden = false;
    say("Approve in the tab that just opened, then come back.");
    chrome.tabs.create({ url: result.url });
    const timer = setInterval(async () => {
        if (await hasKey()) {
            clearInterval(timer);
            say("Connected.");
            refresh();
        }
    }, 2000);
});

signout.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "sign-out" });
    say("Disconnected. Your key is gone from this browser session.");
    refresh();
});

options.addEventListener("click", () => chrome.runtime.openOptionsPage());

refresh();
