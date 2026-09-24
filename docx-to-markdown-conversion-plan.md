# DOCX to Markdown Conversion Plan

## Progress Tracker

| Task | Status | Notes |
|---|---|---|
| 1a. CLI argument parsing | ✅ DONE | `parseArgs()` in convert-docx-to-markdown.mjs:17–63 |
| 1b. Frontmatter collection | ✅ DONE | `interactiveFrontmatter()` in convert-docx-to-markdown.mjs:78–110 |
| 1c. DOCX → HTML conversion | ✅ DONE | `convertDocxToHtml()` — uses mammoth.convertToHtml(), extracts images from data URIs (alt/src extracted independently) |
| 1d. Main traversal pipeline | ✅ DONE | `traverseDocument()` — walks mammoth HTML sequentially with cheerio, classifies h3-divider/h3-heading/title/subtitle/paragraph/list elements |
| 1e. List converter | ✅ DONE | `convertList()` in convert-docx-to-markdown.mjs:289–345, recursive nested list → indented markdown using native DOM APIs; handles Cheerio auto-closed `<p>` (UL/OL siblings), mixed ul/ol nesting, depth-based 2-space indentation; tested with 6 unit tests |
| 1f. Paragraph formatter | ✅ DONE | `paragraphToMarkdown()` in convert-docx-to-markdown.mjs:26–62, regex-based inline HTML→Markdown conversion (bold/italic/code/links); tested with 14 unit tests in test-paragraph-to-markdown.mjs |
| 1i. Title/Subtitle detector | ⬜ TODO | — |
| 1j. Image extractor & writer | ⬜ TODO | — |
| 1k. Markdown emitter | ⬜ TODO | — |
| 1l. CLI entry point / main() | ⬜ TODO | — |
| 2. Create import-docx.mjs orchestrator | ⬜ TODO | — |
| 3. Update package.json | ⬜ TODO | — |
| 4. Validation tests | ⬜ TODO | — |

---

## Overview

This plan describes converting exported .docx article files (from Word, Google Docs, etc.) directly into the site's target Article.md format using the mammoth.js library (already installed in package.json).


**Recommendation:** redefine success for the script as *"produce a clean,
structurally faithful markdown draft"* — correct headings, paragraphs, lists,
bold/italic, and correctly-placed images, with placeholder frontmatter. Content
trimming, header rewording, and metadata authoring become a deliberate manual
pass afterward.

---

## 1. API: mammoth.js Quick Reference

### Core function - convertToHtml()

    const result = await mammoth.convertToHtml({ path: "./file.docx" })
    // result = { value: { values: [...] }, messages: [...] }

The result.value.values array is a flat list of interpreted elements. Each element has a value and optional children. Common element types:

- "paragraph": A paragraph block; children contain inline content
- "unordered-list": ul container; children is an array of list items
- "ordered-list": ol container
- "list-item": An individual li (contains its own paragraphs or nested lists)
- "table": A table element

### Inline types (within a paragraph children)

- "text": Plain text; content holds the string
- "comment": User annotations in Word - usually stripped
- "hyperlink": Links - contains children (paragraph to text)
- "tab": Tab character \\t

### Style mapping

You can map docx paragraph styles to HTML elements via a styleMap option:

    mammoth.convertToHtml(
      { path: "article.docx" },
      { styleMap: ["p[style-name=MyHeading] => h2:fresh", "p[style-name=Code] => pre"] }
    )

The element:type syntax maps a docx style to an HTML element. The :fresh suffix tells mammoth not to collapse consecutive elements of that type.

### Callbacks

- includeContent(element, next): Intercept and transform any element before conversion
- convertImage(innerElement, options): Control how embedded images are rendered
- images.imgElement(callback): Pass a callback to extract each image during conversion

---

## 2. Analysis of DOCX Structure and Mammoth Output

The sample file `rawArticles/farmtotable-iosappwithlocalllms.docx` was analyzed both at the XML level (DOCX internal structure) and via mammoth HTML conversion (`testdocx1.html`). The target output is defined by `onlineresults/farmtotable-iosappwithlocalllms.md`.

### DOCX Internal Style Analysis

| DOCX Style | Count | What it contains |
|---|---|---|
| **Body** | 84 paragraphs | All body text, intro paragraphs, list items, sub-paragraphs |
| **Heading 3** | 7 paragraphs | Tip headings (`1. Write down your plan...`, `2. Keep your work...`, etc.), image-only dividers (h3 wrapping only an img), closing section (`Et - Voila!`) |
| **Title** | 1 paragraph | Article title: "Farm-to-Table: Building an iOS App with Local LLMs" |
| **Subtitle** | 1 paragraph | Subtitle text: "Lessons from the test kitchen" |

### Mammoth HTML Conversion Output (verified)

| Element | Count | Details |
|---|---|---|
| `<h3>` | **7** | All content headings — **mammoth correctly maps DOCX Heading 3 to `<h3>`**. No H1/H2 elements produced. |
| `<p>` | ~85+ | Body paragraphs, Title/Subtitle text (plain `<p>`, NOT mapped to h1/h2 by default) |
| `<img>` | **6** | Base64 data URIs with alt-text: `f-t-tbl-banner.png`, `section1.jpg`–`section5.jpg` |
| `<ul>` | **2** | Setup list (with nested `<ul>`) + Agent config sub-list |
| `<li>` | 13+ | List items including nested ones |
| `<ol>` | **1** | Tips overview ordered list (5 items, each with `<em>` wrapping) |
| `<strong>` | **1** | Bold text in Tip 2's "Example prompt:" block |
| `<em>` | ~40+ | Italic text: model name, tip list items, emphasis |
| `<br/>` | ~9 | Line breaks within paragraphs (double-breaks as separators) |

### CRITICAL FINDING: Mammoth produces `<h3>` for all DOCX Heading 3 elements

**Contrary to the original assumption**, mammoth **does** produce proper `<h3>` tags for all Heading 3 DOCX style elements. These are exactly the article's section headings:

| H3 Index | Mammoth `<h3>` content | Markdown output |
|---|---|---|
| 1 | `[img]` (image-only) | Section divider image — NOT a heading |
| 2 | `1. Write down your plan - and then some` | `## 1. Write down your plan - and then some` |
| 3 | `2. Keep your work bite sized` | `## 2. Keep your work bite sized` |
| 4 | `3. Get to good and go` | `## 3. Get to good and go` |
| 5 | `4. Know when (and be ready) to step in` | `## 4. Know when (and be ready) to step in` |
| 6 | `5. I say patience` | `## 5. I say patience` |
| 7 | `Et - Voila!` | `## Et - Voila!` |

### Title and Subtitle handling

mammoth **does NOT** auto-convert DOCX `Title` and `Subtitle` paragraph styles to `<h1>`/`<h2>`. They come through as plain `<p>` tags. Detection must be content-based (first `<p>` contains banner image + title text; second `<p>` is short subtitle text).

### Section structure mapping: DOCX mammoth → Online Result target

| DOCX content order | Mammoth HTML | Target Markdown (online result) |
|---|---|---|
| Title style paragraph (with banner img) | `<p>[img]Title Text</p>` | `# Title Text` (h1 + subtitle as parenthetical on same line, or separate h2) |
| Subtitle style | `<p>Lessons from the test kitchen</p>` | Included after title |
| Intro paragraphs (Body style) | `<p>...</p>` × several | Body paragraphs with no heading prefix |
| "Before we go any further, here's the TL;DR of my setup:" + `<ul>` with nested `<ul>` | `<p>...setup:</p><ul><li>Hardware...</li><li>LLM Setup<ul>...</ul></li></ul>` | Body text + properly indented list (nested via 2-space indent) |
| "How did I get here..." question | `<p>How did I get here...</p>` | Body paragraph, no heading |
| Tips overview ordered list (`<ol><li><em>...</em></li>`) ×5 | `<ol>` with 5 italic items | Body text + ordered/italic list items, each on its own line |
| H3 `[img]` (section divider) | `<h3><img alt="section1.jpg"...></h3>` | `![Agent config](./section1.jpg)` image reference |
| H3 heading → body paragraphs ×N → next h3 | `<h3>...</h3><p>...</p>` × many → `<h3>...` | `## Heading\n\nParagraphs...\n\n[optional images]\n\n` |

### Image metadata from alt attribute

| alt | Implied filename | Likely role |
|---|---|---|
| f-t-tbl-banner.png | banner.png | Cover image (appears first in document) |
| section1.jpg | section1.jpg | Section divider between intro and Tip 1 |
| section2.jpg | section2.jpg | Section divider within Tip 1 |
| section3.jpg | section3.jpg | Section divider within Tip 2 |
| section4.jpg | section4.jpg | Section divider within Tip 3 |
| section5.jpg | section5.jpg | Section divider within Tip 4 |

### Notes on the online result vs. existing Article.md differences

The online result (`onlineresults/farmtotable-iosappwithlocalllms.md`) is the **faithful** conversion that our script should match. The existing `Article.md` has several manual edits that deviate from the source DOCX:

| Aspect | Online Result (target) | Existing Article.md (manually edited) |
|---|---|---|
| Title rendering | `# Farm-to-Table... Lessons from the test kitchen` (h1 on page) | Only in frontmatter, no h1 on page |
| "Introduction" heading | **Absent** (no such text in DOCX) | Added as `## Introduction` |
| "Setup" heading | **Absent** ("Setup" is Body-style text inside list item) | Added as `## Setup` |
| "Let's talk about tips" | **Absent** (plain text, not a heading in DOCX) | Added as `## Let's talk about tips` |
| Tip headings format | `## 1. Write down your plan - and then some` (numbered from DOCX H3) | `## Tip 1: Write down your plan...` (manually prefixed with "Tip") |
| Agent configuration section | Not present (no h3 subheading for this in DOCX; just body text + nested list) | Added as `## Agent configuration` |
| List formatting | Flat `- item` per bullet line, no bold on keys | Bold keys like `**Hardware:**`, code formatting `` `model-name` `` |
| Tips overview format | Each item italic on its own line (`_1. ..._\n\n_2. ..._`) | Single `- item` bullet list (merged) |
| section4.jpg | section4.jpg | Section divider image |
| section5.jpg | section5.jpg | Section divider image |

### Nested list structure example

The mammoth output for the LLM Setup list preserves nesting correctly:

<ul><li>Hardware...</li><li>LLM Setup<ul><li>VS Code IDE</li><li>Cline</li>...</ul></li></ul>

This needs to become properly indented Markdown with 2-space indent per level.

---

## 3. Target Markdown Format (Article.md)

Every article folder under `public/articles/slug/` must contain an Article.md with this structure:

    ---
    slug: farm-to-table-local-llms
    title: "Farm-to-Table: Building an iOS App with Local LLMs"
    date: 2026-09-15
    excerpt: "Lessons from the test kitchen - ..."
    coverImage: ./banner.png
    ---

    # Farm-to-Table: Building an iOS App with Local LLMs _(<i>Lessons from the test kitchen</i>)_

    I posted a little while ago about...

    Before we go any further, here's the TL;DR of my setup:

    - Macbook Pro 2021 M1 Max, 64GB RAM
      - VS Code IDE
        - Cline
        - Ollama
          - qwen3.6:35b-a3b-q8_0

    _1. Plan ahead with your LLM_

    _2. Give it defined tasks..._

    _3. Set up the right hardware..._

    _4. Know when to step in..._

    _5. Practice patience..._

    ## 1. Write down your plan - and then some

    This is the step where you might argue...

    **Example prompt:** We are working on...

    ![Agent config](./section1.jpg)

    ## 2. Keep your work bite sized

    ...

### Key conventions

| Convention | Detail |
|---|---|
| Title | `# Title text` as h1 (visible on page), subtitle inline with `_italic_` after title on same line |
| Cover image | Referenced in frontmatter as `./banner.png`; first image from docx |
| Inline images | Referenced after the paragraph that introduces them: `![alt](./filename.jpg)` |
| Headings | `## N. Title` for content headings — extracted directly from DOCX Heading 3 → `<h3>` via mammoth |
| Bold text | `**text**` for emphasis (e.g., "Example prompt:") |
| Italic/code | `*italic*` for emphasis; `` `code` `` for code references |
| Lists | `- bullets`, `1. numbers`; nested via 2-space indent per level |
| Body paragraphs | Plain text paragraphs — no headings inserted for content that isn't marked as heading in DOCX |
| TODO markers | Trailing comments for human review after import |

### Section structure reference (faithful to DOCX)

The script should produce output matching `onlineresults/farmtotable-iosappwithlocalllms.md` — a faithful conversion of the DOCX content:

1. Frontmatter
2. `# Title` heading (from Title style `<p>`, with banner image)
3. Inline subtitle `_Subtitle text_` on same line as title or next paragraph
4. Body paragraphs (intro text, TL;DR setup list — no headings)
5. Tips overview: italic numbered items from the DOCX's ordered list (`_1. ..._`)
6. `## 1. Title` through `## 5. Title` — directly from H3 headings → `## text`
7. Section divider images between tips (from img-only `<h3>` tokens)
8. `## Et - Voila!` — closing section
9. TODO note at the bottom

> **Important**: The script must NOT insert artificial headings like "Introduction", "Setup" as `## Setup`, "Let's talk about tips" as `## Let's talk about tips`, or "Agent configuration" as `## Agent configuration`. These were manually added in the existing Article.md but do not exist as Heading 3 elements in the DOCX source.

---

## 4. Architecture: HTML-Based Conversion Strategy

We use `mammoth.convertToHtml()` with a custom image handler to produce an HTML string, then walk that HTML sequentially to classify each element as one of: Title paragraph, Subtitle paragraph, body paragraph, list, content heading (`## text`), or divider image.

### Why HTML parsing (no heuristics)?

Unlike the original assumption, mammoth **does** produce proper `<h3>` tags for all DOCX Heading 3 style elements. The article's section headings are all DOCX Heading 3 and are correctly rendered as `<h3>` by mammoth. No content-based heuristics (regex text patterns, ordered-list scanning) are needed for heading detection.

The only classification needed is:
- `<h3>` containing ONLY an `<img>` → image divider (not a heading)
- `<h3>` containing text → `## heading` output
- Everything else (`<p>`, `<ul>`, `<ol>`) → body content

The Title and Subtitle styles come as plain `<p>` tags, so those require simple content-based detection (first `<p>` with banner image = Title; second short `<p>` = Subtitle).

### Conversion pipeline overview

    DOCX file (rawArticles/*.docx)
        |
        v
    [1] mammoth.convertToHtml() --> HTML string + extracted images
            Custom image handler captures each image with alt-text, MIME type, base64
            No styleMap needed — all H3 headings auto-produced by mammoth
        |
        +-----> [2a] Title/Subtitle detector (Task 1i)
                 Scan first <p> for banner img → Title; second short <p> → Subtitle
        |
        +-----> [2b] Main traversal (Task 1d)
                 Walk HTML sequentially: classify each element as paragraph/list/h3-heading/h3-divider
        |
        +-----> [2c] Content formatting (Tasks 1f, 1e)
                 Convert paragraphs to markdown text; convert lists to indented markdown
        |
        +-----> [2d] Markdown generation
                 Assemble frontmatter → Title/Subtitle → sections with headings, paragraphs, images
        |
        v
    [3] Frontmatter collection (interactive or CLI args)
        |
        v
    Article.md (public/articles/slug/)

---

## 5. Implementation Tasks

### Task 1: Create scripts/convert-docx-to-markdown.mjs

Purpose: Standalone CLI tool (mirrors convert-pdf-to-markdown.mjs API) that converts a .docx file to Article.md.

**CLI interface** (must be compatible with the batch orchestrator):

    node scripts/convert-docx-to-markdown.mjs \\
      --input ./rawArticles/article.docx \\
      --output ./public/articles/slug \\
      --title "Article Title" \\
      --date 2026-09-23 \\
      --slug article-slug \\
      --skip-prompts

Interactive mode (no --skip-prompts):

    node scripts/convert-docx-to-markdown.mjs --input ./rawArticles/article.docx

**Flags**: Same as the PDF converter for consistency:

| Flag | Description |
|---|---|
| --input | Source .docx file path (required) |
| --output | Output directory (creates folder + Article.md) |
| --title | Article title |
| --date | ISO date YYYY-MM-DD |
| --excerpt | Short description |
| --slug | URL slug |
| --skip-prompts | Use defaults / non-interactive mode |
| --verbose | Print diagnostic information |

#### 1a. CLI argument parsing ~~DONE~~ ✅

Copy/replicate the parseArgs() function from convert-pdf-to-markdown.mjs. Same signature and behavior.

**Deliverable**: `parseArgs(argv)` → `{ verbose, input, output, title, date, excerpt, slug, skipPrompts }`.

**Status: COMPLETED** — Implemented in `scripts/convert-docx-to-markdown.mjs` lines 17–63. Handles boolean flags, key-value flags (space and `=` syntax), and positional arguments. Returns all required fields.

#### 1b. Frontmatter collection (interactive or from args) ~~DONE~~ ✅

Replicate interactiveFrontmatter() from the PDF converter. Identical flow: collect slug, title, date, excerpt, coverImage. Use defaults when --skip-prompts is set. The coverImage should default to the first image extracted by Task 1c (the banner).

**Deliverable**: `collectFrontmatter(flags)` → `{ title, slug, date, excerpt, coverImage }`.

**Status: COMPLETED** — Implemented in `scripts/convert-docx-to-markdown.mjs` lines 78–110 as `interactiveFrontmatter(title, slug, date, excerpt)`. Collects all five fields interactively; uses argument defaults for pre-supplied values. Includes `slugifyTitle()` helper and `createPrompter()` with readline interface.

#### 1c. DOCX → HTML conversion + inline image extraction

Use mammoth's public API: `convertToHtml()` with a custom image handler. The return value is an **HTML string**.

**Important**: No `styleMap` is needed. Mammoth automatically maps standard DOCX heading styles (`Heading 1`, `Heading 2`, `Heading 3`) to `<h1>`, `<h2>`, `<h3>` respectively. For this article, all section headings use `Heading 3` and are correctly produced as `<h3>` tags — no custom mapping required. The `Title` and `Subtitle` styles do NOT auto-map to `<h1>`/`<h2>`; they remain as plain `<p>` tags, which we detect via content heuristics in Task 1d.

```js
import mammoth from "mammoth"
import { readFile } from "fs/promises"

const docxBuffer = await readFile(inputPath)
const extractedImages = []  // [{ alt, mimeType, base64 }]

const result = await mammoth.convertToHtml({ buffer: docxBuffer }, {
  convertImage: mammoth.images.imgElement(function(image) {
    return image.readAsBase64String().then(function(base64) {
      extractedImages.push({ alt: image.altText, mimeType: image.contentType, base64 })
      return { src: "data:" + image.contentType + ";base64," + base64 }
    })
  })
})

if (result.messages.length > 0) console.warn("Mammoth messages:", result.messages)
// result.value is an HTML string — parsed in Task 1d
```

Key points:
- No styleMap needed. All H3 headings from DOCX are produced as `<h3>` by mammoth automatically.
- Images are extracted into `extractedImages[]` array during conversion — single pass (not two-pass).
- The HTML string contains all content: `<p>` tags (Body, Title, Subtitle styles), `<h3>` tags (Heading 3 style = section headings + dividers), lists (`<ul>`, `<ol>`), images as base64 data URIs.

**Deliverable**: Function `convertDocxToHtml(docxPath)` returns `{ html, images: [{ alt, mimeType, base64 }] }`.

**Status: COMPLETED** — Implemented in `scripts/convert-docx-to-markdown.mjs` lines 230–281. Uses mammoth.convertToHtml() with custom image handler. Images extracted into `extractedImages[]` array during a single pass. The HTML string contains all content: `<p>` tags (Body, Title, Subtitle styles), `<h3>` tags (Heading 3 style = section headings + dividers), lists (`<ul>`, `<ol>`), and images as base64 data URIs. Handles both `src="..." alt="..."` and `alt="..." src="..."` attribute orderings.

#### 1d. Main traversal pipeline

Assemble all handlers (Tasks 1e, 1f, and 1i) into a single coordinator function that walks the HTML sequentially:

```js
async function traverseDocument(html, images) {
  const sections = []       // [{ heading?: string, items: [...]}]
  let currentSection = null
  
  function pushCurrent() {
    if (currentSection && currentSection.items.length > 0) {
      sections.push(currentSection)
    }
    currentSection = { heading: null, items: [] }
  }
  
  // Iterate through HTML elements sequentially
  const tokenizer = tokenizeHtml(html) // breaks HTML into element tokens
  
  for (const el of tokenizer) {
    if (el.tagName === "h3") {
      if (isImageOnlyH3(el)) {
        currentSection.items.push({ type: "divider", imageAlt: getH3ImgAlt(el) })
      } else {
        pushCurrent()
        const text = stripHtmlTags(el.innerHTML).trim()
        currentSection.heading = text
      }
    } else if (el.tagName === "p") {
      // Check if this is Title/Subtitle paragraph
      if (!foundTitle && hasImage(el)) {
        currentSection.items.push({ type: "title", imageAlt: getImgAlt(el) })
        foundTitle = true
      } else if (!foundSubtitle && isShortText(el.innerHTML)) {
        currentSection.items.push({ type: "subtitle", text: stripHtmlTags(el.innerHTML) })
        foundSubtitle = true
      } else {
        currentSection.items.push({ type: "paragraph", content: paragraphToMarkdown(el.innerHTML) })
      }
    } else if (el.tagName === "ul" || el.tagName === "ol") {
      currentSection.items.push({ type: "list", markdown: convertList(el, 0) })
    }
  }
  
  pushCurrent() // flush last section
  
  return { sections, extractedImages: images }
}
```

**Deliverable**: `traverseDocument(html, images)` -> `{ sections, extractedImages }`.

**Status: COMPLETED** — Implemented in `scripts/convert-docx-to-markdown.mjs` lines 283–417. Walks mammoth HTML sequentially with cheerio, classifying elements into title/subtitle/body-paragraph/list-divider (h3-image-only) / h3-heading based on content analysis. Correctly identifies all 6 section headings (`## N.` format) and separates image dividers from regular `<h3>` text headings. The `stripHtmlTags()` helper prevents cheerio from misinterpreting plain text as CSS selectors. Handles the "et-volia" edge case where `&` is HTML-encoded.

---

#### 1e. List converter (nested list → indented markdown)

Convert nested HTML `<ul>/<ol>` structures to properly indented Markdown lists using recursive depth tracking. Handles the Setup list with its LLM Setup sub-list, and the Tips overview ordered list:

```js
function convertList(listEl, depth) {
  const isOrdered = listEl.tagName === "OL"
  let md = ""
  for (const item of listEl.children) {
    if (item.tagName !== "LI") continue
    const firstPara = item.querySelector("p")
    const text = firstPara ? paragraphToMarkdown(firstPara.innerHTML) : ""
    const prefix = isOrdered ? `${count}. ` : "- "
    md += ("  ".repeat(depth)) + prefix + text + "\n"
    for (const nl of item.querySelectorAll("ul, ol")) {
      md += convertList(nl, depth + 1)
    }
  }
  return md.trimEnd()
}
```

Example Setup list output:

    - Macbook Pro 2021 M1 Max, 64GB RAM
    - LLM Setup
      - VS Code IDE
      - Cline
      - Ollama running the models
      - qwen3.6:35b-a3b-q8_0

**Deliverable**: `convertList(listElement)` -> indented markdown string.

---

#### 1f. Paragraph content formatter

Convert HTML paragraph content to Markdown text, preserving inline formatting:
- `<strong>` / `<b>` -> `**bold**`
- `<em>` / `<i>` -> `*italic*`
- `<code>` or inline monospace style -> backtick code
- `<a href="...">text</a>` -> `[text](url)`
- Multiple spaces/line breaks collapsed to single space

Helper function:

```js
function paragraphToMarkdown(htmlParagraph) {
  // Extract text and apply inline transformations
  // Handle bold, italic, code, links, tabs
}
```

**Deliverable**: `formatParagraph(html)` -> `{ type: "paragraph", content: string }`.

---

#### 1i. Title/Subtitle detector

Detect the Title and Subtitle paragraphs from mammoth output (they appear as plain `<p>` tags, not h1/h2):

- **Title**: The first `<p>` in the document that contains both an `<img>` tag AND text content. Extracts the title text (excluding the image) and the banner image alt-text.
- **Subtitle**: The second distinct `<p>` paragraph — typically short (under ~50 chars) with no images.

Output tokens:
- `{ type: "title", text, imageAlt }` → emitted as `# {text}` in markdown
- `{ type: "subtitle", text }` → appended after title as `_({text})_` inline or separate paragraph

**Deliverable**: Function `detectTitleSubtitle(html)` → `{ title, subtitle } | null`.

---

#### 1j. Image extractor & writer

The main conversion (Task 1c) already extracts images into the `extractedImages[]` array via the `imgElement` callback. Task 1j handles:
1. Deduplicating images (same base64 content appearing multiple times).
2. Assigning filenames: first image → `banner.png`; rest → `sectionN.jpg` based on alt-text pattern or sequential ordering.
3. Writing each image to the output folder and returning `{ filename, path }` metadata.

```js
async function writeExtractedImages(images, outputDir) {
  const written = []
  for (let i = 0; i < images.length; i++) {
    let filename
    if (i === 0) {
      // First image is always the banner
      filename = `banner.${images[i].mimeType.split('/')[1] || 'png'}`
    } else {
      const altMatch = images[i].alt?.match(/section(\d+)\./)
      if (altMatch) {
        filename = `section${altMatch[1]}.jpg`
      } else {
        filename = `image-${i}.${images[i].mimeType.split('/')[1] || 'jpg'}`
      }
    }
    while (written.some(w => w.filename === filename)) {
      filename = `${filename}-copy`
    }
    const fullPath = join(outputDir, filename)
    await writeFile(fullPath, Buffer.from(img.base64, "base64"))
    written.push({ filename, originalAlt: img.alt })
  }
  return written
}
```

**Deliverable**: `writeExtractedImages(images, outputDir)` -> `{ filename, path }[]` array.

---

#### 1k. Markdown emitter with TODO notes

Assemble frontmatter + body sections into final Article.md:

```js
function generateMarkdown(frontmatter, sections, imageMap) {
  let md = "---\n"
  for (const [k, v] of Object.entries(frontmatter)) {
    md += `${k}: ${JSON.stringify(v)}\n`
  }
  md += "---\n\n"
  
  // Add Title heading (from Task 1i detection)
  if (frontmatter.title) {
    md += `# ${frontmatter.title}\n\n`
    if (frontmatter.subtitle) {
      md += `_(${frontmatter.subtitle})_\n\n`
    }
  }
  
  for (const section of sections) {
    if (section.heading) md += "## " + section.heading + "\n\n"
    for (const item of section.items) {
      if (item.type === "paragraph") md += item.content + "\n\n"
      else if (item.type === "list") md += item.content + "\n\n"
      else if (item.type === "divider") {
        const img = imageMap.find(w => w.filename === getImageName(item.imageAlt))
        md += `\n![${item.imageAlt}](./${img?.filename || 'unknown.jpg'})\n\n`
      }
    }
  }
  
  return md + generateTodoNotes()
}
```

The `generateTodoNotes()` function produces the same TODO block used by convert-pdf-to-markdown.mjs (see ~line 200 of that file) to prompt manual review.

**Deliverable**: `generateMarkdown(frontmatter, sections, imageMap)` -> final Article.md string.

---

#### 1l. CLI entry point / main()

Mirror the structure of convert-pdf-to-markdown.mjs main():
1. Parse args (Task 1a)
2. Collect frontmatter - interactive or from flags (Task 1b)
3. Convert DOCX to HTML + extract images (Task 1c)
4. Detect Title/Subtitle (Task 1i) — needed for frontmatter coverImage and title rendering
5. Write extracted images to disk (Task 1j)
6. Traverse document structure (Task 1d)
7. Generate Article.md (Task 1k)
8. Print summary: number of headings found, paragraphs, lists, images written

**Deliverable**: `main()` - the full end-to-end pipeline wired together.

The main conversion (Task 1c) already extracts images into the `extractedImages[]` array via the `imgElement` callback. Task 1k handles:
1. Deduplicating images (same base64 content appearing multiple times).
2. Assigning sequential filenames if alt-text is missing or invalid (e.g., `image-1.jpg`, `image-2.png`).
3. Writing each image to the output folder and returning `{ filename, path }` metadata.

```js
async function writeExtractedImages(images, outputDir) {
  const written = []
  for (const img of images) {
    let filename = slugify(img.alt || `image-${written.length + 1}`)
    while (written.some(w => w.filename === filename)) {
      filename = `${filename}-copy`
    }
    const fullPath = join(outputDir, filename)
    await writeFile(fullPath, Buffer.from(img.base64, "base64"))
    written.push({ filename, originalAlt: img.alt })
  }
  return written
}
```

**Deliverable**: `writeExtractedImages(images, outputDir)` -> `{ filename, path }[]` array.

### Task 2: Create scripts/import-docx.mjs

A new batch orchestrator mirroring `import-articles.mjs` but specialized for .docx files only:

| Feature | import-docx.mjs (new) | import-articles.mjs (existing PDF) |
|---|---|---|
| File filter | `.docx` only | `.pdf` only |
| Converts via | `convert-docx-to-markdown.mjs` | `convert-pdf-to-markdown.mjs` |
| Spawns process | Same spawn pattern with `--skip-prompts` | Same |
| Tracks imported | Same `.imported.json` lock file | Same |
| Build step | Runs `npm run build` on success | Runs `npm run build` on success |

**Why separate, not merged?** Isolation during experimentation. If the DOCX pipeline has issues we can debug without touching the working PDF pipeline. Once DOCX is proven reliable and supersedes PDF, we can either merge them or sunset the PDF pipeline cleanly.

### Task 3: Update package.json scripts

Add a new entry to trigger the DOCX import pipeline:

    "scripts": {
      "importArticles": "node scripts/import-articles.mjs",        ← Existing (PDF)
      "importDocx": "node scripts/import-docx.mjs"                 ← NEW
    }

Usage: `npm run importDocx` — runs the same flow as `npm run importArticles` but for .docx files only.

### Task 4: Tests / Validation

| Test | Description |
|---|---|
| Round-trip on sample docx | Run convert-docx-to-markdown.mjs on farmtotable-iosappwithlocalllms.docx, compare output to `onlineresults/farmtotable-iosappwithlocalllms.md` — verify headings (## 1. Title...), lists, images match the online target format |
| Heading detection accuracy | All 7 H3 elements from mammoth produce correct output: 5 content headings (`## N.`), 1 closing heading (`## Et - Voila!`), 1 image divider — no missing or extra headings |
| Image extraction count | All 6 images should be written: `banner.png` + 5× `section*.jpg` |
| Nested list indentation | The Setup list's LLM Setup sub-list must have correct 2-space indent for VS Code IDE, Cline, Ollama, model items |
| Inline formatting preservation | Bold (`**Example prompt:**`), italic (*qwen3.6...* in setup list; _1. Plan ahead..._ in tips overview) survive conversion |
| Title/Subtitle rendering | `# Farm-to-Table...` h1 heading rendered from first `<p>` with banner image; subtitle on same line or adjacent paragraph |
| No artificial headings | Output does NOT contain `## Introduction`, `## Setup`, `## Let's talk about tips`, or `## Agent configuration` — these were not in DOCX Heading 3 style |
| Batch mode (skip-prompts) | Script runs non-interactively with `--skip-prompts --slug ... --title ...` |
| Interactive mode | Prompt flow matches existing PDF converter's UX |

---

## 6. Challenge Matrix & Mitigations

| Challenge | Severity | Mitigation |
|---|---|---|
| **Title/Subtitle not auto-mapped** — mammoth does NOT convert `Title`/`Subtitle` DOCX paragraph styles to `<h1>`/`<h2>`. They appear as plain `<p>` tags. | Medium | Detect first `<p>` containing the banner image (Title style) and second short `<p>` (Subtitle style) via content heuristics in Task 1i. Output as `# Title Text` with subtitle inline. |
| **Nested lists** — Word's indented bullet points become nested `<ul>` elements; must map to indented Markdown. | Medium | Recursive `convertList()` function (Task 1e) that tracks depth and produces proper 2-space indentation for sub-items. The Setup list has a verified nested `<ul>` inside "LLM Setup". |
| **Images as base64 data URIs** — extracting images from mammoth's convertToHtml output requires a custom callback. | Medium | Use `mammoth.images.imgElement()` callback during conversion (Task 1c) to capture each image with alt-text, MIME type, and base64 in a single pass. Naming: first → `banner.png`, rest → `sectionN.jpg`. |
| **Inline formatting** — `<em>` for italics, `<strong>` for bold must become `*italic*` / `**bold**` in Markdown. | Low | The paragraph formatter (Task 1f) handles all inline elements: em→*, strong→**, code→backticks, links→[text](url). |
| **Section dividers vs content headings** — both are `<h3>`, but only those containing ONLY an `<img>` are dividers. | Low | The main traversal pipeline (Task 1d) detects `<h3>` children: img-only → divider token; any text → heading output `## text`. No separate task needed — logic is inline in the traversal loop. |
| **"Let's talk about tips" / "Introduction" paragraphs** — these are Body-style plain text, not Heading 3 elements. | None | Remain as plain body text in the output, matching the online result format (no artificial headings inserted). |

---

## 7. Decision Points for Review

### D1: Which conversion approach?
- **A (HTML-parse approach)** — Convert DOCX to HTML via `mammoth.convertToHtml()`, then parse the resulting HTML string with lightweight DOM parsing/tokenization. All section headings are produced as `<h3>` by mammoth from DOCX Heading 3 style, so no content-based heuristics for heading detection are needed — only simple classification of `<h3>` as heading vs divider (img-only check).
- **B (Internal mammoth AST)** — Access mammoth's internal document tree via undocumented `mammoth/lib/documents.js`. More precise but relies on a non-public API that could break between versions.

**DECISION: A (HTML-parse approach).** Using `convertToHtml()` with a custom image handler gives us all the content we need. The HTML output contains `<h3>` tags for all section headings (from DOCX Heading 3), plain `<p>` paragraphs for body/Title/Subtitle, proper list structures (`<ul>`, `<ol>`, nested), and inline formatting (`<em>`, `<strong>`). The only distinction needed is img-only `<h3>` dividers vs text `<h3>` content headings — no complex heuristics.

### D2: Integration with existing PDF pipeline?
Should .docx files be auto-discovered by the existing npm run importArticles command, or should there be a separate entry point (npm run importDocx)?

**DECISION:** Separate entry point (`npm run importDocx`). If DOCX proves successful and supersedes PDF as the preferred source format, we can sunset the old PDF pipeline later. This keeps both pipelines isolated during the experimental phase, avoiding breakage of existing workflows. The conversion script `convert-docx-to-markdown.mjs` is shared between both; only the batch orchestrator differs.

### D3: How to handle the "Introduction" section that exists in Article.md but is NOT present in the docx at all?
The existing Article.md has an explicit ## Introduction heading with body text, but this heading does not appear anywhere in the docx source. It was manually added after a previous import.

**DECISION: Accept the gap.** The converter will not produce it, nor will it inject or prompt about missing sections. Any content that doesn't exist in the source document should be added by hand after import — the same treatment given to cover images and other manual refinements. This aligns with the guiding principle of faithful migration: **migrate what exists, don't invent what doesn't.**

---

## 8. File Structure After Implementation

    docx-to-markdown-conversion-plan.md          ← This plan document
    scripts/
    ├── import-articles.mjs                       ← Existing PDF pipeline (unchanged)
    ├── import-docx.mjs                           ← NEW: batch orchestrator for .docx files
    ├── convert-pdf-to-markdown.mjs               ← Existing (unchanged)
    └── convert-docx-to-markdown.mjs              ← NEW: docx to Article.md conversion
    
    public/articles/
    ├── farm-to-table-local-llms/                 ← Existing manual version
    │   ├── Article.md
    │   └── ...images...
    └── new-article-slug/
        ├── Article.md                            ← Generated by docx converter
        └── ...extracted images...
    
    rawArticles/
    ├── farmtotable-iosappwithlocalllms.docx      ← Source docx file (will be removed after import)
    └── farmtotable-iosappwithlocalllms.pdf       ← Existing PDF (unchanged)

---

## 9. Estimated Implementation Effort

### Granular sub-task breakdown for Task 1 (convert-docx-to-markdown.mjs)

Each sub-task below is designed to be small enough for a single agent session (~30-90 min each).

| Sub-task | Complexity | Description | Depends On | Status |
|---|---|---|---|---|
| **1a.** CLI argument parsing | Trivial | Copy parseArgs() from PDF converter | — | ✅ DONE |
| **1b.** Frontmatter collection | Low | Replicate interactiveFrontmatter() from PDF converter | 1a | ✅ DONE |
| **1c.** DOCX → HTML conversion | Medium | Set up `convertToHtml()` with custom image handler. No styleMap needed (H3 headings auto-mapped). | 1a, 1b |
| **1d.** Main traversal pipeline | Medium | Walk HTML tokens: Title `<p>`, Subtitle `<p>`, body `<p>`s, lists, `<h3>` headings (text → `## N.`) and dividers (`<h3 img>` → divider tokens). Uses handlers from Tasks 1e–1i. | 1c |
| **1e.** List converter | Medium | Recursive nested list → indented markdown (handles Setup list + Tips overview ordered list) | 1d |
| **1f.** Paragraph formatter | Medium | Convert HTML paragraph → markdown with inline formatting (`<em>`→`*`, `<strong>`→`**`, code, links) | 1d |
| **1i.** Title/Subtitle detector | Low | First `<p>` with banner image → title; second short `<p>` → subtitle. Output as `# Title` and inline italic | 1c, 1d |
| **1j.** Image extractor & writer | Small | Deduplicate, name (banner.png for first, sectionN.jpg for rest), write extracted images to disk | 1c |
| **1k.** Markdown emitter | Low | Assemble frontmatter + Title/Subtitle → sections with headings, paragraphs, lists, images | 1d-1i, 1j |
| **1l.** CLI entry point / main() | Medium | Wire the full pipeline together end-to-end | All above |

> **Note**: This plan replaces the original content-based heuristics (which tried to detect "Setup" labels and "Tip N" headings from paragraph text) with a simpler architecture: mammoth correctly produces `<h3>` tags for all DOCX Heading 3 elements. The converter distinguishes heading vs. divider `<h3>` elements by checking for `<img>` child nodes, eliminating all content-based parsing heuristics.

### Top-level task summary

| Task | Complexity | Notes |
|---|---|---|
| Task 1: Core converter (1a–1l) | **Medium** | Decomposed into 10 focused sub-tasks; significantly simplified from original plan — no content heuristics needed for headings since mammoth produces all `<h3>` correctly. H3 heading and divider logic merged into the main traversal pipeline (Task 1d). |
| Task 2: Create import-docx.mjs orchestrator | **Low** | Replicate import-articles.mjs structure, filter for .docx only |
| Task 3: Update package.json (npm run importDocx) | **Trivial** | Single entry in scripts section |
| Task 4: Validation tests | **Medium** | Round-trip comparison against existing Article.md is the key test — but target format now matches `onlineresults/` (faithful DOCX conversion), not the manually-edited `Article.md` |

---

## 10. Why This Might Be Better Than PDF Conversion

| Aspect | PDF (current) | DOCX (proposed) |
|---|---|---|
| **Heading detection** | Regex heuristics on raw text — fragile, requires manual pattern tuning per article | Structured style metadata in AST — more reliable, but still needs heuristics for non-standard docs |
| **List preservation** | Bullet characters must be detected and parsed from plain text | Native ul/ol/li structure — perfect fidelity |
| **Image extraction** | Must scan PDF binary for image streams — complex, format-dependent | Base64 data URIs directly accessible — simple, deterministic |
| **Inline formatting** | Lost in PDF text extraction; must reconstruct from font heuristics | Native strong/em tags preserved in AST |
| **Document structure** | Flattened text stream with no semantic information | Rich DOM tree with paragraph types, lists, tables, images, style names |
| **Source fidelity** | PDF is a rendered format — structural info is degraded | DOCX is the source format — preserves all semantic markup from Word/Google Docs |

The strongest argument for DOCX: it's the **native document format**. The author writes in Word (or Google Docs), exports as PDF (losing structure), and we try to reconstruct what was already there. Going straight from DOCX means we get the original paragraph styles, list structures, and image references without the lossy PDF conversion layer.

The main counter-argument: most documents are already being exported as PDF first. If your workflow is "write docx -> export PDF -> import", then DOCX import saves one step. If you're writing directly in Word and can skip the PDF export entirely, it's a clear win.
