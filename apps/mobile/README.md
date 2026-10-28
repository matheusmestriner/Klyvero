# Klyvero mobile

Expo (SDK 58) app for the day-to-day on a phone: **Inbox** (WhatsApp and e-mail conversations, reply, push
notifications), **Leads** (search, status, notes, call / WhatsApp / e-mail shortcuts) and **Agenda**
(list, create, edit and delete appointments).

It talks to the same API as the web app (`apps/api`, prefix `/api/v1`). The phone sends
`x-klyvero-client: mobile`, so the API returns the refresh token in the response body instead of an httpOnly
cookie; the app keeps it in the system keystore (`expo-secure-store`) and rotates it on every refresh.

This folder is **not** part of the pnpm workspace (`pnpm-workspace.yaml` excludes it): it is installed with npm
and has its own `package-lock.json`.

```bash
cd apps/mobile
npm ci
npm start                       # Expo dev server; scan the QR code with Expo Go or a dev build
npm run typecheck && npm test   # TypeScript + pure-logic tests (node --test)
npm run bundle                  # what CI runs: a production Android bundle
```

## API URL

`app.json` → `expo.extra.apiUrl` (the Render API). Override it for local work:

```bash
EXPO_PUBLIC_API_URL=http://192.168.0.10:4000 npm start
```

Use your machine's LAN address, not `localhost`, when testing on a physical phone.

## Push notifications

After login the app asks for permission and registers its Expo push token with `POST /devices`; logging out calls
`POST /devices/unregister`. The API sends a push for each inbound message (`type: "message"` + `threadId`), and tapping
it opens that conversation. Push needs a development or production build with an EAS project id
(`expo.extra.eas.projectId`); it does not work in Expo Go on Android nor in the browser.

## Layout

```
src/app/            expo-router routes: login, (tabs)/inbox|leads|agenda|more, thread/[id], lead/[id], event/[id]
src/lib/api.ts      fetch client: bearer token, single-flight refresh on 401, sign-in/out
src/lib/session.tsx session context and the redirect between login and the tabs
src/lib/push.ts     Expo push registration and notification → thread mapping
src/lib/format.ts   pure helpers (names, dates, phone digits) covered by format.test.ts
```

`pnpm contract:check` (repo root) also verifies that every route called from this app exists in the API.

## Trying it in a browser

`npx expo export --platform web` builds a static web version, handy for checking screens without a device.
Secure storage falls back to `localStorage` there, and push is disabled.
