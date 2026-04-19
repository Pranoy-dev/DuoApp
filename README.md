This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

Connect the repo and deploy. For **Clerk** (and optional Supabase sync), set environment variables in **Vercel → Project → Settings → Environment Variables** for **Production** (and **Preview** if you use preview URLs), then **Redeploy**.

Required for Clerk:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

Optional paths (defaults match this repo):

- `NEXT_PUBLIC_CLERK_SIGN_IN_URL` (default `/sign-in`)
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL` (default `/sign-up`)

For server-backed habits/sync (see `.env.example`):

- `NEXT_PUBLIC_DUO_USE_SERVER_DATA=1` plus Supabase URL, keys, and `SUPABASE_SERVICE_ROLE_KEY`

In the **Clerk dashboard**, add your deployment origin (for example `https://<project>.vercel.app` and any custom domain) so sign-in works in production.

More detail: [Next.js on Vercel](https://nextjs.org/docs/app/building-your-application/deploying).
