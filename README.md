# Faable Invite Pack

Open a pack, tear it, flip three cards. Each card is one feature of
[Faable Deploy](https://faable.com/docs/deploy) or [Faable Auth](https://faable.com/docs/auth),
and the app itself is a demo of both: it's a static Vite SPA deployed on Faable, and
claiming a card signs you in with Faable Auth. Collect all eight in the feature
gallery (📖).

**Live:** https://invite.faable.com _(you don't need an account to open a pack)_

<!-- screenshot -->

## How it uses Faable

### Faable Deploy: a static Vite build, no config

There's no `Dockerfile`, no `faable.json` and no server code in this repo. Faable
reads `package.json`, sees Vite, runs `npm run build` and serves `dist/` as a
static site with TLS on `<app>.faable.link`. Every push to `main` deploys again.

You can deploy it either way:

```bash
# from a GitHub or GitLab repo: create an app in the dashboard and pick the repo
# or straight from your terminal, no repo needed:
npx @faable/faable deploy
```

There is no `start` script on purpose: with one, Faable would run it as a Node
process instead of serving the build.

### Faable Auth: sign-in and a profile field, no backend

Opening packs is anonymous, and the gallery lives in your browser. **Claim this
card** on the one you want to keep sends you to the tenant's hosted
login (Authorization Code + PKCE, via [`@faable/auth-js`](https://www.npmjs.com/package/@faable/auth-js)),
and when you come back the card is written to your own profile:

```js
await auth.updateProfileField("invite_card", "this-app");
```

That lands in `user_metadata["faable.com/fields"]`, so the card follows you to any
device you sign in on. The page never talks to a server of its own: everything it
does goes from the browser to Faable Auth with the user's access token. Open
**What this app knows about you** after signing in to see the profile and the
decoded access token claims.

All of it is in [`src/auth.js`](src/auth.js) (about 60 lines).

What the tenant needs:

| Setting | Value |
|---|---|
| Client type | Single-page app (public client, no secret) |
| Allowed callback URL | `https://<your-app>.faable.link/` |
| Allowed logout URL | `https://<your-app>.faable.link/` |
| Allowed web origin | `https://<your-app>.faable.link` |
| Profile fields | `invite_card`, an enum of the card ids, so users may write it on themselves and nothing else |

Then put the domain and client id in [`src/config.js`](src/config.js). They're
public: an SPA sends both to `/authorize` anyway.

**"One card per account" is only a UI rule.** A profile field is writable by its
user, so anyone with a token can switch their card with a `curl` (only to another
valid card id: the field is an enum). That's fine for a demo card. For anything
that must hold up, check it on a server that validates the token, or keep it
somewhere users can't write.

## Run it locally

```bash
npm install
npm run dev
```

Without values in `src/config.js` the pack works and the claim button explains that
Auth isn't configured. To try sign-in locally, add `http://localhost:5173/` to the
client's callback and logout URLs and `http://localhost:5173` to its web origins.

## What's in here

| File | What it does |
|---|---|
| `src/main.js` | The flow: cover → pack → three cards → claim |
| `src/galeria.js`, `src/visor3d.js` | The feature gallery and its 3D card viewer |
| `src/auth.js` | Faable Auth: session, claim, sign out, claims panel |
| `src/pack3d.js`, `src/shaders.js`, `src/material.js` | The 3D pack and holographic card (three.js) |
| `src/carta.js`, `src/texturas.js` | Card face, pack and card back, drawn on canvas |
| `src/mazo.js` | Which cards a pack holds (new and common ones come out more often) |
| `public/ediciones.json` | The cards: text, product, rarity |
| `public/art/` | Card illustrations (SVG) |

## License

MIT
