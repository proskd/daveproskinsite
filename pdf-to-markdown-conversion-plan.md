# PDF → Markdown Conversion: Implementation Plan

## 0. Reframe the goal before writing any more code

Comparing the sample PDF to `Article.md` shows the final markdown is **not** a
lossless conversion of the PDF — it's an edited version of it:

- The PDF's "Tip 3: Get to good and go" section includes a long comparison of
  Ollama/LM Studio/llama.cpp/vLLM/vMLX and a `modelfit.io` recommendation.
  None of that survives into `Article.md`.
- "Tip 2" in the PDF has an extra paragraph and a full example-prompt block
  that isn't in the final markdown at all.
- Section headers are reworded: `"1. Write down your plan - and then some"`
  becomes `"## Tip 1: Write down your plan — and then some"`.
- Frontmatter fields (`date`, `excerpt`, `coverImage`, `slug`) don't exist in
  the PDF in any form — they're authored separately.

None of that is extractable from the PDF, no matter how good the parser is.
If your agent has been trying to make the script's output match `Article.md`
byte-for-byte, that's very likely why it's "struggling" — it's chasing a
target that requires editorial judgment, not just parsing.

**Recommendation:** redefine success for the script as *"produce a clean,
structurally faithful markdown draft"* — correct headings, paragraphs, lists,
bold/italic, and correctly-placed images, with placeholder frontmatter. Content
trimming, header rewording, and metadata authoring become a deliberate manual
pass afterward (Section 3 below covers exactly what to leave for that pass).

---

## 1. Language + library choice (with alternatives, since this is a structural decision)

The requirement driving this whole plan is *style-aware* extraction — telling
a heading apart from a bullet apart from bold body text apart from an image
caption. That needs a library that exposes per-span font name/size/flags and
image bounding boxes, not just raw text. That requirement, not the language,
is what should drive the choice:

| Option | Language | Pros | Cons |
|---|---|---|---|
| **`mupdf` (official Artifex npm package)** | Node | Wraps the same underlying MuPDF C engine as PyMuPDF, so equivalent fidelity: structured text (blocks/lines/spans with font/size/style) and image extraction with position; keeps the whole codebase in one language | Newer npm package, fewer community examples/StackOverflow answers than PyMuPDF; WASM/native-binding API idioms are a bit less battle-tested |
| `pdf.js` | Node | Extremely well-known, huge community | Built for *rendering*, not structured extraction — no explicit bold/italic flags (you'd fall back to font-name string matching only), and image extraction is awkward since it's not really what the library is for |
| `PyMuPDF` (`fitz`) | Python | Most mature option for exactly this use case; most documentation/examples; direct access to the flags bitmask | Introduces a second language/runtime into an otherwise all-JS project — separate dependency management (venv/pip), separate packaging, another thing to keep working in CI |
| `pdfplumber` | Python | Great for tables | Weaker/less reliable bold/italic detection; image extraction is clunkier |
| `pdftotext` (poppler) | Either (CLI) | Simple, ubiquitous | Throws away all font/style metadata entirely — can't distinguish headings from body text or detect bold/italic at all |

**Decision: Node, using the official `mupdf` package.** Since it's the same
underlying engine as PyMuPDF, you're not trading away capability for language
consistency — the span-level font/style/image data this plan depends on is
available either way. That removes the only real reason to reach for Python
here (this is a build-time authoring script, not a place where "always Python
for PDFs" is a hard rule — but no need to introduce a second runtime when the
same fidelity is available in Node). `pdf.js` is not recommended: it would
force you back onto weaker heuristics for exactly the classification problem
this whole plan exists to solve.

If, once you're into Phase 1 (below), the `mupdf` npm package's API turns out
to be missing something PyMuPDF exposes, that's worth flagging before going
further — but there's no known gap for what this plan needs.

---

## 2. Pipeline (what the script actually does)

### Step 1 — Diagnostics pass (build this first, it de-risks everything else)
Write a small `--debug` mode that dumps every text span in reading order as a
table: `page, y0, text, fontName, size, bold(bool), italic(bool)`. Run it
against your sample PDF and eyeball the output. Pages exports don't always
encode `Bold`/`Italic` consistently in the font name string — sometimes it's
only recoverable from a style/flags value on the span, depending on what the
`mupdf` package's structured-text API exposes for this file. You need to know
which one your file uses before you can write reliable classification rules.
This step alone will likely explain a lot of your agent's current failures —
it's probably guessing at thresholds instead of measuring them.

### Step 2 — Extract raw content
- Use `mupdf`'s structured text extraction (its equivalent of
  PyMuPDF's `page.get_text("dict")` — blocks → lines → spans) to get `bbox`,
  `font`, `size`, style info, and `text` per span. Confirm the exact method
  names against the package's own docs/TypeScript types during Phase 1 — this
  plan describes the *data* you need, not a specific API signature.
- Use the package's image-listing API to enumerate embedded images per page
  with their bounding boxes, so each image can be placed relative to
  surrounding text.
- Save images to an `images/` folder using deterministic sequential names
  (`banner.png`, `section1.jpg`, …) matching the pattern already used in
  `Article.md`.

### Step 3 — Merge into a single ordered stream
Combine text blocks and image blocks per page, sort by `y0` (top-to-bottom),
then concatenate pages in order. This gives you one linear sequence of
"things" (paragraph, heading, list item, image) matching final reading order —
critical for inline image placement, which is one of the trickier parts of
this kind of conversion.

### Step 4 — Classify each block
Using the diagnostics from Step 1:
- Compute the **mode font size** across the whole document → this is your
  "body text" baseline.
- `size` notably larger than baseline, appears near top of page 1 → **Title**
  (may span multiple lines/blocks — merge consecutive title-sized lines).
- `size` moderately larger than baseline (and/or bold) → **H2 heading**
  candidate.
- Line starts with `•` → **unordered list item**.
- Line starts with `\d+\.` → **ordered list item** *or* a heading, depending
  on context (see the "Tip N" ambiguity called out in Section 3 — don't try
  to resolve this with a clever heuristic, just flag it).
- Everything else at body size → **paragraph**.

### Step 5 — Inline formatting
Within a classified line, detect bold/italic runs (per Step 1's findings —
via `flags` or font-name substring, whichever your diagnostics showed is
reliable for this PDF) and wrap them in `**bold**` / `_italic_`. Handle
partial-line runs (e.g., only "Example prompt:" is bold, the rest isn't) by
tracking span boundaries rather than treating the whole line as one style.

### Step 6 — Text normalization
Apply a small set of consistent rules, since these look like they're a
document-wide style choice rather than PDF artifacts:
- ` - ` (space-hyphen-space) → ` — ` (em dash) — visible in multiple places
  comparing PDF to `Article.md`, e.g. *"...or something else - I just
  couldn't"* → *"...or something else — I just couldn't"*.
- Preserve existing typographic quotes/apostrophes as-is (don't downgrade to
  straight quotes) — confirm this against a couple more sample articles if
  you have them, since it's a one-document sample right now.
- Collapse repeated whitespace, trim trailing spaces per line.

### Step 7 — Assemble output
- Write the markdown body from the classified/formatted stream.
- Insert images as `![alt](./images/filename.ext)` at their sorted position.
  Alt text generation isn't reliably automatable from a PDF — pull the
  filename-derived label if one exists, otherwise emit a placeholder like
  `![TODO-alt-text](./images/section1.jpg)` so it's easy to grep for and fill
  in manually.
- Prepend a frontmatter block with what's derivable (`slug` from filename or
  slugified title, `title` from the detected Title block) and explicit
  placeholders for what isn't (`date`, `excerpt`, `coverImage`):

```yaml
---
slug: TODO
title: "<detected title>"
date: TODO
excerpt: "TODO"
coverImage: ./images/banner.png
---
```

---

## 3. What to deliberately leave out of automation

| Thing | Why it's out of scope for the script |
|---|---|
| Content trimming (shortening Tip 2/Tip 3) | Editorial judgment — no signal in the PDF indicates what's cuttable |
| Header rewording ("1. X" → "Tip 1: X") | *Possibly* automatable — see below |
| `excerpt` / `date` frontmatter fields | Authored independently of the source document |
| Ambiguous numbered-list-vs-heading blocks | Needs a human glance, not a heuristic that will silently misfire on the next article |

**On header rewording specifically:** if "Tip N: …" is a convention you use
consistently across articles (not just this one), it *can* be automated as an
explicit rule — detect a numbered heading-sized block matching `^\d+\.\s+(.+)`
and rewrite it as `## Tip {n}: {rest}` with the dash→em-dash rule from Step 6
already applied. Worth confirming with yourself before building it in, since a
rule tuned to one article can easily misfire on the next.

---

## 4. Validation strategy

Exact text-match testing against `Article.md` will always fail, given the
trimming discussed above. Instead:
- Compare **structural counts**: number of headings, list items, images —
  these should match or be explainable.
- Keep the diagnostics dump from Step 1 as a permanent `--debug` flag; the
  next Pages export may use different font-size buckets, and you'll want to
  recalibrate quickly rather than debug blind.

---

## 5. Numbered implementation tasks (agents work through these in order)

Each **Phase** groups related tasks and ends with a **🔍 Human validation**
checkpoint. Agents must stop at each checkpoint and wait for confirmation before
proceeding to the next phase.

### Phase 1 — Diagnostics tool (`convert-pdf-to-markdown.mjs --debug`)

This is the first script built. It does nothing but dump structured data from a
PDF so we can calibrate classification thresholds empirically.

- [ ] **T1.1** Add `mupdf` as a dependency; confirm it loads the sample PDF and
  can iterate pages.
- [ ] **T1.2** Extract structured text spans per page (blocks → lines → spans)
  and print, per span: `page`, `y0`, `text`, `font`, `size`, and whatever
  bold/italic signal the package exposes.
- [ ] **T1.3** Extract the list of embedded images per page with bounding boxes;
  print xref/filename, page number, and bbox for each.
- [ ] **T1.4** Compute and print the document's mode font size (the body-text
  baseline) and the distinct font sizes present, sorted descending, with a
  count of spans at each size.

**Output artifact:** A single file `convert-pdf-to-markdown.mjs` that accepts
`--input <pdf> --debug`, prints the diagnostics to stdout, and exits. No markdown
generation yet.

**🔍 Human validation (you):**
- Review the span dump. Confirm: which size(s) correspond to Title, which to
  section headers ("Tip N" lines), which is body text.
- Confirm whether bold/italic is detectable from the font name string or
  needs a different signal — write this down as a decision in this doc (add a
  "Decisions log" entry at the bottom) since Phase 2 depends on it.
- Confirm the image bbox output looks sane (reasonable coordinates, one entry
  per image you'd expect from the PDF).

### Phase 2 — Block classification + text normalization (no images yet)

Build the core conversion logic: classify each block and render to plain markdown.
Images and inline bold/italic come later.

- [ ] **T2.1** Merge spans into lines, lines into blocks, using vertical gaps /
  `y0` proximity heuristics.
- [ ] **T2.2** Classify each block: Title (top-of-page, large font), H2 heading
  (moderately larger than baseline and/or bold), unordered list item (starts with
  `•`), ordered list or heading candidate (starts with `\d+\.` — flag this
  ambiguity), paragraph (body-size text). Use the thresholds confirmed in Phase 1.
- [ ] **T2.3** Apply text normalization rules: ` - ` → ` — ` (em dash); collapse
  repeated whitespace; trim trailing spaces per line. Preserve typographic quotes
  as-is for now.
- [ ] **T2.4** Render the classified stream to markdown using headings, lists,
  and paragraphs only — no images, no bold/italic yet.

**Output artifact:** `convert-pdf-to-markdown.mjs` with `--input <pdf>` (no `--debug`)
generates a raw `.md` body containing only headings, lists, and paragraphs.

**🔍 Human validation (you):**
- Read the generated markdown top to bottom. Does every heading in the PDF show
  up as a heading? Does anything get misclassified (e.g., a long paragraph
  mistaken for a list item, or vice versa)?
- Specifically check the numbered "how did I get here" list block against the
  "Tip N" section headers — confirm the ambiguity flagged in Section 3 is being
  handled the way you expect (both currently rendering as some form of
  list/heading, not silently merged or dropped).

### Phase 3 — Image extraction + inline placement

- [ ] **T3.1** Save each embedded image to an `images/` subdirectory within the
  output folder using sequential deterministic naming (`banner.png`, `section1.jpg`, …)
  matching the pattern already used in existing articles.
- [ ] **T3.2** Merge image blocks into the ordered stream from Phase 2 by `y0`
  position (top-to-bottom, reading order).
- [ ] **T3.3** Emit `![TODO-alt-text](./images/filename.ext)` at the correct
  position in the markdown output.

**Output artifact:** The same `convert-pdf-to-markdown.mjs` now also embeds image
placeholders at their correct vertical positions within the markdown body.

**🔍 Human validation (you):**
- Open the output markdown and confirm each image appears between the same two
  paragraphs it sits between in the PDF — this step is most likely to drift
  silently if block ordering has an edge case.
- Spot-check the saved image files themselves (correct format, not corrupted,
  reasonable file size).

### Phase 4 — Inline bold/italic formatting

- [ ] **T4.1** Detect bold/italic runs within a line using the signal confirmed in
  Phase 1 (font-name substring or flags bitmask). Track span boundaries rather
  than treating the whole line as one style.
- [ ] **T4.2** Wrap detected runs in `**bold**` / `_italic_`, preserving correct
  span boundaries (e.g., only "Example prompt:" bold, rest plain).

**Output artifact:** `convert-pdf-to-markdown.mjs` now produces markdown with inline
bold/italic formatting on partially-styled lines.

**🔍 Human validation (you):**
- Check the "Example prompt:" line and any other partially-bold lines in the sample —
  confirm only the intended substring is wrapped, not the whole paragraph.

### Phase 5 — Frontmatter templating (converter side)

The converter writes frontmatter that accepts `slug` and `date` from CLI arguments.
These are **not** derived from the PDF content — they come from the outer pipeline
(`import-articles.mjs`). This preserves the existing workflow where metadata is
authored separately from the source document (slug from filename, date = today).

- [ ] **T5.1** Derive `title` frontmatter value from the detected Title block(s)
  (consecutive top-of-page, large-font lines).
- [ ] **T5.2** Write `slug` to frontmatter from `--slug` CLI arg. If not provided,
  default to `"TODO"` (for backward compatibility only).
- [ ] **T5.3** Write `date` to frontmatter from `--date` CLI arg. If not provided,
  default to `"TODO"` (for backward compatibility only).
- [ ] **T5.4** Set `coverImage` to the first extracted image if it matches a
  banner-like position/size heuristic, else leave as `TODO`.
- [ ] **T5.5** Write `excerpt` as an explicit `TODO` placeholder — do not attempt
  to generate this.

**Output artifact:** `convert-pdf-to-markdown.mjs` now writes a complete `Article.md`
file with YAML frontmatter (title + slug/date from args + TODO placeholders) followed
by the full markdown body with images and inline formatting.

**🔍 Human validation (you):**
- Verify that when run through `import-articles.mjs`, the generated Article.md
  contains correct `slug` and `date` values passed from the outer pipeline.
- Fill in `excerpt` yourself; correct `title` if the auto-derived value isn't
  what you'd choose. This is expected manual work, not a bug.

### Phase 6 (optional) — "Tip N:" heading rewriter

Only build this if you confirm it's a standing convention across your articles,
not a one-off pattern. See Section 3 for guidance.

- [ ] **T6.1** Detect numbered heading-sized blocks matching `^\d+\.\s+(.+)`.
- [ ] **T6.2** Rewrite as `## Tip {n}: {rest}`, with the em-dash normalization
  from T2.3 already applied to `{rest}`.

**Output artifact:** The same script now optionally rewrites "1. My heading" → "## Tip 1: My heading".

**🔍 Human validation (you):**
- Run against a second, different article's PDF (not just the sample) before
  trusting this rule — a rewrite rule tuned to one article's wording is the most
  likely thing here to misfire on the next one.

### Phase 7 — Integration with import pipeline

Wire the new converter into the existing batch orchestrator and verify end-to-end.
**`import-articles.mjs` must not be modified except to update any argument changes.**
All its responsibilities (directory looping, slug generation from filename, date
setting, skip-already-imported check, summary stats) remain **preserved as-is**.

- [ ] **T7.1** Ensure `import-articles.mjs` calls the updated
  `convert-pdf-to-markdown.mjs` with the full CLI contract:
  `--input`, `--output`, `--slug`, `--date`, `--extract-images`, `--skip-prompts`.
  No changes to slug generation, date setting, skip logic, or directory management.
- [ ] **T7.2** Verify that an article processed through `npm run importArticles` produces
  a correctly structured Article.md in `public/articles/<slug>/` with:
  - Valid YAML frontmatter (title filled from PDF, slug/date correct from args,
    excerpt/coverImage as TODO)
  - Correct headings, lists, paragraphs in the body
  - Image placeholders at correct positions
  - Inline bold/italic where applicable
- [ ] **T7.3** Verify idempotency: re-running `npm run importArticles` on already-imported
  articles skips them (existing `Article.md` existence check still works).
- [ ] **T7.4** Verify the `generate-articles-manifest.mjs` script still picks up new
  articles correctly after a full import + build cycle.

**Output artifact:** End-to-end working pipeline: drop a PDF in `rawArticles/`, run
`npm run importArticles`, review and edit the generated Article.md, then `npm run build`.

---

## 6. Integration with existing import pipeline

The converter script (`convert-pdf-to-markdown.mjs`) is designed to replace only
the PDF→Markdown **conversion** logic (Steps 1–7 in Section 2). The outer batch
orchestrator (`import-articles.mjs`) and its responsibilities are preserved
entirely. Here is the boundary:

| Responsibility | Lives in | Notes |
|---|---|---|
| Loop over all PDFs in `rawArticles/` | `import-articles.mjs` | **Preserved as-is** |
| Generate `slug` from filename (slugify) | `import-articles.mjs` | **Preserved as-is** — do NOT move into converter |
| Set `date` to today | `import-articles.mjs` | **Preserved as-is** |
| Skip already-imported articles (`Article.md` exists) | `import-articles.mjs` | **Preserved as-is** |
| Spawn conversion per PDF with correct args | `import-articles.mjs` | **Preserved as-is** |
| Summary stats (imported/skipped/errors) | `import-articles.mjs` | **Preserved as-is** |
| Create `rawArticles/` / `public/articles/` dirs | `import-articles.mjs` | **Preserved as-is** |
| Single PDF → Markdown conversion | `convert-pdf-to-markdown.mjs` | **New** — replaces old inline logic |
| Diagnostics/debug span dump | `convert-pdf-to-markdown.mjs --debug` | **New** — Phase 1 |
| Block classification & markdown rendering | `convert-pdf-to-markdown.mjs` | **New** — Phases 2–4 |
| Image extraction + placement | `convert-pdf-to-markdown.mjs` | **New** — Phase 3 |
| Frontmatter (partial: title, coverImage) | `convert-pdf-to-markdown.mjs` | Receives slug/date from args |

### CLI contract for `convert-pdf-to-markdown.mjs`

```bash
node convert-pdf-to-markdown.mjs \
  --input /path/to/article.pdf \
  --output /path/to/article-folder \
  --slug my-article-slug \
  --date 2026-09-22 \
  --extract-images \
  --skip-prompts
```

| Flag | Required | Purpose | Default if omitted |
|---|---|---|---|
| `--input` | Yes | Path to the PDF file to convert | (error) |
| `--output` | Yes | Destination directory for Article.md + images | (error) |
| `--slug` | No | Frontmatter slug value | `"TODO"` |
| `--date` | No | Frontmatter date value | `"TODO"` |
| `--extract-images` | No | Extract and save embedded images to `images/` subfolder | no extraction |
| `--skip-prompts` | No | Non-interactive mode (required for batch) | interactive mode |
| `--debug` | No | Print diagnostics span dump to stdout; exit after | off |

The `--debug` flag is a permanent feature: it exits early after printing the
span diagnostics from Phase 1, allowing future recalibration if font-size
buckets change in new source documents.

---

## Decisions log

*(Fill this in as you go through the validation checkpoints above — keeps a
record of which thresholds/signals were confirmed and when.)*

| Date | Decision | Notes |
|---|---|---|
| | | |
