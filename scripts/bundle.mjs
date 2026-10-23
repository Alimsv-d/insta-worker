#!/usr/bin/env node
// Bundle the multi-file Worker into a single ESM file.
//
// Wrangler bundles `src/worker.js` automatically on deploy; this script exists
// for the two paths that cannot run the Wrangler bundler:
//   * uploading a single file through the Dashboard ("Quick edit");
//   * deploying with the GitHub → Cloudflare integration where the build step
//     is optional.
//
// Output: dist/worker.js (git-ignored). No source maps by default so the
// uploaded file stays small; pass --sourcemap to include them.

import { build } from "esbuild";
import { mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = resolve(root, "dist/worker.js");
const sourcemap = process.argv.includes("--sourcemap");
const minify = process.argv.includes("--minify");

mkdirSync(dirname(outfile), { recursive: true });

const result = await build({
  entryPoints: [resolve(root, "src/worker.js")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  minify,
  sourcemap: sourcemap ? "linked" : false,
  legalComments: "none",
  logLevel: "info",
  metafile: true,
  banner: {
    js: "// insta-worker — bundled. Source: https://github.com/Alimsv-d/insta-worker",
  },
});

if (result.errors.length) process.exit(1);

const bytes = statSync(outfile).size;
const kib = (bytes / 1024).toFixed(1);
console.log(`\n✔ bundled ${outfile} (${kib} KiB${minify ? ", minified" : ""})`);
console.log("  Deploy with: npx wrangler deploy");
console.log("  Or upload dist/worker.js in the Cloudflare Dashboard (Quick edit).");
