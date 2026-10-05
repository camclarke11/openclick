# Deploying Sounds

Sounds is a static site. Every push to `main` runs `.github/workflows/deploy.yml`, which
builds `dist/` and publishes it to GitHub Pages at **https://sounds.camlc.dev**. You can also
run it by hand from the Actions tab (Deploy → Run workflow).

`public/CNAME` holds the custom domain, so it ships in every build and Pages keeps the domain
across deploys.

## One-time setup (repo owner)

camlc.dev's DNS is on Cloudflare (nameservers `annalise`/`anton.ns.cloudflare.com`).

1. **Enable Pages.** GitHub → camclarke11/openclick → Settings → Pages → Build and deployment →
   Source: **GitHub Actions**.
2. **Add the DNS record.** Cloudflare dashboard → camlc.dev → DNS → Records → Add record:
   - Type `CNAME`, Name `sounds`, Target `camclarke11.github.io`
   - Proxy status **DNS only** (grey cloud), so GitHub can issue the HTTPS certificate.
3. **Set the domain and HTTPS.** Settings → Pages → Custom domain: `sounds.camlc.dev` → Save.
   Once the DNS check passes and the certificate is issued (can take a while), tick
   **Enforce HTTPS**.
4. **Run the first deploy.** Actions → Deploy → Run workflow (or push to `main`).
5. Optional: verify the domain under your GitHub account (Settings → Pages → Verified domains)
   so nobody else can claim `sounds.camlc.dev` on GitHub.

Until step 1 is done, the Deploy workflow fails at "configure-pages"; CI is unaffected.

If you later want Cloudflare's proxy (orange cloud) in front, turn it on only after HTTPS is
enforced, and set the zone's SSL/TLS mode to **Full**.

## Caching

- Vite fingerprints everything in `dist/assets/` (`index-[hash].js`), so those files are
  immutable: a new build produces new names and `index.html` points at them.
- GitHub Pages sets `Cache-Control: max-age=600` on every file and does not allow custom
  headers. That is safe (users get a new build within 10 minutes) but not ideal for samples.
- `public/_headers` already declares the ideal policy (assets immutable for a year, samples
  cached for a week, `index.html` revalidated). It is ignored on GitHub Pages and takes effect
  as-is on Cloudflare Pages or Netlify if we ever move.
- Samples should keep stable URLs only while their content is unchanged; if a sample is
  re-recorded, give it a new file name (or a version folder) so browsers fetch the new one.

## Alternative: Cloudflare Pages

Since the domain is already on Cloudflare, Cloudflare Pages is a drop-in alternative with real
cache headers (`public/_headers`) and free per-PR preview URLs:

1. Cloudflare → Workers & Pages → Create → Pages → Connect to Git → camclarke11/openclick.
2. Build command `npm run build`, output directory `dist`, env var `NODE_VERSION=22`.
3. Custom domains → add `sounds.camlc.dev` (Cloudflare creates the DNS record).
4. Disable `.github/workflows/deploy.yml` and remove the GitHub Pages DNS record.

## PR previews

Not set up on GitHub Pages (it serves one site per repo). Use `npm run build && npm run preview`
locally, or switch to Cloudflare Pages above, which previews every PR automatically.

## Suggested `index.html` head (for the UI shell workstream)

`index.html` is owned by the UI shell workstream. These tags use the files in `public/`:

```html
<meta name="theme-color" content="#15161a" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="canonical" href="https://sounds.camlc.dev/" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://sounds.camlc.dev/" />
<meta property="og:title" content="Sounds" />
<meta property="og:description" content="Design UI, foley and game sounds in your browser. Export WAVs." />
<meta property="og:image" content="https://sounds.camlc.dev/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
```
