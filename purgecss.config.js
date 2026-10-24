// PurgeCSS config: Tailwind-aware extractor keeps responsive/state
// variants (lg:, md:, hover:, ...) that the default extractor drops.
module.exports = {
  content: ['*.html', 'assets/agent-a.js', 'assets/refined.js', 'assets/events.js', 'assets/gallery.js', 'assets/brand-marquee.js', 'assets/lucide.js'],
  css: ['assets/bundle.min.css'],
  output: '/tmp/purged/',
  // brand-marquee-* is JS-generated markup (assets/brand-marquee.js builds
  // it via string concatenation), which has proven unreliable for purgecss's
  // content scanner to detect consistently across runs. Safelist it outright
  // rather than depend on that detection.
  safelist: {
    standard: ['hidden', 'scroll-shield'],
    greedy: [/^brand-marquee/, /^ev-/],
  },
  // Attribute selectors survive only when the bare attribute name is found in
  // the content, and the extractor below reads data-filter="network" as
  // "data-filter=". Keep the case-study tab icon colours
  // (.case-tab[data-filter=network] svg, ...) explicitly.
  dynamicAttributes: ['data-filter'],
  // Standard Tailwind extractor: keeps arbitrary values (text-[10px],
  // w-[calc(...)], ...) that naive word matchers split apart.
  defaultExtractor: (content) => content.match(/[^<>"'`\s]*[^<>"'`\s:]/g) || [],
};
