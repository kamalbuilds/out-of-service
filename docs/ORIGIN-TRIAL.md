# Chrome Origin Trial: WebMCP

Status: LIVE since 2026-09-04. Token registered and shipped (see the Token section). The notes below record how the registration page reads and were confirmed by reading the live
registration page in the `deepsurge` browser profile; nothing here is guessed.

## Trial details (read from the registration page)

- Trial name: **WebMCP Trial**
- Registration URL: https://developer.chrome.com/origintrials/#/register_trial/4163014905550602241
- Description (as shown on the page): "Origin trial for WebMCP, which allows websites to
  register tools for use by agents hosted by the site or in Chrome." More info:
  https://developer.chrome.com/docs/ai/webmcp
- Chrome version range: **Chrome 149 to 156**
- Trial end date: **Nov 17, 2026**
- Target origin for this registration: `https://out-of-service-sepia.vercel.app`

## Blocker

The registration form itself renders without signing in (origin field, third-party-matching
checkbox, subdomain checkbox, usage-tier radios, disclosure checkboxes, Register button), but
the page enforces "You must be signed in to register." before it will accept a submission and
issue a token.

`deepsurge` does have an active Google session: clicking the origin-trials sign-in button opens
the standard Google OAuth popup and its account chooser lists exactly one account, `Kamal Singh
<geniusamansingh@gmail.com>`, i.e. this is not a "signed out of Google" situation.

What did not work, tried only via real UI actions (real trusted mouse clicks dispatched through
CDP `Input.dispatchMouseEvent` on the already-open `deepsurge` tab; no credentials were ever
typed, requested, or seen):

- Clicking the in-page "Sign in" button reliably opens the account-chooser popup only some of
  the time; other attempts leave no popup at all (looks like Chrome's popup-gesture allowance
  being inconsistent across separate CDP-driven clicks, and/or this profile having many other
  tabs and concurrent automated sessions contending for the browser).
- When the account-chooser popup does open, clicking the "Kamal Singh" row (verified via
  `elementFromPoint` to land exactly on the correct `role="link" tabindex="0"` element) does not
  advance the flow to the consent screen. The popup either stays stuck on the chooser or closes
  itself without the Origin Trials page ever flipping to "signed in."

This is consistent with Google's sign-in surfaces resisting script-driven (CDP) interaction
past the account-chooser step, which is also why the task's method explicitly says not to try
to log in by hand. The one thing this run deliberately did not do, per instructions, is attempt
any password entry, additional verification step, or anything beyond clicking a visible
account row that was already listed as a signed-in session.

## What finishing this needs

A human (or an agent explicitly cleared to drive Google's real sign-in UI end to end) needs to,
in the `deepsurge` profile:

1. Open https://developer.chrome.com/origintrials/#/register_trial/4163014905550602241
2. Click "Sign in" (top right) and complete the Google account chooser by hand.
3. In the registration form: set Web origin to `https://out-of-service-sepia.vercel.app`
   (leave "match all subdomains" unchecked), accept the three disclosure checkboxes, pick a
   usage tier, and click Register.
4. Copy the generated token from the confirmation screen and either paste it back here or
   drop it directly into this file under "Token" below.

## Token

Registered 2026-09-04 for https://out-of-service-sepia.vercel.app (feature WebMCP, expiry 2026-11-17). Token, public page config:

```
AsalTzjMuR8bZgu8t8O7vDJ0wA+3db23zadvqnnReCnN9xct7jjbwTw5EYk35pi7twl1chLJuEnPdAB6SCcsJQ0AAABfeyJvcmlnaW4iOiJodHRwczovL291dC1vZi1zZXJ2aWNlLXNlcGlhLnZlcmNlbC5hcHA6NDQzIiwiZmVhdHVyZSI6IldlYk1DUCIsImV4cGlyeSI6MTc5NDg3MzYwMH0=
```

Wired as `<meta http-equiv="origin-trial">` in src/app/layout.tsx and as an `Origin-Trial` response header in next.config.ts.

## Integration snippet (to be added by the UI agent once the token above is filled in)

Meta tag, in the app's root layout `<head>`:

```html
<meta http-equiv="origin-trial" content="PASTE_TOKEN_HERE">
```

Alternative: `Origin-Trial` response header via `next.config` headers:

```js
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Origin-Trial", value: "PASTE_TOKEN_HERE" },
        ],
      },
    ];
  },
};
```

Do not edit `src/app/layout.tsx` from this doc — the UI agent owns that file and will wire the
meta tag in once a real token is available.
