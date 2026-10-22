<p align="center">
  <a href="https://pollinations.ai/?ref=badge">
    <img src="https://raw.githubusercontent.com/pollinations/pollinations/main/packages/ui/src/brand/badge-made-with.svg" alt="Made with pollinations.ai" />
  </a>
</p>

<h1 align="center">StretchText</h1>

<p align="center">
  Click any phrase on a web page and it grows exactly there. Click the grown passage and it shrinks back.
  <br />
  Readers pay with their own Pollen.
</p>

## What it does

Ted Nelson described stretchtext in 1967: text that expands where the reader wants more and contracts
where they don't. Writing every level by hand was too much work, so it never caught on. Generated text
makes the extra levels cheap.

StretchText brings that to any page:

1. Open a page, click **Stretch this page** in the toolbar.
2. Every substantial paragraph becomes clickable phrases — dotted underline, two to four words each.
3. Click a phrase. It is replaced in place by one to three sentences of new detail, highlighted so you can
   see what appeared.
4. Click the grown passage to fold it back. Nothing else on the page moves.

The rest of the page keeps working: links, buttons and inputs are skipped, and toggling off leaves the text
as it was.

## Paying with your own Pollen

StretchText never ships a key. Press **Connect your Pollen** and it runs the
[device flow](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md): you approve a
code on `enter.pollinations.ai`, and the extension receives a scoped `sk_` key you can revoke at any time.

### Where the Pollinations calls are

| What | File | Call |
|---|---|---|
| Chat completion, one per stretch | `lib/api.js` | `POST https://gen.pollinations.ai/v1/chat/completions` with `Authorization: Bearer <reader key>` |
| Device code, step 1 | `lib/api.js` | `POST https://enter.pollinations.ai/api/device/code` |
| Device token, step 3 | `lib/api.js` | `POST https://enter.pollinations.ai/api/device/token` |
| Key + model storage | `lib/storage.js`, `options.js` | `chrome.storage.session` / `chrome.storage.local` |
| Prompt sent to the model | `lib/stretch.js` (`stretchPrompt`) | system + user messages |
| Cached expansion | `lib/expander.js` | six-hour TTL per phrase |

Grep for it:

```bash
grep -rn "gen.pollinations.ai" lib/ background.js
grep -rn "chat(" lib/expander.js
```

- The key lives in `sessionStorage`/`chrome.storage.session`: it dies with the browser session and is never
  written to disk.
- Each stretch is one `POST /v1/chat/completions` call, billed to you at the model's listed rate.
- Default model is `openai/gpt-5.4-nano`; change it in Settings. Any text model works.
- Answers are cached per phrase for six hours, so clicking the same phrase twice costs once.

## Install

StretchText is not on a browser store yet, so this repository README is its install page: load the
extension unpacked from source. It takes about two minutes and needs Node.js 18 or newer.

### 1. Get the code

```bash
git clone https://github.com/anansyah/stretchtext.git
cd stretchtext
```

Or download the ZIP from the **Code** button on GitHub and unpack it.

### 2. Build it

```bash
npm install
npm run build          # writes dist/
```

`dist/` is the folder the browser loads. If `npm run build` fails, check that `node -v` reports 18 or newer.

### 3. Load it in the browser

Chrome, Edge, Brave, or any Chromium browser:

1. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the `dist/` folder from step 2.

The StretchText icon appears in the toolbar. Pin it if it is hidden behind the puzzle-piece menu.

Firefox: `about:debugging` -> **This Firefox** -> **Load Temporary Add-on** -> pick `dist/manifest.json`.
A temporary add-on is removed when Firefox closes.

### 4. Try it

1. Open any article page with real paragraphs (a news site, a blog post).
2. Click the StretchText icon, then **Stretch this page**.
3. Click a dotted-underline phrase. It grows in place; click the grown text to fold it back.

Nothing is sent anywhere until you press **Connect your Pollen** and approve the device code, and each
stretch is then billed to your own account at the model's listed rate.

### Updating

Pull the latest code, run `npm run build` again, then press the reload arrow on the StretchText card in
`chrome://extensions`.

### Uninstalling

Remove the extension from `chrome://extensions`, and revoke the `sk_` key it created at
[enter.pollinations.ai/keys](https://enter.pollinations.ai/keys).

## Set your app key before shipping a build

`background.js` holds `CLIENT_ID`, the extension's publishable app key. Create one at
[enter.pollinations.ai/keys](https://enter.pollinations.ai/keys) and use this extension's redirect URL.
Without it, device-flow consent still works but traffic is not attributed to your account.

## How it is built

```
content.js     decorates the page and handles grow/shrink clicks
background.js  device-flow sign-in, toolbar relay
popup.html     toggle, Connect, status
options.html   model choice, manual key
lib/stretch.js segmentation, cache keys, prompt, reply checks   (pure)
lib/api.js     Pollinations client + device flow
lib/expander.js cached expansion
stretch.css    the dotted-underline and grown-passage look
```

Content scripts in MV3 cannot use bare imports, so `build.js` bundles each entry point with esbuild into
plain scripts. `dist/` is what the browser loads.

## Tests

```bash
npm test        # 14 tests
```

- `test/stretch.test.js` — segmentation keeps every character and reading order, cache keys differ by depth
  and context, prompt keeps the source language, weak or echoed answers are rejected, a second click is free,
  402 and keyless calls fail loudly.
- `test/dom.test.js` — runs the real built content script in jsdom: activating rewrites the paragraph, a click
  grows it in place, a second click shrinks it, a keyless click never calls the API, short paragraphs stay
  untouched.

## Limits, stated plainly

- Client-side rendered pages give the content script little or no text; the toolbar still toggles, nothing
  useful happens.
- A paragraph longer than the model's context is sent whole, not chunked. Real pages rarely have one.
- Each stretch is independent: growing a phrase inside a grown passage asks a fresh question with the
  surrounding text as context, rather than tracking a full document tree.
- Text is sent to Pollinations to be expanded. Do not stretch pages whose content must not leave the browser.

## License

MIT.

<p align="center">
  <a href="https://pollinations.ai/?ref=badge"><img src="https://raw.githubusercontent.com/pollinations/pollinations/main/packages/ui/src/brand/badge-made-with.svg" alt="Made with pollinations.ai" /></a>
</p>
