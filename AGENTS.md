# Agent Guidelines — Articles

This file documents how to add new articles to the personal website.

## Quick Reference

| Item | Location |
|---|---|
| Article Markdown source | `public/articles/<slug>/Article.md` (+ images) |
| Index page (list) | `src/pages/Articles.tsx` + `.css` |
| Article detail page | `src/pages/Article.tsx` + `.css` |
| Manifest generator | `scripts/generate-articles-manifest.mjs` |
| PDF Import script | `scripts/import-articles.mjs` |

---

## Adding a New Article — Two Methods

### Method 1: PDF Import (Recommended)

This is the fastest way to get content on the site from an existing document.

#### Workflow

```bash
# 1. Drop your exported PDF into the rawArticles folder
open rawArticles/        # or drop via Finder
npm run importArticles   # converts PDF → Markdown, creates article folder
npm run build            # builds and deploys the new article
```

#### What it does

1. Scans `rawArticles/` for `.pdf` files
2. For each **new** PDF (not already imported):
   - Parses text using `pdf-parse` v2
   - Applies style-detection heuristics to convert headings, lists, etc. into Markdown
   - Generates YAML frontmatter with slug (from filename), title (from first line), and today's date
   - Creates a `public/articles/<slug>/Article.md` file with TODO reminders
3. Skips files that have already been imported (no re-processing)

#### After importing

The generated Markdown will need manual review:
- Frontmatter values (title, slug, date, excerpt, coverImage) should be verified and edited
- Images from the source document should be saved into the article folder
- Links should be converted to Markdown format

### Method 2: Manual Markdown

You can also write Markdown files directly in `public/articles/<slug>/`.

#### Article File Structure

```
public/articles/my-article-slug/
├── Article.md          # Required — frontmatter + Markdown body
├── banner.png          # Optional — cover image
└── section1.jpg        # Optional — images referenced in content
```

#### Frontmatter format (YAML)

```yaml
---
slug: my-article-slug
title: "My Article Title"
date: 2026-10-01
excerpt: "A short one-line description."
coverImage: ./banner.png
---
```

| Field | Required | Notes |
|---|---|---|
| `slug` | Yes | URL-friendly identifier, lowercase with dashes |
| `title` | Yes | Display title shown in listing and header |
| `date` | Yes | ISO 8601 format: `YYYY-MM-DD` |
| `excerpt` | No | Short description shown on the articles listing page |
| `coverImage` | No | Path to an image in the same folder, e.g. `./banner.png` |

#### Markdown body structure

The article body uses standard Markdown rendered by `react-markdown`. Common patterns:

- **Headings:** `## Section Title`, `### Subsection`
- **Paragraphs:** plain text with line breaks
- **Images:** `![alt text](./image.jpg)` — images must be in the article folder
- **Lists:** `- item` (unordered), `1. item` (ordered)
- **Code blocks:** fenced with triple backticks + language
- **Emphasis:** `**bold**`, `*italic*`


## Existing Articles

| Slug | Title | Date |
|---|---|---|
| `farm-to-table-local-llms` | Farm-to-Table: Building an iOS App with Local LLMs | 2026-09-15 |
