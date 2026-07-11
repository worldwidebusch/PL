# ProLinker website prototype

This repository contains the interactive ProLinker website prototype. It can be served as a static website and includes the main client and freelancer journeys.

## Start the app

Open `index.html`, or serve the repository with any static web server. The root entry point forwards visitors to the ProLinker homepage.

The interface runtime, React, ReactDOM, Babel, PDF.js and Mammoth are pinned and self-hosted in `project/assets/vendor/`. The main app can therefore start without a third-party CDN. CV parsing only tries the matching pinned CDN files as a fallback when a local vendor file fails to load.

## App data adapter

`project/prolinker-app.js` is the shared data boundary for authenticated app pages. Every account page loads it before `support.js`. Without configuration it uses deterministic, account-scoped mock records in `localStorage`, so refreshes and account actions work in the static prototype.

Set `window.PRO_LINKER_CONFIG` before loading `prolinker-app.js` to connect a backend:

```html
<script>
  window.PRO_LINKER_CONFIG = {
    baseUrl: 'https://api.example.com',
    credentials: 'include',
    timeoutMs: 12000,
    getAccessToken: async () => obtainShortLivedToken(),
    endpoints: {
      dashboard: '/api/v1/dashboard',
      network: '/api/v1/network'
    }
  };
</script>
<script src="./prolinker-app.js"></script>
<script src="./support.js"></script>
```

Do not put a static bearer token or other secret in the repository. `getAccessToken` is an optional runtime callback. The adapter sends JSON, includes credentials by default, unwraps common `{ data: ... }` and `{ result: ... }` responses, enforces a request timeout and returns normalized errors.

Public methods:

- `ProLinkerApp.session.get()`, `.require(options)`, `.isValid(session, role)`, `.logout(options)`
- `ProLinkerApp.routes.accountMenu(role)` for every account dropdown route
- `ProLinkerApp.dashboard.get(options)` and `.refresh(options)`
- `ProLinkerApp.network.list(options)`, `.refresh(options)`, `.accept(id)`, `.reject(id)`, `.remove(id)`, `.invite(input)` and `.whatsappLink(input)`
- `ProLinkerApp.profiles.get(id)` and `.update(input)`
- `ProLinkerApp.assignments.list(options)`, `.get(id)` and `.updateStatus(id, status)`
- `ProLinkerApp.messages.list(options)`, `.get(id)`, `.send(conversationId, text)`, `.markRead(id)`, `.archive(id)` and `.restore(id)`
- `ProLinkerApp.earnings.get(options)`, `ProLinkerApp.settings.get(options)` and `ProLinkerApp.settings.update(input)`

Endpoint overrides are available for `dashboard`, `network`, `networkInvite`, `networkAccept`, `networkReject`, `networkConnection`, `profile`, `assignments`, `assignment`, `messages`, `message`, `messageSend`, `messageRead`, `messageArchive`, `messageRestore`, `earnings` and `settings`. Paths may contain `:id`; the adapter safely encodes path and query values. The normalized model shapes are exposed at `ProLinkerApp.contracts`.

### Marketplace API contract

The shared adapter also exposes `opportunities.list/get/save/unsave/hide`, `applications.create/list`, `freelancers.search`, `projects.create` and `referrals.getSummary`. List and search calls return `{ items, total, nextCursor }`. Opportunity and application records are normalized before they reach the UI. In local mode the opportunity list is an empty normalized collection and a missing opportunity returns `NOT_FOUND`; the rich V2 feed and its existing local application simulation stay unchanged.

Marketplace routes and HTTP methods can be overridden at runtime with flat keys or nested resource keys. The flat keys are `opportunitiesList`, `opportunityGet`, `opportunitySave`, `opportunityUnsave`, `opportunityHide`, `applicationsCreate`, `applicationsList`, `freelancerSearch`, `projectCreate` and `referralSummary`; nested examples are `endpoints.opportunities.list` and `methods.applications.create`. The default routes are under `/api/v1/opportunities`, `/api/v1/applications`, `/api/v1/freelancers`, `/api/v1/projects` and `/api/v1/referrals/summary`. Saving uses PUT, unsaving uses DELETE, and hiding uses PUT with `{ hidden: true }`. Restoring a hidden item uses the same hide route with `{ hidden: false }`.

`applications.create(input, { idempotencyKey })` sends the key as the `Idempotency-Key` header. The adapter coalesces the same account, API route and key in memory for ten minutes; the backend must still scope that key to the authenticated account and enforce uniqueness for an active application per opportunity. Keep access tokens in the runtime `getAccessToken` callback only. Do not store bearer tokens, API keys or database credentials in HTML, JavaScript or `localStorage`.

## Main journeys

### Client journey

1. `project/Prolinker Homepage.dc.html`
2. `project/Prolinker Brief.dc.html`
3. Client login or registration
4. `project/Prolinker Results.dc.html`

The brief is saved before authentication. After a successful client login, the user returns to the matching results automatically. Results, profiles, the account menu and job icons all use the same compact ProLinker design.

### Freelancer journey

1. `project/Prolinker Login.dc.html?mode=register&role=freelancer`
2. `project/Prolinker Profiel.dc.html`
3. `project/Prolinker Voor jou v2.dc.html`

The freelancer opportunity feed contains the canonical current feed design. Desktop uses a ranked results-style list; mobile uses a compact refreshable activity feed that links directly to each assignment. The older `Prolinker Feed.dc.html` and `Prolinker Voor jou.dc.html` files remain as design references.

### Account app

The authenticated WhatsApp account menu links to the functional Dashboard, Network, My assignments, Messages, Profile, Earnings and Settings pages. They share one session guard and data adapter. Static mode stores account-scoped demo records locally; API mode uses the configured backend contracts.

### Referral journey

Authenticated clients and freelancers can open `project/Prolinker Verdiensten.dc.html`, create a personal referral link and share it through WhatsApp. A freelancer who registers through that link is attributed locally to the referring member. The dashboard demonstrates a 2% reward on work processed through ProLinker.

## Demo authentication

Authentication is intentionally a local static demo, not production authentication.

- Login and registration accept a WhatsApp phone number only.
- Use verification code `123456`.
- The demo session, contact details, role, brief, profile, preferences and simulated application history are stored in `localStorage` in the current browser.
- No WhatsApp message is actually sent.
- Jobs, freelancers, relevance scores, matches and application activity are simulated mock data. No application is sent to an employer or external platform.
- Referral attribution, gross platform values, the 2% calculation and the payout ledger are simulated locally. Cross-device tracking, fraud controls and real payouts require a secure backend and must not rely on `localStorage`.
- Do not enter sensitive or confidential information. Demo data can persist after the browser closes. Logging out clears the active session and contact details; account-scoped mock records remain until the site's browser data is cleared.
- Before production, replace this flow with a secure server-side authentication provider and protected application routes.

## Progressive Web App

The website includes a PWA manifest, install icons, an offline page and a service worker in `project/`. Serve the repository through `http://localhost` during development or HTTPS in production; service workers and installation do not work reliably when the HTML file is opened directly with `file://`.

The service worker uses network-first handling for HTML, stale-while-revalidate handling for same-origin static assets and an offline fallback. Non-GET requests, API/auth routes, requests with authentication headers and URLs containing token-like query parameters are deliberately never cached. Keep production API routes under a clear path such as `/api/`; if the backend uses a different route convention, update the sensitive-route matcher in `project/sw.js` before deployment.

The manifest starts the installed app at `project/Prolinker Homepage.dc.html` within its `project/` scope. Browser installation still depends on a supported browser, a valid secure origin and the browser's own install criteria.

## Android and iOS scaffold

The isolated Capacitor setup lives in `mobile/` and packages the current static files from `project/`. Native Android and iOS projects are already generated in `mobile/android/` and `mobile/ios/`. Their icons and light/dark splash screens use the supplied ProLinker mark.

```bash
cd mobile
npm install
npm run assets
npm run sync
```

Windows can prepare and build Android when the Android SDK and matching JDK are installed. Building, signing and submitting the existing iOS project requires macOS and Xcode. See `mobile/README.md` for the complete sync, build and production API notes.

## GitHub Pages

The repository has a root `index.html`, so it can be published directly with GitHub Pages from the repository root. In GitHub, select the main branch and root folder under **Settings > Pages**.

## Suggested first push

```bash
git init -b main
git add .
git commit -m "Prepare ProLinker interactive prototype"
git remote add origin <your-github-repository-url>
git push -u origin main
```

Generated screenshots, print exports, temporary thumbnails and uploaded reference files are ignored by default so they are not accidentally published.
