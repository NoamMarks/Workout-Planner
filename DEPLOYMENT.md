# IronTrack — Deployment Guide

## Architecture overview

IronTrack is a **purely client-side SPA** (no backend server, no database). All data is persisted in the browser's `localStorage`. The compiled output is a folder of static files (`dist/`) that can be served from any CDN or static host.

Recommended host: **Vercel** (free tier is sufficient).

---

## Environment variables

IronTrack has **no required environment variables** for the current version. The application does not call any external APIs and ships no server-side code.

If you extend IronTrack with a backend in the future, add variables to a `.env` file (never committed — already in `.gitignore`):

```
# Example future variables — not used yet
VITE_API_BASE_URL=https://api.yourbackend.com
VITE_AUTH_SECRET=...
```

Vite only exposes variables prefixed with `VITE_` to the client bundle.  
Set these in the Vercel dashboard under **Settings → Environment Variables**.

---

## Production build

```bash
# 1. Install dependencies
npm install

# 2. Type-check + bundle
npm run build
# Output: dist/  (~321 kB JS, ~20 kB CSS, both gzipped)

# 3. Preview the production bundle locally before pushing
npm run preview
# Runs at http://localhost:4173
```

The build script runs `tsc && vite build`. TypeScript errors and ESLint warnings are **zero-tolerance** (`--max-warnings 0`). The pipeline will fail if either step emits a warning.

---

## Deploy to Vercel

### Option A — Vercel CLI (recommended for first deploy)

```bash
# Install the CLI globally (one-time)
npm i -g vercel

# From the project root:
vercel

# Follow the prompts:
#   Set up and deploy → Yes
#   Which scope?      → your account
#   Link to existing? → No (first deploy)
#   Project name?     → irontrack  (or any name)
#   Directory?        → ./  (project root)
#   Override settings?→ No  (Vercel auto-detects Vite)
```

Vercel detects Vite automatically and sets:

| Setting | Value |
|---------|-------|
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |

### Option B — Git integration (recommended for ongoing deploys)

1. Push the repo to GitHub (or GitLab / Bitbucket).
2. Go to [vercel.com/new](https://vercel.com/new) → **Import Git Repository**.
3. Select the `irontrack` repo.
4. Accept the auto-detected Vite settings.
5. Click **Deploy**.

Every push to `main` triggers an automatic production deployment.  
Every pull-request branch gets a unique preview URL.

---

## SPA routing on Vercel

IronTrack uses **in-memory view state** (not the URL), so no `vercel.json` rewrite rules are needed. If you later switch to `react-router` with URL-based routing, add:

```json
// vercel.json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

## Running tests before deploy

### Frontend unit tests (Vitest)

```bash
npm test
# 5 tests — WorkoutGridLogger component suite
```

These run without a browser or server and are safe to run in CI.

### Python E2E tests (Playwright)

Requires the dev server running locally on port 5173:

```bash
# Terminal 1 — start dev server
npm run dev

# Terminal 2 — run E2E suite
cd tests
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pytest test_workout.py -v
```

To run E2E tests in CI (e.g., GitHub Actions), start the dev server as a background step first:

```yaml
# .github/workflows/e2e.yml (example)
- name: Start dev server
  run: npm run dev &
- name: Wait for server
  run: npx wait-on http://localhost:5173
- name: Run E2E tests
  working-directory: tests
  run: pytest test_workout.py -v
```

---

## Post-deploy checklist

- [ ] Visit the Vercel deployment URL and verify the login page loads
- [ ] Log in with a seed account (coach@example.com / 123) and confirm the client list appears
- [ ] Log in as a trainee, open a workout session, enter values, and click Save
- [ ] Open Admin panel, add a column, verify it appears in the workout grid
- [ ] Check browser console — zero errors, zero 404s
- [ ] Run `npm run build` locally one final time with no errors
