// Google Analytics 4 (GA4) — anonymized configuration.
// The gtag.js library is loaded from googletagmanager.com (see the <script> tag
// in the page <head>). This file holds the init code in an external file so the
// site's Content-Security-Policy can stay strict (script-src 'self' + the GA host,
// with no 'unsafe-inline').
window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
gtag('js', new Date());
gtag('config', 'G-LVH0F1VBDE', {
  anonymize_ip: true,                    // truncate visitor IPs
  allow_google_signals: false,           // no cross-device / demographics tracking
  allow_ad_personalization_signals: false // no advertising personalization
});
