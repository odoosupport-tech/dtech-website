// Tailwind build for the static site. Same config every page used to pass to
// the Play CDN (cdn.tailwindcss.com); the output replaces that runtime compiler.
//
// Rebuild after changing classes in any page or script:
//   npx tailwindcss@3.4.17 -c tools/tailwind/tailwind.config.js \
//     -i tools/tailwind/input.css -o assets/tailwind.css --minify
module.exports = {
  content: ['./*.html', './assets/**/*.js'],
  // Words in inline scripts that are not classes (input.blur() on case-studies).
  blocklist: ['blur'],
  ...{
      theme: {
        extend: {
          colors: {
            brand: {
              blue: '#27b6da',
              darkBlue: '#008ccf',
              navBlue: '#0b2f52',
              pillBlue: '#1aadcc',
              sky: '#27b6da',
              dark: '#071d34',
              slate: '#142b41',
            }
          },
          fontFamily: {
            display: ['"Archivo"', '"Plus Jakarta Sans"', 'sans-serif'],
            sans: ['Inter', 'sans-serif'],
            mono: ['"JetBrains Mono"', 'monospace'],
          }
        }
      }
    }
};
