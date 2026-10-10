// PurgeCSS config: Tailwind-aware extractor keeps responsive/state
// variants (lg:, md:, hover:, ...) that the default extractor drops.
module.exports = {
  content: ['*.html', 'assets/agent-a.js', 'assets/refined.js', 'assets/events.js', 'assets/analytics.js', 'assets/brand-marquee.js', 'assets/lucide.js'],
  css: ['assets/bundle.min.css'],
  output: '/tmp/purged/',
  // brand-marquee-* is JS-generated markup (assets/brand-marquee.js builds
  // it via string concatenation), which has proven unreliable for purgecss's
  // content scanner to detect consistently across runs. Safelist it outright
  // rather than depend on that detection.
  safelist: {
    standard: ['hidden', 'a-in', 'a-pre', 'is-scrolling'],
    greedy: [/^brand-marquee/, /^ev-/],
  },
  // Standard Tailwind extractor: keeps arbitrary values (text-[10px],
  // w-[calc(...)], ...) that naive word matchers split apart.
  defaultExtractor: (content) => content.match(/[^<>"'`\s]*[^<>"'`\s:]/g) || [],
};
