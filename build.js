/**
 * Build the unpacked extension into dist/.
 *
 * Content scripts in MV3 are classic scripts, so they cannot use bare `import`.
 * Bundling every entry point with esbuild keeps the source modular and the
 * shipped files plain.
 */

import { copyFile, mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";

const entries = ["content.js", "background.js", "popup.js", "options.js"];
const assets = ["manifest.json", "popup.html", "options.html", "stretch.css"];

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

await build({
    entryPoints: entries,
    outdir: "dist",
    bundle: true,
    format: "iife",
    target: "chrome110",
    legalComments: "none",
    logLevel: "warning",
});

for (const asset of assets) await copyFile(asset, `dist/${asset}`);

console.log(`built ${entries.length} scripts + ${assets.length} assets into dist/`);
