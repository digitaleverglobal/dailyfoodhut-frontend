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

Open [http://api.dailyfoodhut.com](http://api.dailyfoodhut.com) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Deploy on Webuzo / Passenger

Use the directory containing `package.json` and `server.js` as the application's
root, and select `server.js` as the startup file. Set `NODE_ENV=production` in
the hosting panel. Use Node.js 20.9 or newer.

In the hosting terminal, activate the application's Node.js environment and
change to that application root. Ensure `.env` contains the intended production
API URL before building, then run:

```bash
npm ci --include=dev
npm run build
test -s .next/BUILD_ID && echo "Production build ready"
```

Only after the build succeeds, restart the application from the hosting panel.
Repeat the build after deploying source changes. The build currently downloads
the Lato font from Google Fonts, so the build machine needs internet access.

`Could not find a production build in the '.next' directory` means the app is
starting without a successful production build in its application root.
`server.js` starts the app; it does not build it. A source-only ZIP upload or Git
checkout does not include `.next` (it is ignored by Git), so build on the host
after extracting/installing. Running `npm run dev` does not create the required
production build either. If uploading a prebuilt deployment instead, include
the complete hidden `.next` directory from a successful compatible build, along
with the application files and `public` assets.
