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

## Motion and visual language

The homepage uses an editorial industrial palette. Page content and event cards are visible immediately, without entrance animations delaying the first paint. Interactive controls retain CSS hover and focus states. Motion respects the operating system's `prefers-reduced-motion` setting. The event list requires the project's database and Supabase environment configuration to display live events.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to self-host Inter, including its metric-adjusted fallback through `--font-inter`.

## Public-page loading

- Public event lists use their server-rendered seed on the initial visit instead of immediately requesting the same events again. Missing seeds, seeds from a previous calendar day, explicit `?refresh=1` visits and changes to quick date filters still fetch events. The server cache remains 60 seconds.
- Event-card image sizes follow the grid's columns, gutters and container padding. Only the first two cards load images eagerly; subsequent images remain lazy-loaded.
- React Toastify 11 injects its own styles when the container mounts. Avoid importing its CSS globally as well: that duplicates styles and adds a render-blocking stylesheet to every page.

Validate changes with `node --test lib/public-event-list.test.mjs`, `npx tsc --noEmit` and `npm run build`. After deploying, rerun PageSpeed Insights on the production URL using the same mobile settings; local browser timings are not directly comparable to Lighthouse's throttled results.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
