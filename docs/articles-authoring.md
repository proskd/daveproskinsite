# Article Authoring Guide

## Overview

Articles on this site are authored as Markdown files with YAML frontmatter, stored in `public/articles/{slug}/`. This approach allows non-technical workflows: write in Word or Google Docs, export as DOCX, run the conversion script, and deploy — all without touching source code.

## Quick Start (New Article)

1. Write your article in Word / Google Docs
2. Save images (cover, inline) as PNG/JPG files
3. Export document as DOCX
4. Run `npm run importDocx` to convert it automatically
5. Review and tweak the output
6. Commit and deploy — done!

## Workflow Detail

### Step 1: Write Your Article

Write your article content in your preferred editor (Word, Google Docs, etc.). When including images:

- **Cover image:** Export separately as `banner.png` (recommended) or another filename. This goes into the article folder and is referenced via the `coverImage` frontmatter field.
- **Inline images:** Save each as a separate file (e.g., `section1.jpg`, `section2.jpg`). These will be auto-detected if embedded in the DOCX, or you can reference them manually after conversion.

**Heading conventions:** Use Word styles to define your document structure:
- **Title style** → rendered as `# Title` in Markdown
- **Subtitle style** → rendered as italic subtitle under the title
- **Heading 3** → rendered as `## Section Heading` in Markdown
- **Body paragraphs** → rendered as regular text paragraphs
- **Bullet/numbered lists** → automatically detected and formatted

### Step 2: Export as DOCX

Export your document from Word or Google Docs as a .docx file. Place it in the `rawArticles/` folder.

> **Tip:** Ensure your document uses built-in Word styles (Title, Subtitle, Heading 1-3, Body) rather than manually formatting text. The converter relies on these styles to produce correct Markdown headings and structure.

### Step 3: Run the Import Script

```
bash
# Batch import — processes all .docx files in rawArticles/
npm run importDocx
```

This will:

1. Scan `rawArticles/` for .docx files
2. For each **new** file (one whose slug folder does not already contain an Article.md):
   - Convert it to structured Markdown using the DOCX converter
   - Extract embedded images and save them into the article folder
   - Generate `public/articles/<slug>/Article.md` with YAML frontmatter and TODO notes
3. Skip files that have already been imported (idempotent)

### Step 4: Review and Tweak

The conversion script generates an Article.md file with a **TODO** footer at the bottom. Review each item:

1. **Frontmatter values** — Check slug, title, date, excerpt are correct. The script extracts these from DOCX styles, but manual verification is recommended.
2. **Cover image** — Verify the cover image reference in frontmatter matches your intended banner.
3. **Inline images** — If images were embedded in the source DOCX, they will be extracted into the article folder automatically. Otherwise, you will need to manually save them from your source document.
4. **Links** — Check for any links that may not have converted correctly and fix as needed.
5. **Heading structure** — Verify that headings (## Section Title) match your intended outline.

### Step 5: Build and Deploy

```
bash
npm run build
```

This builds the site and generates `articles-manifest.json` which the listing page uses to discover all articles.
## CLI Reference (Advanced)

If you need more control, you can call the converter directly:

___CODEFENCE___
bash
# Convert a specific DOCX with all options
node scripts/convert-docx-to-markdown.mjs \
  --input rawArticles/my-article.docx \
  --output ./public/articles/my-article-slug/ \
  --title "My Article Title" \
  --date 2026-09-15 \
  --excerpt "A short description." \
  --extract-images

# Skip interactive prompts (use defaults)
node scripts/convert-docx-to-markdown.mjs \
  --input rawArticles/my-article.docx \
  --output ./public/articles/my-article-slug/ \
  --skip-prompts \
  --title "My Article" \
  --date 2026-09-15

# Verbose output with diagnostics
node scripts/convert-docx-to-markdown.mjs \
  --input rawArticles/my-article.docx \
  --output ./public/articles/my-article-slug/ \
  --verbose
___CODEFENCE___

### Available Flags

| Flag | Description |
|---|---|
| `--input` | Source .docx file (required) |
| `--output` | Output directory (creates folder + Article.md) |
| `--title` | Article display title |
| `--date` | ISO date (YYYY-MM-DD) |
| `--excerpt` | Short description |
| `--slug` | URL slug |
| `--extract-images` | Extract embedded DOCX images into the article folder |
| `--skip-prompts` | Skip interactive prompts (use defaults) |
| `--verbose` | Print extra diagnostics |

## What Gets Generated

After running the conversion script, you will have:

1. **Article.md** — Markdown content with YAML frontmatter and a TODO footer
2. **(Optional)** Embedded images extracted into the same folder (if `--extract-images`)
3. **Automatic inclusion** in the site article listing via articles-manifest.json (generated at build time)

The site then:
- Lists the article on /articles with title, date, and excerpt
- Renders the full article on /articles/{slug} with images, code blocks, blockquotes, etc.

## Frontmatter Reference

| Field | Required | Notes |
|---|---|---|
| slug | Yes | URL-friendly identifier, lowercase with dashes |
| title | Yes | Display title shown in listing and header |
| date | Yes | ISO 8601 format: YYYY-MM-DD |
| excerpt | No | Short description shown on the articles listing page |
| coverImage | No | Path to an image in the same folder, e.g. ./banner.png |

## Markdown Body Structure

The article body uses standard Markdown rendered by react-markdown. Common patterns:

- **Headings:** ## Section Title, ### Subsection
- **Paragraphs:** plain text with line breaks
- **Images:** ![alt text](./image.jpg) — images must be in the article folder
- **Lists:** - item (unordered), 1. item (ordered)
- **Code blocks:** fenced with triple backticks + language
- **Emphasis:** bold, italic

## What Gets Preserved from DOCX

| DOCX Feature | Markdown Output |
|---|---|
| Title style | # Heading (H1) |
| Subtitle style | Italic subtitle under the H1 |
| Heading 3 style | ## Section Heading (H2 in Markdown) |
| Body paragraphs | Regular Markdown paragraphs |
| Bullet lists | - item with nesting via indentation |
| Numbered lists | 1. item with nesting via indentation |
| Bold text | bold formatting |
| Italic text | italic formatting |
| Code spans | inline code |
| Hyperlinks | [text](url) |
| Embedded images | Extracted and referenced as ![alt](./image.jpg) |

## FAQ

**Q: Do I need to install anything?**
A: No — the conversion scripts use mammoth.js which is already a project dependency. Just run from the project root.

**Q: Can I write Markdown directly instead of converting from DOCX?**
A: Yes! You can author Article.md by hand. Follow the frontmatter format above and use standard Markdown syntax for headings, lists, images, links, code blocks, and blockquotes.

**Q: How do I add inline images?**
A: Place image files in the article folder and reference them with relative paths: ![Description](./section1.jpg)

**Q: What Markdown elements are supported on the site?**
A: Headings (##, ###), paragraphs, bold/italic emphasis, unordered lists (-, *), ordered lists (1.), links, images, code blocks (with syntax highlighting via rehype-highlight), blockquotes (>), and horizontal rules (---).

**Q: Can I have multiple articles?**
A: Absolutely. Each article gets its own folder under public/articles/. The listing page auto-discovers all articles from their frontmatter. No code changes needed for new articles.