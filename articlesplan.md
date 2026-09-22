# Articles Redesign — Architectural Plan

> **Date:** 2026-09-21
> **Status:** In progress — Tasks A, B, C, D done. E pending.
> **Authors:** Dave Proskin + AI Agent

---

## 1. Problem Statement

Currently, articles are authored by hand-coding JSX directly in `src/data/articles.tsx`. Each new article requires modifying TypeScript source code, managing React component variables, and rebuilding the app for every content change. This makes publishing difficult and non-technical workflows (e.g., exporting from Word as PDF) nearly impossible.

---

## 2. Goals

1. **Author articles as Markdown files** — Each article lives as an `Article.md` file alongside its assets.
2. **Runtime loading** — The Article page fetches and renders the markdown at runtime; no source-code changes needed for new content.
3. **PDF to Markdown conversion tool** — A script that converts exported article `.pdf` files into properly structured Markdown.
4. **Local image handling** — Images travel with their article in the same folder, referenced by relative paths.
5. **No new runtime dependencies for users** — Keep bundle footprint reasonable.

---

## 3. Design Decisions and Rationale

| Decision | Choice | Rationale |
|---|---|---|
| Article file location | `public/articles/{slug}/Article.md` | Served as static files by dev server and Netlify/Vercel without Vite transforms. |
| Rendering approach | Client-side fetch + react-markdown | True dynamic loading; new articles appear immediately after deployment with zero rebuild. |
| Metadata storage | YAML frontmatter inside each .md file | Single source of truth — one file per article, no sidecar JSON needed. |
| Image storage | Per-article folder (e.g., public/articles/fttbl/) | Natural 1:1 mapping; relative markdown links work without path fiddling. |
| Listing page metadata | Auto-discovered at build time via post-build script scanning public/articles/ and writing articles-manifest.json | Avoids manual metadata sidecars; regenerated automatically each deploy. |

---

## 4. Directory Structure (After Implementation)

```
public/
  articles/
    farm-to-table-local-llms/
      Article.md                    (Main content + YAML frontmatter)
      banner.png                    (Cover / featured image)
      section1.jpg through section5.jpg (Inline images)
```

### YAML Frontmatter Fields

Each `Article.md` file begins with a YAML block delimited by `---`:

| Field | Required? | Description |
|---|---|---|
| slug | Yes | The URL slug (e.g., farm-to-table-local-llms) |
| title | Yes | Display title of the article |
| date | Yes | ISO 8601 date in YYYY-MM-DD format |
| excerpt | Yes | Short one-line description shown on the listing page |
| coverImage | No | Optional filename in the same folder (e.g., ./banner.png) |

### Standard Markdown Elements Supported

| Element | Markdown Syntax | Notes |
|---|---|---|
| Headings | `#`, `##`, `###` | Map to h1, h2, h3 in rendered body |
| Paragraphs | Blank-line-separated text | — |
| Bold / Italic | `**bold**`, `*italic*` | Standard markdown emphasis |
| Unordered lists | `- item` or `* item` | Nested via indentation |
| Ordered lists | `1. item` | Nested via indentation |
| Links | `[text](url)` or `[text](./image.jpg)` | External URLs and relative paths |
| Images | `![alt](./photo.jpg)` | Relative paths resolve to article folder |
| Code blocks | Triple backticks + language | Syntax highlighting via rehype-highlight |
| Blockquotes | `> text` | Styled with existing .article__content-blockquote class |
| Horizontal rule | `---` or `***` | — |

---

## 5. Runtime Architecture

### 5.1 Article Detail Page (Article.tsx)

Flow:

1. User navigates to `/articles/:slug`
2. Component reads `slug` from URL params via `useParams()`
3. Constructs fetch URL: `/articles/{slug}/Article.md`
4. Fetches raw markdown text (`text/plain`)
5. Parses YAML frontmatter using `gray-matter` → `{title, date, excerpt, coverImage}`
6. Splits out body markdown (everything after the `---` delimiter)
7. Renders:
   - **Header**: date, title, excerpt (from frontmatter)
   - **Cover image** (if `coverImage` frontmatter key exists): `<img src="/articles/${slug}/${coverImage}" />`
   - **Body content**: `<ReactMarkdown rehypePlugins={[rehypeHighlight, rehypeSanitize]}>{bodyMarkdown}</ReactMarkdown>`

### 5.2 Articles Listing Page (Articles.tsx)

Flow:

1. Page mounts and triggers `useEffect`
2. Fetches `/articles-manifest.json` (generated at build time)
3. Renders a list of article cards from the manifest data
4. Each card links to `/articles/{slug}`

### 5.3 Data Flow Diagram

```
+---------------------------------------------------------------+
|                   Developer Workflow                           |
|                                                                |
|  1. Write/edit Article.md (manually or via conversion script) |
|  2. Place images in same folder                               |
|  3. Commit and deploy                                         |
+-----------------------------------------+----------------------+
                                          |
                                          v
+---------------------------------------------------------------+
|                      Build Step                                |
|                                                                |
|  Post-build script scans public/articles/                     |
|    -> Generates articles-manifest.json in dist/               |
|    -> Copies article folders + files to dist/                 |
+-----------------------------------------+----------------------+
                                          |
                                          v
+---------------------------------------------------------------+
|                   Netlify / Vercel                             |
|                                                                |
|  Serves static files:                                         |
|    /articles/{slug}/Article.md   (text/plain)                 |
|    /articles/{slug}/*.png, *.jpg  (images)                    |
|    /articles-manifest.json    (JSON)                          |
+-----------------------------------------+----------------------+
                                          |
                                          v
+---------------------------------------------------------------+
|                     Browser (SPA)                              |
|                                                                |
|  Article.tsx: fetch + parse frontmatter -> ReactMarkdown      |
|  Articles.tsx: fetch manifest -> render card list             |
+---------------------------------------------------------------+
```

---

## 6. PDF to Markdown Conversion Tool

### 6.1 Overview

A standalone Node.js CLI script that converts exported article `.pdf` files into properly structured Markdown ready for placement in an article folder. Articles are authored (or exported) as PDFs — the conversion script extracts text with its formatting metadata and reconstructs a clean Markdown document.

### 6.2 Input / Output

| Input | Output |
|---|---|
| `farmtotable-iosappwithlocalllms.pdf` (or any exported article `.pdf`) | `public/articles/<slug>/Article.md` + images |

### 6.3 Conversion Process

```
User runs: node scripts/convert-pdf-to-markdown.mjs \
    --input farmtotable-iosappwithlocalllms.pdf \
    --output ./public/articles/farm-to-table-local-llms/ \
    --title "Farm-to-Table: Building an iOS App with Local LLMs" \
    --date 2026-09-15 \
    --excerpt "Lessons from the test kitchen..."

Step 1: Parse PDF structure (extract text runs with font size, weight, position)
Step 2: Apply style rules based on font properties and layout heuristics
Step 3: Add YAML frontmatter template (prompt user or use CLI flags)
Step 4: Write output as Article.md in target directory
Step 5: (Optional) Extract embedded PDF images to same directory
```

### 6.4 Style Detection Heuristics (from actual PDF file analysis)

PDFs store text as individual character runs with associated font properties. The conversion script analyzes these to reconstruct document structure:

| PDF Text Property | Markdown Output |
|---|---|
| Font size ~50-60pt + bold | `# Heading 1` |
| Font size ~24-30pt + bold/italic | `## Heading 2` |
| Regular font (9-12pt) | Normal `<p>` paragraph |
| Bullet characters at consistent indentation | `- item` (unordered list) |
| Numbered patterns with leading whitespace | `1. item` (ordered list) |
| Bold inline in body text | `**bold**` |
| Italic inline in body text | `*italic text*` |

The script will use font-size clustering to automatically determine heading thresholds rather than hard-coded values, making it more robust across different article templates.

### 6.5 Dependencies

| Package | Purpose |
|---|---|
| `pdf-parse` or `@mozilla/pdf.js` (via `pdfjs-dist`) | Parse PDF binary and extract text runs with font/size metadata |
| Built-in Node.js `fs`, `path`, `crypto` | File I/O, image output — no extra dependency needed |

### 6.6 Post-Conversion Cleanup

The initial conversion output may need manual refinement: excessive blank lines, list indentation issues, or frontmatter values that need correction. The plan includes an authoring guide documenting common patterns and fixes. Expect ~5–10 minutes of manual editing per article after conversion.

### 6.7 Image Extraction from PDFs

PDFs can contain embedded images in various formats. Extracting them is non-trivial because:
- Images may be compressed or encoded differently than standard PNG/JPG
- They may not have meaningful filenames or alt text metadata
- Some PDF writers embed images at high resolution without optimization

For Phase 1, image extraction will be **optional and manual**:
- The script can attempt basic image extraction if `--extract-images` is passed
- Recommended workflow: save article images manually from the source (Word/Google Docs) as PNG/JPG files into the article folder
- Inline images in Markdown are referenced by relative path — the conversion script will note any detected image regions in a TODO comment so they can be added manually
- Phase 2 could add automated extraction with quality detection and format normalization

### 6.8 Link Handling in PDFs

PDFs often contain hyperlinks that get lost during text extraction. The conversion script will attempt to preserve:
- URL text visible on the page (e.g., `[GitHub](https://github.com)`)
- Underlined or colored text that may be a link — flagged as `TODO: verify link` for manual review


## 7. Dependencies to Add

| Package | Purpose | Install As |
|---|---|---|
| `react-markdown` | Parse and render Markdown to React JSX | dependency |
| `gray-matter` | Extract YAML frontmatter from markdown strings | dependency |
| `rehype-highlight` | Syntax highlighting for code blocks | dependency |
| `rehype-sanitize` | Sanitize rendered HTML for security | dependency |
| `remark-gfm` | GitHub Flavored Markdown (tables, strikethrough) | devDependency |

**Estimated bundle impact:** ~15-20 KB gzipped combined.

---

## 8. Implementation Tasks

### Task Group A — Foundation

#### A1. Create Directory Structure and Migrate Existing Assets
- **Files:** directory + copy operations only
- Steps:
  1. Create `public/articles/` if it does not exist
  2. Rename `public/articles/fttbl/` to `public/articles/farm-to-table-local-llms/`
  3. Verify all images (banner.png, section1.jpg through section5.jpg) are present

#### A2. Install Dependencies
- Steps:
  1. Run `npm install react-markdown gray-matter rehype-highlight rehype-sanitize remark-gfm`
  2. Verify with `npm run build` that the project still compiles cleanly

### Task Group B — Build Tooling

#### B1. Create Post-Build Manifest Generator Script
- **File to create:** `scripts/generate-articles-manifest.mjs`
- Behavior:
  1. Reads all directories under `public/articles/`
  2. For each, parses `Article.md` frontmatter using `gray-matter`
  3. Writes JSON array to `dist/articles-manifest.json`:

    ```json
    [{ "slug": "...", "title": "...", "date": "...", "excerpt": "...", "coverImage": "..." }]
    ```

  4. Update `package.json`: add `"build:articles"` script; modify `"build"` to include it.

#### B2. Verify Article Files Reach Build Output
- **File:** possibly `vite.config.ts`
- Vite copies `public/` to `dist/` by default. Confirm nested subdirectories copy correctly. Add explicit copy step in post-build script if needed.
### Task Group C — Frontend Rewrite

#### C1. Create Article Parsing Utility Functions
- **File to create:** `src/utils/articleParser.ts`
- Exports:
  - `parseFrontmatter(rawMarkdown): { content: string; data: Record<string, string> }`
    - Splits markdown on frontmatter delimiter block
    - Returns parsed frontmatter as object and body text as plain string

#### C2. Rewrite Article Detail Page
- **File to change:** `src/pages/Article.tsx`
  1. Read `slug` from `useParams()`
  2. `useEffect` + `fetch('/articles/${slug}/Article.md')` to load raw markdown text
  3. Parse frontmatter with utility from C1
  4. State variables: `loading`, `error`, `articleData`, `bodyMarkdown`
  5. Render header (date, title, excerpt from frontmatter) + optional cover image
  6. Body via `<ReactMarkdown rehypePlugins={[rehypeHighlight, rehypeSanitize]}>`
  7. Keep same top-level CSS classes (`page`, `article-page`) for existing style compatibility
  8. Handle 404 with "Article not found" and link back to Articles page

#### C3. Add Markdown Rendering Styles
- **File to change:** `src/pages/Article.css`
- Add rules inside `.article__body`: `h1/h2/h3`, list indentation, blockquote styling (reuse existing), responsive `img`, code blocks with dark bg + monospace font, consistent link colors

#### C4. Rewrite Articles Listing Page
- **File to change:** `src/pages/Articles.tsx`
  1. On mount, `fetch('/articles-manifest.json')` to get article list
  2. State: `loading`, `error`, `articles: ArticleCardData[]`
  3. Render existing card UI using manifest data; links remain `/articles/${article.slug}`
- **Type definition:** Create `src/types/article.ts`:

    ```ts
    export interface ArticleCardData {
      slug: string; title: string; date: string; excerpt: string; coverImage?: string;
    }
    ```
### Task Group D — PDF Conversion Tool ✅ DONE

#### D1. Implement PDF to Markdown CLI Script ✅ DONE
- **File created:** `scripts/convert-pdf-to-markdown.mjs`
- Steps completed:
  1. ✅ Uses `pdf-parse` v2 (`PDFParse` class) to read input `.pdf` file and extract text with font/size metadata
  2. ✅ Applies heuristics (font sizes → headings, bullets → list syntax, title-case → H3)
  3. ✅ Accepts CLI flags for frontmatter (--title, --date, --excerpt) or prompts interactively
  4. ✅ Writes `Article.md` with YAML frontmatter in target directory
  5. ✅ Optional `--extract-images` flag for embedded image extraction
  6. ✅ Optional `--verbose` and `--no-heuristics` flags

Example:

    node scripts/convert-pdf-to-markdown.mjs \
      --input farmtotable-iosappwithlocalllms.pdf \
      --output ./public/articles/farm-to-table-local-llms/Article.md \
      --title "Farm-to-Table: Building an iOS App with Local LLMs" \
      --date 2026-09-15 \
      --excerpt "Lessons from the test kitchen..."

#### D2. Document the Conversion Workflow ✅ DONE
- **File created:** `docs/articles-authoring.md` (248 lines)
- Comprehensive guide covering: write in Word → export as `.pdf` → run conversion script → review and tweak → deploy. Articles appear automatically with zero code changes. Includes FAQ, troubleshooting, commands reference, and heuristics documentation.

### Task Group E — Migration and Verification

#### E1. Migrate Existing Article to Markdown
- Convert the existing "Farm-to-Table" article from JSX into `Article.md` format (via conversion script or manual authoring)
- Ensure all images referenced via relative paths (`./banner.png`, `./section1.jpg`)
- Verify rendering on both listing and detail pages

#### E2. End-to-End Verification
- Run `npm run build`: TypeScript compiles, manifest generated in `dist/`, article files in `dist/articles/`
- Run `npm run dev`: `/articles` loads from manifest, `/articles/farm-to-table-local-llms` renders correctly, non-existent slug shows 404 fallback
- Test that adding a new article folder requires **no code changes** — just add the folder and redeploy
---

## 9. Migration Strategy

### Phase 1: Parallel (No Breaking Changes)
1. Implement Tasks A1-A2, B1-B2, C1-C4
2. Leave existing `src/data/articles.tsx` in place — it will not interfere
3. Test the new system with the Farm-to-Table article alongside the old JSX version

### Phase 2: Cutover
1. Convert all existing articles to Markdown format (Task E1)
2. Remove `src/data/articles.tsx` references from Article.tsx and Articles.tsx
3. Remove old data imports — no longer needed

### Phase 3: Cleanup
1. Remove unused types (ArticleEntry) from leftover code
2. Update AGENTS.md to reflect the new article workflow (or create dedicated authoring guide)
3. Add a note in README about the new Markdown-based articles

---

## 10. Open Questions for Review

| # | Question | Suggested Answer |
|---|---|---|
| Q1 | Should frontmatter be required or optional? | **Required.** Every article needs at least slug, title, and date. The listing page depends on it. |
| Q2 | Where should inline images live? | In the same folder as Article.md. Relative paths resolve naturally. |
| Q3 | What about external image URLs? | Supported natively by Markdown. No special handling needed. |
| Q4 | Should we support math / Mermaid diagrams in Phase 1? | **No.** The plugin architecture (rehype-*, remark-*) makes it easy to add later. |
| Q5 | Should the tool auto-extract embedded images from PDF? | **Not for Phase 1.** Most images are external files saved manually. Image extraction from PDFs requires dedicated tools but we defer it for Phase 1. |
| Q6 | How should the cover image render? | As an `<img>` below the article header (date + title + excerpt), above the main content body. |

---

## 11. Non-Goals (Out of Scope)

- **Server-side rendering / static site generation** — This is a client-side SPA; articles load via fetch at runtime.
- **Search functionality** — Out of scope for Phase 1. Could be added later by indexing the manifest and body content.
- **Comments / discussion system** — Not part of this plan.
- **Rich text editor in the browser** — Authors edit files on disk (or via Git), not in a CMS.
- **Multi-language / i18n** — Articles are English-only for now.
---

## 12. Summary of Files to Create or Modify

| Action | File Path | Description |
|---|---|---|
| CREATE | `scripts/generate-articles-manifest.mjs` | Post-build script scanning articles, writing manifest JSON |
| CREATE | `scripts/convert-pdf-to-markdown.mjs` | CLI tool for PDF to Markdown conversion |
| CREATE | `src/utils/articleParser.ts` | Frontmatter parsing utility |
| CREATE | `src/types/article.ts` | Shared TypeScript types (ArticleCardData, etc.) |
| CREATE | `docs/articles-authoring.md` | Authoring guide and workflow documentation |
| MODIFY | `package.json` | New scripts (build:articles), new dependencies |
| MODIFY | `vite.config.ts` | Optional: ensure public/ subdirectories are copied to dist/ |
| MODIFY | `src/pages/Article.tsx` | Full rewrite: fetch markdown, parse frontmatter, render with react-markdown |
| MODIFY | `src/pages/Articles.tsx` | Rewrite: fetch manifest, render article cards |
| MODIFY | `src/pages/Article.css` | Add default markdown body styles (img, code, pre, etc.) |
| MIGRATE | `public/articles/farm-to-table-local-llms/Article.md` | New markdown file replacing JSX content for first article |

---

_End of architectural plan._
