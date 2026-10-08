# Chinjufu Pick

Pick your favorite shipgirls in Kancolle.

## Deployment

Import this repository into Vercel. The included `vercel.json` configures Vite,
the build command `npm run build`, the output directory `dist`, and rewrites for
both pickup pages. Keep the bundled data and images in `public/` when deploying.

For Cloudflare Pages, use `npm run build` as the build command and `dist` as the
output directory. Vite copies `public/_headers` into `dist/_headers`, where Pages
reads the browser cache rules:

- Content-hashed JS, CSS, fonts, and responsive homepage hero images in `/assets/`
  are cached for one year with `immutable`.
- Artwork, ship portraits, homepage images, icons, and the favicon are cached
  for one day, then revalidated. Their filenames are not necessarily content
  hashes, so replacing a file at the same URL can take up to a day to appear.
- HTML and JSON catalogs are revalidated on each visit, allowing browsers to
  reuse unchanged responses through Pages' ETags.

Pages' default SPA fallback serves both pickup routes without Functions. Keep
the default Pages CDN caching; these rules control browser caching and do not
require additional dashboard Cache Rules. See the Cloudflare
[headers](https://developers.cloudflare.com/pages/configuration/headers/) and
[serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/)
documentation. The Vercel deployment continues to use `vercel.json`.

To build and preview locally:

```sh
npm ci
npm run build
npm run preview
```

## Artwork synchronization

Synchronization runs manually with `npm run sync:artworks`; opening the site and
running the Vercel build do not fetch artwork. No scheduled synchronization is
configured in this repository.

The single entry point is `scripts/sync-artworks.mjs`. The catalog and verified
source corrections both live in `public/data/artworks.json`: records marked
`sourceLocked: true` retain their corrected sources, artwork IDs and asset paths
during later syncs. No separate source override JSON is needed.

```sh
# Refresh gallery data and convert downloaded artwork to WebP (requires Pillow).
npm run sync:artworks -- --python=python3 --refresh

# Discover full illustrations for remaining card fallbacks; optionally supply
# --csv=path to a CSV with reviewed source links. Results stay in a temporary cache.
npm run sync:artworks -- --resolve-cards --python=python3

# After reviewing /tmp/chinjufu-card-resolution/review-*.jpg, apply the results.
npm run sync:artworks -- --resolve-cards --apply

# Rebuild avatar crops after changing artwork, then verify all local data.
npm run sync:avatars
npm run check:data
```

Discovery and application use the same `--cache=path` when a custom cache is
specified. The CSV is optional and is never overwritten. Applying a reviewed
replacement stores its source lock directly on the artwork record.

## Sources & Copyright

- Shipgirls, ship types, and remodel relationships: [kcwiki / kcdata](https://kcwikizh.github.io/kcdata/ship/ship.json).
- Ship class ordering reference: [noro6 / kc-web](https://github.com/noro6/kc-web/blob/975da86160f35f0fdecb924f0d686630911851da/src/classes/constants/ships.ts). After merging the broader categories, the positions of training cruisers and newly added older ships were adjusted.
- Ship class catalog: KC3's `ctype` and kcwiki's ship class catalog; additional Chinese and English ship class names were compiled locally. See `public/data/ship-classes.json`.
- Silhouettes: battleships, heavy cruisers, light cruisers, and destroyers use vector assets from [Pastime Factory](https://blog.pastime.ne.jp/game/kankore/1473), which the author permits to be used freely; the other six categories use schematic ship type SVGs drawn for this site. See the [icon notes](public/icons/ship-types/NOTICE.md) for links to the original author and conversion details.
- Names in three languages and portraits: [KC3 Kai](https://github.com/KC3Kai/KC3Kai), [KC3 translations](https://github.com/KC3Kai/kc3-translations).
- Character artwork catalog: the public galleries in individual shipgirl entries on [Kancolle Wiki](https://zh.kcwiki.cn/wiki/舰娘百科).
- Font: [Outfit](https://github.com/Outfitio/Outfit-Fonts), bundled locally via Fontsource, under the SIL Open Font License.

This is an unofficial, nonprofit fan site. Copyright to Kantai Collection and its character artwork belongs to DMM / C2 / KADOKAWA and the other original rights holders. See the corresponding JSON files for specific versions and original links for the data and translations; game images are not covered by this project's source code license.
