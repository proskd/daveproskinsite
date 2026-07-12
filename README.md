# Dave Proskin — Personal Site

A single-page React application for personal projects, resume, and portfolio content. Built with [Vite](https://vitejs.dev/) and [React](https://react.dev/), with no backend.

## Prerequisites

- Node.js 18 or later (recommended)
- npm

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the development server at `http://localhost:5173` |
| `npm run build` | Type-check and build for production (output in `dist/`) |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Run TypeScript type checking only |

## Development

```bash
npm install
npm run dev
```

## Deployment

The build produces static files in `dist/` suitable for any static host that supports single-page applications (SPA).

```bash
npm run build
```

Upload the contents of `dist/` to your host, or connect the repo for automatic deploys.

### Supported hosts

Configuration is included for common SPA hosts:

- **Netlify** — `netlify.toml` and `public/_redirects` rewrite all routes to `index.html`
- **Vercel** — `vercel.json` handles client-side routing
- **Cloudflare Pages, GitHub Pages, etc.** — use `dist` as the publish directory and enable SPA fallback / rewrite rules to `index.html`

### Manual deploy

After building, deploy the `dist` folder:

```bash
npm run build
# Then upload dist/ to your hosting provider
```

## Project structure

```
src/
  components/   # Shared UI (Layout, etc.)
  pages/        # Route pages (Home, Projects, Resume)
  App.tsx       # Route definitions
  main.tsx      # App entry point
```

## Next steps

- Design layout, typography, and color scheme
- Add project content and resume sections
- Customize metadata in `index.html`
