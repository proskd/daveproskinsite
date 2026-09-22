# Agent Guidelines — Articles

This file documents how to add new articles to the personal website.

## Quick Reference

| Item | Location |
|---|---|
| Article data + JSX content | `src/data/articles.tsx` |
| Index page (list) | `src/pages/Articles.tsx` + `.css` |
| Article detail page | `src/pages/Article.tsx` + `.css` |

## Adding a New Article — Step by Step

### 1. Add content to `src/data/articles.tsx`

Open `src/data/articles.tsx`. You'll find:

- An `ArticleEntry` type definition.
- A JSX element variable (e.g. `farmToTableBodyNode`) containing the full article content as JSX.
- The `articles` array with one entry per article.
- An auto-generated `articleMap` derived from the array (no manual update needed).

#### Pattern for a new article

```tsx
// A) Define a JSX element variable with your article sections.
const myNewArticleNode: React.JSX.Element = (
  <>
    <section className="page__section" aria-labelledby="intro-heading">
      <h2 id="intro-heading" className="page__section-title">Introduction</h2>
      <p>Your paragraph content here.</p>
    </section>

    {/* Add more sections as needed */}
  </>
)

// B) Append a new entry to the articles array (use variable reference, not call).
export const articles: ArticleEntry[] = [
  // ... existing entries
  {
    slug: 'my-new-article-slug',
    title: 'My Article Title',
    date: '2026-10-01', // YYYY-MM-DD format
    excerpt: 'A short one-line description of the article.',
    body: myNewArticleNode,  // reference the variable, do NOT call it
  },
]

// C) No change needed for articleMap - it auto-generates from the array.
```

### 2. Structure your JSX content

Each article should be organized into semantic `<section>` elements with:

| Class | Purpose |
|---|---|
| `page__section` | Wraps a logical section of the article |
| `page__section-title` | The h2 heading for the section (styled as an uppercase label) |

Example structure:

```tsx
<section className="page__section" aria-labelledby="heading-id">
  <h2 id="heading-id" className="page__section-title">Section Title</h2>
  <p>Body content goes here.</p>
</section>
```

#### Supported HTML elements

All standard semantic HTML is supported. Common patterns:

- **Paragraphs:** `<p>…</p>`
- **Unordered lists:** `<ul><li>…</li></ul>` (also supports nested `<ul>`)
- **Ordered lists:** `<ol><li>…</li></ol>`
- **Blockquoted / code examples:** `<pre className="article__content-blockquote">…</pre>` (gives an accent-colored left border with monospace font)
- **Horizontal rules:** `<hr />`
- **Emphasis:** `<strong>bold</strong>`, `<em>italic</em>`

### 3. Routing (no changes needed)

The article detail page uses a dynamic route `articles/:slug`. No changes to `App.tsx` or `Layout.tsx` are required for new articles — the routing already handles any slug under `/articles/`.

If you add a new top-level page (not an article), update:
- **`src/App.tsx`** — Add the import and a `<Route>` inside the Layout wrapper.
- **`src/components/Layout.tsx`** — Append `{ to: '/new-path', label: 'Nav Label' }` to `navItems`.

### 4. Styling conventions

- All typography (h1–h6, p, ul/ol) inherits from global styles in `src/index.css`.
- Article-specific styles live in `src/pages/Article.css` using BEM naming (`article-page__*`, `article__*`).
- Index page card styles live in `src/pages/Articles.css` (BEM: `article-card__*`).
- Reuse existing CSS variables from `index.css` (`--color-accent`, `--color-text-muted`, etc.).
- Page-enter animation is applied via the `.page` class on the top-level section.

### 5. Date format

Use ISO 8601 format: `YYYY-MM-DD` (e.g., `"2026-10-15"`).

### 6. Verification

After making changes:

```bash
npm run build    # Ensure TypeScript compiles without errors
npm run dev      # Preview locally at http://localhost:5173/articles
```

## Existing Articles

| Slug | Title | Date |
|---|---|---|
| `farm-to-table-local-llms` | Farm-to-Table: Building an iOS App with Local LLMs | 2026-09-15 |
