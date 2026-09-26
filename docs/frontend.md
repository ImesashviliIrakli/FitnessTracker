# Frontend

React 19 + TypeScript + Vite SPA in `frontend/`. Served by unprivileged nginx in its own image; it only talks to the API over HTTPS with the auth cookie.

## Stack

TanStack Query (server state), React Router (library mode), React Hook Form + Zod (forms), Tailwind CSS v4 with hand-written primitives in `src/components/ui.tsx` (native `<dialog>`, `<select>`, radio-based segmented controls), Recharts, date-fns, sonner (toasts, `aria-live`), lucide icons, vite-plugin-pwa.

## Layout

```
src/
  main.tsx            query client, refetch-on-write, service worker, theme watcher
  router.tsx          routes; RequireAuth (→ /login, → /onboarding) and GuestOnly guards; pages lazy-loaded
  lib/                api client, auth hooks, units, formatting, training math, theme, contract types
  components/         AppShell, ui primitives, charts, forms shared by onboarding + settings, dialogs
  pages/              one file per screen
  test/               Vitest setup + render helper
e2e/critical.spec.ts  Playwright: register → onboarding → weigh-in → workout → dashboard
```

## Configuration

The API base URL is `VITE_API_BASE_URL`, inlined by Vite at build time (`src/lib/api.ts`, default `http://localhost:8080`). Locally put overrides in a gitignored `.env.development`; the Docker image takes it as a build arg.

`nginx.conf` serves `index.html` and `sw.js` `no-cache`, hashed `/assets/*` `immutable`, and falls back to `index.html` for client-side routes.

## Conventions

- **Units:** the API is metric only. All conversion happens in `src/lib/units.ts` via `useUnits()`; forms hold display units and convert on submit.
- **Auth:** cookie session, `credentials: "include"`, `X-CSRF: 1` on writes. A 401 outside `/api/auth/*` fires `auth:expired`, which clears the user and the guard redirects to `/login`.
- **Data freshness:** every successful write (except auth and the calculator) fires `data:changed`; `main.tsx` refetches active queries. Deliberately coarse — the app is small.
- **Errors:** ProblemDetails → `ApiError`; validation keys (`Exercises[0].Sets[1].Reps`) are mapped onto form fields with `applyFieldErrors`.
- **Offline:** the service worker precaches the app shell and serves recently viewed API GETs network-first (5 s timeout, 7 days). Logging out clears that cache.
- **Design:** chalk surfaces with Olympic plate colours as data colours (blue = strength/primary, yellow = cardio/warnings, green = mobility/goal, red = sport/records/danger). Archivo (self-hosted variable font, width axis for headings). Light, dark and system themes.

## Commands

```bash
npm ci
npm run dev        # http://localhost:5173, API expected at http://localhost:8080
npm test           # Vitest + React Testing Library
npm run build      # type-check + production build
npm run e2e        # Playwright; needs dotnet run + npm run dev running
docker build --build-arg VITE_API_BASE_URL=https://api.example.com -t fittrack-web .
```
