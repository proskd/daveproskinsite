# DOCX to Markdown Conversion Plan

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
- images.imgElement(element): Callback for image element extraction

### AST via documents() - RECOMMENDED APPROACH

    import { documents } from "mammoth"
    const result = await documents(docxBuffer)
    // result.value is a DOM tree with types like document, paragraph, list-item

This returns a structured tree (not HTML) that lets us inspect style names, image references, and nesting directly.

---

## 2. Analysis of Current Test Output (testdocx1.html)

The sample file rawArticles/farmtotable-iosappwithlocalllms.docx was converted via mammoth to testdocx1.html. Key findings:

### Element counts in the HTML output

- ~78 <p> (paragraphs) - most body content; many section titles are plain p tags, NOT headings
- 14 <h3> - used for SECTION IMAGE MARKERS between paragraphs, not actual article headings
- 6 <img> - embedded as base64 data URIs; alt attribute contains original filename (banner.png, section1.jpg, etc.)
- 6 <ul>, 26 <li> - unordered lists including nested lists (Word indented sub-items become inner ul)
- 2 <ol> - ordered lists (5-item tip summary)
- 2 <strong> - bold text fragments
- 12 <em> - italic text (model names, list titles, emphasis)
- 9 <br/> - line breaks (double-breaks used as paragraph separators)

### CRITICAL FINDING: Missing headings

Several sections that exist as proper ## Heading 2 elements in the target Article.md are NOT produced as heading tags by mammoth. They appear as plain text before/after paragraphs or lists:

| Should be Markdown | In mammoth HTML - Actual form |
| Introduction (heading) | Not present - no Introduction text at all in docx |
| ## Setup | Plain text "Setup" immediately before a ul |
| ## Lets talk about tips | Not found in the HTML output at all |
| ## Tip 1 through Tip 5 | Text only inside an em-wrapped li within an ordered list |

Root cause: The docx file uses non-standard styling for these sections. Word likely treats them as styled paragraphs with custom formatting, or as manually typed text, rather than applying built-in Heading 1/2/3 styles that mammoth maps to HTML heading tags.

### Image metadata from alt attribute

| alt | Implied filename | Likely role |
| f-t-tbl-banner.png | banner.png | Cover image (appears first in document) |
| section1.jpg | section1.jpg | Section divider image |
| section2.jpg | section2.jpg | Section divider image |
| section3.jpg | section3.jpg | Section divider image |
| section4.jpg | section4.jpg | Section divider image |
| section5.jpg | section5.jpg | Section divider image |

### Nested list structure example

The mammoth output for the LLM Setup list preserves nesting correctly:

<ul><li>Hardware...</li><li>LLM Setup<ul><li>VS Code IDE</li><li>Cline</li>...</ul></li></ul>

This needs to become properly indented Markdown with 2-space indent per level.

---

## 3. Target Markdown Format (Article.md)

Every article folder under public/articles/slug/ must contain an Article.md with this structure:

    ---
    slug: farm-to-table-local-llms
    title: "Farm-to-Table: Building an iOS App with Local LLMs"
    date: 2026-09-15
    excerpt: "Lessons from the test kitchen - ..."
    coverImage: ./banner.png
    ---

    ## Introduction

    I posted a little while ago about...

    ## Setup

    Before we go any further, here's the TL;DR of my setup:

    - **Hardware:** Macbook Pro 2021 M1 Max, 64GB RAM
    - **LLM Setup**
      - VS Code IDE
      - ...

    ## Tip 1: Write down your plan - and then some

    This is the step where you might argue...

    ![Agent config](./section1.jpg)

### Key conventions

| Convention | Detail |
|---|---|
| Headings | ## for main sections (no deeper than H3 needed currently) |
| Cover image | Referenced in frontmatter as ./banner.png; first image from docx |
| Inline images | Referenced after the paragraph that introduces them: ![alt](./filename.jpg) |
| Bold text | **text** for emphasis; keys in lists like **Hardware:** |
| Italic/code | `code` for code references, *italic* for emphasis |
| Lists | - bullets, 1. numbers; nested via 2-space indent per level |
| TODO markers | Trailing comments for human review after import |

---

## 4. Architecture: AST-Based Conversion Strategy

We work directly with mammoth's interpreted DOM via `mammoth.documents(docxBuffer)` to get structured data, then write a custom Markdown emitter.

### Why AST over HTML parsing?

The critical issue from section 2 is that many sections that should be headings are NOT heading tags in the HTML output. They appear as plain text or inside list items. Parsing HTML would not solve this problem - we need access to paragraph content and position, which the AST provides directly.

### Conversion pipeline overview

    DOCX file (rawArticles/*.docx)
        |
        v
    [1] mammoth.documents() --> Interpreted DOM tree
        |
        +-----> [2a] Image extraction pass (via images.docx callback)
        |         Write base64 images to output folder
        |
        +-----> [2b] AST traversal & heading detection
        |         Identify sections, build section structure
        |
        +-----> [2c] Markdown generation
        |         Convert paragraphs, lists, images to md syntax
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

#### 1a. CLI argument parsing

Copy/replicate the parseArgs() function from convert-pdf-to-markdown.mjs. Same signature and behavior.

#### 1b. Frontmatter collection (interactive or from args)

Replicate interactiveFrontmatter() from the PDF converter. Identical flow: collect slug, title, date, excerpt, coverImage. Use defaults when --skip-prompts is set.

The coverImage should default to the first image extracted from the docx (the banner).

#### 1c. DOCX AST extraction

    import { documents } from "mammoth"
    import { readFile } from "fs/promises"

    const docxBuffer = await readFile(inputPath)
    const result = await documents(docxBuffer)
    if (result.messages.length > 0) console.warn("Mammoth messages:", result.messages)
    const document = result.value  // DOM tree

#### 1d. Document structure analyzer / heading detector

This is the **core intelligence** of the converter. Since mammoth doesn't reliably produce heading tags, we need heuristics to identify section boundaries:

| Heuristic | Detection rule | Markdown output |
|---|---|---|
| Banner/title area | First p containing img element + text after it --> title extraction | Frontmatter title, coverImage = first image filename from alt |
| Setup label | Paragraph containing ONLY "Setup" (case-insensitive) before a ul | ## Setup |
| Numbered tips in ordered list | Ordered list items matching /^tip\\s*\\d/i and italicized (em) | Convert to ## Tip N: title headings |
| Section divider images | h3 elements containing ONLY an img --> section markers | Extract filename, produce ![alt](./filename.jpg) after preceding paragraph |
| Default body text | Any other paragraph | Regular p in markdown |

Implementation: Iterative traversal over paragraphs and lists. Push sections when a heading candidate is found (emit previous section, start new one). Otherwise append content to current section.

#### 1e. List flattener / indentor

Convert nested ul/ol structures to properly indented Markdown lists using recursive depth tracking:

    function convertList(listEl, depth) {
      const isOrdered = listEl.type === "ordered-list"
      let md = ""
      for (const item of listEl.children) {
        if (item.type !== "list-item") continue
        const firstPara = item.children.find(c => c.type === "paragraph")
        const text = firstPara ? extractText(firstPara.children, true) : ""
        const prefix = isOrdered ? index + ". " : "- "
        md += ("  ".repeat(depth)) + prefix + text + "\\n"
        // Recurse into nested lists
        for (const nl of item.children.filter(c => c.type === "unordered-list" || c.type === "ordered-list")) {
          md += convertList(nl, depth + 1)
        }
      }
      return md.trimEnd()
    }

The LLM Setup nested list example:

    - **Hardware:** Macbook Pro 2021 M1 Max, 64GB RAM
    - **LLM Setup**
      - VS Code IDE
      - Cline
      - Ollama running the models
      - Model: `qwen3.6:35b-a3b-q8_0`

#### 1f. Image extractor & writer (TWO-PASS approach)

Use two independent mammoth passes for reliability:

    Pass 1: const docResult = await documents(docxBuffer)       // structure
    Pass 2: const imgResult = await images.docx(docxBuffer)     // images with filenames

For each image, extract the alt attribute as filename (e.g., "banner.png"), decode base64, and write to output folder.

#### 1g. Markdown emitter

Assemble frontmatter + body sections into final Article.md:

    function generateMarkdown(frontmatter, sections) {
      let md = generateFrontmatter(frontmatter) + "\\n\\n"
      for (const section of sections) {
        if (section.heading) md += "## " + section.heading + "\\n\\n"
        for (const item of section.items) {
          if (item.type === "paragraph") md += item.content + "\\n\\n"
          else if (item.type === "list") md += item.content + "\\n\\n"
          else if (item.type === "image") md += "\\n![" + item.alt + "](" + item.path + ")\\n\\n"
        }
      }
      return md + generateTodoNotes()
    }

Append the same TODO block used by convert-pdf-to-markdown.mjs for human review.

#### 1h. CLI entry point / main()

Mirror the structure of convert-pdf-to-markdown.mjs main(): parse args, collect frontmatter (interactive or from flags), call converter pipeline, write Article.md, print summary.

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
| Round-trip on sample docx | Run convert-docx-to-markdown.mjs on farmtotable-iosappwithlocalllms.docx, compare output to existing Article.md - verify headings, lists, images match |
| Heading detection accuracy | Ensure all major sections get proper ## headings (no section starts without one) |
| Image extraction count | All 6 images should be written: banner.png + 5x section*.jpg |
| Nested list indentation | The LLM Setup nested list must have correct 2-space indent for sub-items |
| Inline formatting preservation | Bold, italic, and code references survive the conversion |
| Batch mode (skip-prompts) | Script runs non-interactively with --skip-prompts --slug ... --title ... |
| Interactive mode | Prompt flow matches existing PDF converter's UX |

---

## 6. Challenge Matrix & Mitigations

| Challenge | Severity | Mitigation |
|---|---|---|
| **Missing heading tags** — mammoth does not produce h2/h3 for many sections that should be headings | **High** | AST-based heuristics (section 5.1d): detect section titles by content pattern, numbered tips from ordered lists, standalone labels like "Setup" |
| **Heading order ambiguity** — original docx has tips listed in an ordered list BEFORE the detailed tip sections; these need to become ## Tip 1, ## Tip 2, etc. in body text | Medium | Detect italicized em text inside ordered list items matching /^tip\\s*\\d/i and transform into heading blocks |
| **Nested lists** — Word's indented bullet points become nested ul elements; must map to indented Markdown | Medium | Recursive convertList() function (section 5.1e) that tracks depth and produces proper indentation |
| **Images embedded as base64 in AST** — extracting images from mammoth's interpreted DOM is non-trivial | Medium | Use two passes: documents() for structure AND images.docx() for image extraction with alt filenames |
| **Inline formatting in lists** — e.g., "Model: code>qwen3.6:35b-a3b-q8_0/code> needs backtick rendering inside list items | Low | The extractText() function handles em, strong, and style names that indicate code formatting |
| **Section image placement** — mammoth places section images (section1.jpg, etc.) as h3 containers between paragraphs; need to attach them to preceding content block | Medium | When encountering an h3 containing only an img, move the image into the previous paragraph's item list |
| **Two-document approach** — using both convertToHtml and documents() may produce slightly different results if mammoth's internal state shifts between calls | Low | Read docx buffer once, pass to both functions. Both are deterministic for same input. |

---

## 7. Decision Points for Review

### D1: Which conversion approach?
- **A (AST-based)** — Full control, handles heading detection heuristics cleanly. More code, but mirrors the existing PDF converter's philosophy.
- **B (HTML-parse approach)** — Faster to prototype. Requires an HTML DOM parser (cheerio recommended as new dependency). Less precision over nested structures.

**DECISION: A (AST-based).** We already know headings are unreliable in HTML output, so parsing HTML does not solve our main problem. The AST gives direct access to paragraph content, style names, and element nesting — exactly what we need for heuristics.

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

| Task | Complexity | Notes |
|---|---|---|
| Task 1: Core converter script (1a-1h) | **High** | Heading detection heuristics + AST traversal are the bulk of the work |
| Task 2: Create import-docx.mjs orchestrator | **Low** | Replicate import-articles.mjs structure, filter for .docx only |
| Task 3: Update package.json (npm run importDocx) | **Trivial** | Single entry in scripts section |
| Task 4: Validation tests | **Medium** | Round-trip comparison against existing Article.md is the key test |

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
