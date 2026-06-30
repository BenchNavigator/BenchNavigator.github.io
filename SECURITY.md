# Security Policy

BenchNavigator is a **static, client-side site** hosted on GitHub Pages. It has no
backend, no database, and no user accounts. It serves only public benchmark metadata
derived from Hugging Face and arXiv. It uses **Google Analytics 4** (anonymized:
`anonymize_ip`, Google Signals and ad-personalization disabled) to count visits — GA4
sets cookies and sends visit data to Google; no other personal data is collected.

## Reporting a vulnerability

If you discover a security or data-integrity issue, please report it **privately**:

- Preferred: open a private advisory via
  **[GitHub Security Advisories](https://github.com/BenchNavigator/BenchNavigator.github.io/security/advisories/new)**.
- Please do **not** open a public issue for an unfixed vulnerability.

Include the affected page/URL, a description, and reproduction steps. We aim to
acknowledge reports within a few days.

## Hardening in place

- **Content-Security-Policy** on every page — no inline scripts, no `eval`. Scripts load
  only from the site's own origin plus Google's analytics host
  (`www.googletagmanager.com`); data loads only from the site's origin and Google
  Analytics endpoints.
- **Subresource Integrity (SRI)** on the one third-party asset (Font Awesome from
  cdnjs) so a tampered CDN file is rejected by the browser.
- **`Referrer-Policy: no-referrer`** to avoid leaking the URL to third parties.
- **No secrets** — there are no API keys, tokens, or credentials in this repository,
  and GitHub secret scanning + push protection are enabled.
- **Least data** — only the static files the app needs at runtime are committed; source
  corpora and build tooling are kept out of the repo.

## Known limitation

GitHub Pages serves static files and does **not** allow setting HTTP response headers,
so header-only protections such as `X-Frame-Options` / CSP `frame-ancestors` (clickjacking)
and `Strict-Transport-Security` cannot be enforced from this repository. HTTPS is enforced
by GitHub Pages itself. If stronger header control is required, front the site with a
custom domain behind a CDN/proxy (e.g. Cloudflare) that can inject those headers.
