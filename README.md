# Chinjufu Pick — Vercel redirect

The `vercel-redirect` branch redirects the old Vercel site to
[chinjufu-pick.pages.dev](https://chinjufu-pick.pages.dev/). The application and
Cloudflare Pages deployment continue to use `main`. Keep this branch separate
from `main`.

## Activate on Vercel

1. Set the existing Vercel project's Production Branch to `vercel-redirect`.
2. Deploy the latest commit on that branch to Production. Changing the branch
   setting alone does not replace the current production deployment.
3. Check the old homepage, `/favorite-shipgirls?lang=zh`, and
   `/favorite-destroyers?lang=zh`. Each should return a 308 redirect to the same
   path on `https://chinjufu-pick.pages.dev`.
4. Open an existing `#p=...` share link and check that it restores the board on
   the new site.

`vercel.json` overrides the framework and build settings, skips dependency
installation, and uses a no-op build command. Only `vercel-redirect-public/` is
published. `.vercelignore` excludes the application source, dependencies, and
image catalog from CLI uploads.

The catch-all permanent redirect preserves every path, including old image
and JSON URLs. Vercel forwards query parameters; browsers inherit the original
fragment when the redirect destination has none, preserving `#p=...` share
links. No serverless function or client-side script performs the redirect.
The initial request to the old Vercel address still counts toward its CDN
usage; subsequent page and asset requests go to Cloudflare Pages.

Local browser saves are scoped to the old origin and do not move automatically.
Existing share links carry the board data and can restore it on the new origin.

Cloudflare Pages should keep `main` as its production branch, with
`npm run build` and `dist` as its build settings.

References:

- [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json)
- [Vercel query parameter forwarding](https://vercel.com/kb/guide/how-do-i-perform-vercel-redirects-based-on-query-strings)
- [HTTP redirect fragment inheritance](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.2)
