# feed.

A finite reading edition for AI, biology and the space between them.

Today brings together articles, research and concepts worth understanding.
Watch gives talks and tutorials room to breathe. The Paper interface shares
typography, spacing and navigation across both views.

This is the public frontend. Library, the curator's feedback, saved items,
reading history and original knowledge archive belong to a separate private
application. The Library / Sign in links open that application. Public visitors
can browse without an account; this deployment contains no write API.

## Develop

Use Node 22 or later:

```sh
npm ci
npm run build:public
```

Serve `.public-dist/` with the route rewrites in `vercel.json`, or deploy the
repository to Vercel. The deployment does not require secrets or a database.
Change `OWNER_ORIGIN` in `src/feed.js` and the `/library` redirect in
`vercel.json` when adapting it for another curator.

`content/feed/editions/` contains source links and short editorial descriptions.
The public field allowlist lives in `src/feed-catalogue.js`. Source works remain
on their original publishers' websites; no full articles or videos are hosted.

## Licence

Application code is MIT licensed. Linked works belong to their respective
authors. Font licences are in `public/fonts/`; the Full stop mark uses an
outlined Fraunces glyph, with its OFL licence in `public/icon-license.txt`.
