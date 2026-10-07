# D-TECH Google search appearance

Prepared on 7 October 2026. These changes are local until deployed.

## Preferred homepage result

Site name: D-TECH Solution Integrators

Title: D-TECH Solution Integrators | Industrial IT & Automation

Description: D-TECH delivers industrial IT, automation, AI safety and security solutions from Bharuch, Gujarat. ISO 9001:2015 certified, serving businesses since 1999.

Google chooses the displayed title, description, site name, sitelinks and AI Overview. This is the preferred copy supplied by the site, not a guaranteed rendering or ranking.

## Changes

- Updated homepage and About page titles and descriptions, including social sharing metadata.
- Added homepage WebSite structured data with D-TECH, Dtech and D-TECH SIPL as alternative names.
- Linked the homepage and About page business markup to a shared organization identifier and homepage URL, with the full legal name.
- Clarified the visible introduction: trading began in 1999; the company incorporated in 2003. The structured foundingDate remains 2003.
- Updated the sitemap modification dates for the two changed pages.
- Refreshed CSP hashes to match current inline scripts before deployment.

## After deployment

1. Check https://www.dtechindia.com/ and https://www.dtechindia.com/about for the new title, description and JSON-LD in the delivered HTML.
2. Check that https://dtechindia.com/ resolves to the preferred www domain, and that /about-us permanently redirects to /about. The legacy About redirect is already configured in vercel.json; confirm production behavior.
3. In the verified Google Search Console property, inspect the homepage and /about. Run Test live URL, then Request indexing for each.
4. Submit or confirm https://www.dtechindia.com/sitemap.xml and https://www.dtechindia.com/sitemap-details.xml in Search Console.
5. Keep the Google Business Profile business name, website, address, phone numbers, logo and services accurate and consistent with the website.
6. Monitor indexing and branded queries such as dtech and dtechindia. Google may take days to weeks to recrawl and reprocess changes. AI Overview text may update separately and cannot be directly edited here.

## References

- Site names: https://developers.google.com/search/docs/appearance/site-names
- Titles: https://developers.google.com/search/docs/appearance/title-link
- Descriptions: https://developers.google.com/search/docs/appearance/snippet
