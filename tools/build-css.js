// Builds the site's stylesheets (npm run build:css):
//   1. assets/tailwind.css from tools/tailwind/input.css, scanning the pages
//      and scripts for classes (Tailwind 4 only emits the classes in use).
//   2. assets/<name>.min.css for every stylesheet in STYLESHEETS.
//   3. assets/bundle.min.css, the shared base bundle every page loads.
'use strict';

const fs = require('fs');
const path = require('path');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { transform } = require('lightningcss');
const CleanCSS = require('clean-css');

const ROOT = path.resolve(__dirname, '..');
const asset = (name) => path.join(ROOT, 'assets', name);

const STYLESHEETS = [
  'skin', 'tailwind', 'polish', 'jiva', 'color', 'skin-dark', 'prezi', 'fonts',
  'case-studies', 'refresh', 'home', 'sections', 'light-chrome', 'events', 'gallery',
];
const BUNDLE = ['skin', 'color', 'polish', 'tailwind'];

// Tailwind 4 writes for Safari 16.4+ (range media queries, nesting). Lower the
// output to what the Tailwind 3 build supported, so older phones keep the
// responsive layout.
const TARGETS = {
  safari: 14 << 16,
  ios_saf: 14 << 16,
  chrome: 90 << 16,
  edge: 90 << 16,
  firefox: 90 << 16,
  samsung: 15 << 16,
};

// Tailwind 4 puts its rules in cascade layers, and every unlayered rule beats
// a layered one whatever its specificity. skin.css and polish.css are
// unlayered and load first in the bundle, so with layers kept they would
// start overriding utilities (an `a { color }` beating `text-white`).
// Unwrapping keeps Tailwind 3's cascade: specificity, then source order.
const unwrapLayers = {
  postcssPlugin: 'unwrap-layers',
  OnceExit(root) {
    const layers = [];
    root.walkAtRules('layer', (rule) => { layers.push(rule); });
    for (const rule of layers) {
      if (rule.nodes && rule.nodes.length) rule.replaceWith(rule.nodes);
      else rule.remove();
    }
  },
};

// Tailwind 4 writes space-y-4 / divide-y as `:where(.space-y-4 > :not(:last-child))`:
// no specificity, gap after every child but the last. Tailwind 3 wrote
// `.space-y-4 > :not([hidden]) ~ :not([hidden])`: class specificity, gap before
// every visible child but the first. skin.css margins were tuned against the
// Tailwind 3 form (it outranks rules like `.hero-actions { margin-top }`), so
// restore its selector and move each gap back to the leading edge.
const SIBLING_UTILITY = /^:where\((\.(?:[\w-]+\\:)*(?:space|divide)-[^\s>]+) > :not\(:last-child\)\)$/;
const LEADING_TRAILING = [
  ['margin-block-start', 'margin-block-end'],
  ['margin-inline-start', 'margin-inline-end'],
  ['border-top-width', 'border-bottom-width'],
  ['border-inline-start-width', 'border-inline-end-width'],
];
const tailwind3Siblings = {
  postcssPlugin: 'tailwind3-siblings',
  Rule(rule) {
    const match = SIBLING_UTILITY.exec(rule.selector);
    if (!match) return;
    rule.selector = `${match[1]} > :not([hidden]) ~ :not([hidden])`;
    for (const [leading, trailing] of LEADING_TRAILING) {
      const a = rule.nodes.find((n) => n.type === 'decl' && n.prop === leading);
      const b = rule.nodes.find((n) => n.type === 'decl' && n.prop === trailing);
      if (a && b) [a.value, b.value] = [b.value, a.value];
    }
  },
};

async function buildTailwind() {
  const from = path.join(ROOT, 'tools/tailwind/input.css');
  const result = await postcss([tailwind({ base: ROOT, optimize: false }), tailwind3Siblings, unwrapLayers])
    .process(fs.readFileSync(from, 'utf8'), { from });
  const { code, warnings } = transform({
    filename: 'tailwind.css',
    code: Buffer.from(result.css),
    minify: true,
    targets: TARGETS,
  });
  for (const w of warnings) console.warn(`tailwind.css: ${w.message}`);
  fs.writeFileSync(asset('tailwind.css'), code);
}

// Same options the clean-css CLI used (level 1, local @import inlining, no
// URL rebasing), so the .min.css output is unchanged.
function minify(name) {
  const source = asset(`${name}.css`);
  const out = new CleanCSS({ level: { 1: true }, inline: 'local', rebase: false }).minify([source]);
  if (out.errors.length) throw new Error(`${name}.css: ${out.errors.join('; ')}`);
  for (const w of out.warnings) console.warn(`${name}.css: ${w}`);
  fs.writeFileSync(asset(`${name}.min.css`), out.styles);
}

async function main() {
  await buildTailwind();
  for (const name of STYLESHEETS) minify(name);
  const bundle = BUNDLE.map((name) => `${fs.readFileSync(asset(`${name}.min.css`), 'utf8')}\n`).join('');
  fs.writeFileSync(asset('bundle.min.css'), bundle);
  console.log(`CSS built: ${STYLESHEETS.length} stylesheets, bundle.min.css ${bundle.length} bytes`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
