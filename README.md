# ProLinker website prototype

This repository contains the interactive ProLinker website prototype. It can be served as a static website and includes the main client and freelancer journeys.

## Start the app

Open `index.html`, or serve the repository with any static web server. The root entry point forwards visitors to the ProLinker homepage.

The prototype loads its interface runtime and React dependencies from public CDNs, so an internet connection is required.

## Main journeys

### Client journey

1. `project/Prolinker Homepage.dc.html`
2. `project/Prolinker Brief.dc.html`
3. Client login or registration
4. `project/Prolinker Results.dc.html`

The brief is saved before authentication. After a successful client login, the user returns to the matching results automatically.

### Freelancer journey

1. `project/Prolinker Login.dc.html?mode=register&role=freelancer`
2. `project/Prolinker Profiel.dc.html`
3. `project/Prolinker Voor jou v2.dc.html`

The freelancer opportunity feed contains the canonical current feed design. The older `Prolinker Feed.dc.html` and `Prolinker Voor jou.dc.html` files remain as design references.

## Demo authentication

Authentication is intentionally a local static demo, not production authentication.

- Use verification code `123456`.
- The demo session, contact details, role, brief, profile, preferences and simulated application history are stored in `localStorage` in the current browser.
- No message is actually sent by email or WhatsApp.
- Jobs, freelancers, relevance scores, matches and application activity are simulated mock data. No application is sent to an employer or external platform.
- Do not enter sensitive or confidential information. Demo data can persist after the browser closes and is cleared when the user logs out or clears the site's browser data.
- Before production, replace this flow with a secure server-side authentication provider and protected application routes.

## GitHub Pages

The repository has a root `index.html`, so it can be published directly with GitHub Pages from the repository root. In GitHub, select the main branch and root folder under **Settings → Pages**.

## Suggested first push

```bash
git init -b main
git add .
git commit -m "Prepare ProLinker interactive prototype"
git remote add origin <your-github-repository-url>
git push -u origin main
```

Generated screenshots, print exports, temporary thumbnails and uploaded reference files are ignored by default so they are not accidentally published.
