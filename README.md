# Bootleg Bots

A private online card game about hilariously bad robot designs.

## Local setup

1. Install Node.js 22 or newer.
2. Copy `.env.example` to `.env.local` and set the Supabase project URL and **publishable** key.
3. Run `npm install` and `npm run dev`.

Never place an `sb_secret_` key in a Vite environment variable or frontend source. It is server-only.

## Deployment

The GitHub Actions workflow deploys `main` to GitHub Pages at:

`https://captankrk.github.io/Bootleg-Bots/`

Before the first deployment, add these repository Actions secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

In GitHub, also set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**.

When a custom domain is ready, configure it in GitHub Pages and update the Vite build base in `.github/workflows/deploy-pages.yml` from `/Bootleg-Bots/` to `/`.
