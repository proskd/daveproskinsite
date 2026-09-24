#!/usr/bin/env node
/**
 * CLI tool: converts exported article .docx files into structured Markdown.
 * Mirrors the PDF converter API for consistency and shared orchestrator compatibility.
 *
 * Plan reference: docx-to-markdown-conversion-plan.md, Task 1
 */

import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { resolve, dirname, basename, extname, join } from 'path'
import { createInterface } from 'readline'
import mammoth from 'mammoth'
import { load } from 'cheerio'

// ─── Task 1a: CLI argument parsing ────────────────────────────────────────────

function parseArgs(argv) {
  const flags = { verbose: false, extractImages: false, skipPrompts: false }
  let positional = []

  // Known boolean-only flags (no value consumed)
  const boolFlags = new Set(['verbose', 'extract-images', 'skip-prompts', 'batch-mode'])
  // Key-value flags (consume next arg as value, or use = syntax)
  const kvFlags = new Map([
    ['input', undefined],
    ['output', undefined],
    ['title', undefined],
    ['date', undefined],
    ['excerpt', undefined],
    ['slug', undefined],
  ])

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = argv[i + 1]

      // Boolean flags: --verbose, --extract-images, --skip-prompts
      if (boolFlags.has(key)) {
        flags[key.replace('-', '_')] = true
      }
      // Key-value flags: --title "Something" or --slug=my-slug
      else if (key.includes('=')) {
        const parts = arg.split('=', 2)
        const k = parts[0].replace(/-/g, '_')
        flags[k] = parts[1]
      } else if (next && !next.startsWith('--')) {
        const k = key.replace(/-/g, '_')
        flags[k] = next
        i++
      } else {
        // Unknown flag or missing value — treat as boolean true for forward compat
        const k = key.replace(/-/g, '_')
        flags[k] = true
      }
    } else {
      positional.push(arg)
    }
  }

  return { ...flags, positional }
}

// ─── Task 1b: Frontmatter collection ──────────────────────────────────────────

function createPrompter() {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const question = (q) => new Promise((resolve) => rl.question(q, resolve))
  return { question, close: () => rl.close() }
}

function slugifyTitle(title) {
  return title.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, '-').replace(/^-|-$/g, '')
}

async function interactiveFrontmatter(title, slug, date, excerpt) {
  const p = await createPrompter()
  try {
    const answers = {}

    answers.title = title || (await p.question('Article title? '))
    while (!answers.title.trim()) {
      console.log('  Title is required.')
      answers.title = await p.question('Article title? ')
    }

    const defaultDate = new Date().toISOString().split('T')[0]
    answers.date = date || (await p.question(`Date [${defaultDate}]? `)).trim()
    if (!answers.date) answers.date = defaultDate
    if (!/^\d{4}-\d{2}-\d{2}$/.test(answers.date)) {
      console.warn('  Warning: date should be YYYY-MM-DD.')
    }

    answers.excerpt = excerpt || (await p.question('Excerpt (short description)? ')) || ''

    const defaultSlug = slug || slugifyTitle(answers.title)
    answers.slug = (await p.question(`Slug [${defaultSlug}]? `)).trim() || defaultSlug

    const si = await p.question(
      'Cover image filename (or press Enter to skip, e.g. banner.png)? '
    )
    answers.coverImage = si.trim() || undefined

    return answers
  } finally {
    p.close()
  }
}

// ─── Task 1c: DOCX → HTML conversion ──────────────────────────────────────────

/**
 * Read a .docx file and produce an HTML string with embedded images as data URIs.
 * Uses mammoth.convertToHtml() which correctly produces <h3> tags for all Heading 3 elements.
 * No styleMap is needed — mammoth auto-produces all h3 headings correctly.
 *
 * Returns { html: string, messages: Array, images: Array<{filename, buffer, mimeType, alt}> }.
 */
async function convertDocxToHtml(inputPath) {
  const docxBuffer = await readFile(inputPath)

  // Convert DOCX to HTML — mammoth produces proper <h3> for Heading 3 style elements
  const result = await mammoth.convertToHtml({ buffer: docxBuffer })

  // Extract embedded images from data URIs in the HTML img tags.
  // Mammoth produces <img alt="..." src="data:image/...;base64,..."> — attributes may be in any order,
  // so we extract src and alt independently using flexible patterns.
  const extractedImages = []
  const srcPattern = /src="data:image\/([^;"]+);base64,([A-Za-z0-9+/=]+)"/g
  let match

  while ((match = srcPattern.exec(result.value)) !== null) {
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1]
    const b64 = match[2]

    // Find the alt attribute for this image (alt comes before src in mammoth output)
    const beforeSrc = result.value.substring(
      Math.max(0, result.value.indexOf(match[0]) - 200),
      result.value.indexOf(match[0])
    )
    const altMatch = beforeSrc.match(/alt="([^"]*)"/)
    const alt = altMatch ? altMatch[1] : ''

    // Build filename: use alt text as-is (mammoth often provides original filenames),
    // or append extension if needed
    let filename = alt || `image_${extractedImages.length}.${ext}`
    if (!filename.includes('.')) {
      filename = filename + '.' + ext
    }

    const imgBuffer = Buffer.from(b64, 'base64')
    extractedImages.push({ filename, buffer: imgBuffer, mimeType: `image/${ext}`, alt })
  }

  if (result.messages.length > 0) {
    console.warn('Mammoth messages:', result.messages)
  }

  return { html: result.value, messages: result.messages, images: extractedImages }
}

// ─── Task 1d: Main traversal pipeline ──────────────────────────────────────

/**
 * Traverse the HTML output from mammoth.convertToHtml() and classify each element.
 * Produces an ordered list of section objects for downstream markdown generation.
 *
 * Classification rules (from plan):
 *   - <h3> containing ONLY an <img> → image divider (not a heading)
 *   - <h3> containing text → ## heading output
 *   - First <p> with banner image → Title
 *   - Second short <p> → Subtitle
 *   - Everything else (<p>, <ul>, <ol>) → body content
 *
 * Returns { sections: Array, extractedImages: Array }.
 */
function traverseDocument(html, images) {
  // Parse HTML using cheerio (Node.js-compatible DOM parser) — imported above
  const $ = load(html)

  // Deduplicate extracted images (by lowercase filename)
  const seen = {}
  const deduped = []
  for (const img of images) {
    const key = img.filename.toLowerCase()
    if (!seen[key]) {
      seen[key] = true
      deduped.push(img)
    }
  }

  // Helper: <h3> containing ONLY an <img> -> image divider (not a heading)
  function isH3Divider($el) {
    return $el.prop('tagName') === 'H3' && $el.find('img').length > 0 && !$el.text().trim()
  }

  // Helper: <h3> with text and no <img> -> heading
  function isH3Heading($el) {
    return $el.prop('tagName') === 'H3' && $el.find('img').length === 0 && $el.text().trim().length > 0
  }

  // Helper: strip all HTML tags, leaving plain text (wrap in div to avoid selector parsing)
  function stripHtmlTags(htmlString) {
    return $('<div>').html(htmlString).text() || ''
  }

  // Helper: <p> containing an <img> (for title detection)
  function hasImage($el) {
    return $el.prop('tagName') === 'P' && $el.find('img').length > 0
  }

  // Helper: extract alt text from first <img> inside a <p>
  function getImgAlt($el) {
    const img = $el.find('img').first()
    return img.attr('alt') || ''
  }

  // Helper: <p> short enough to be subtitle (under ~50 chars text)
  function isShortText(htmlContent) {
    const text = stripHtmlTags(htmlContent).trim()
    return text.length > 0 && text.length < 50
  }

  // Section builder
  const sections = []
  let currentSection = { items: [] }
  let foundTitle = false
  let foundSubtitle = false

  function pushCurrent() {
    if (currentSection.items.length > 0 || currentSection.heading) {
      sections.push(currentSection)
      currentSection = { items: [] }
    }
  }

  // Walk top-level children of <body> sequentially
  $('body > *').each(function(_idx, el) {
    const $el = $(el)

    if (isH3Divider($el)) {
      const alt = $el.find('img').first().attr('alt') || 'divider'
      deduped.forEach((img) => {
        if (img.alt.toLowerCase() === alt.toLowerCase() ||
            img.filename.toLowerCase().includes(alt.toLowerCase().split('.')[0])) {
          if (sections.length > 0) {
            sections[sections.length - 1].items.push({ type: 'image', alt, filename: img.filename })
          }
        }
      })
    } else if (isH3Heading($el)) {
      pushCurrent()
      currentSection.heading = stripHtmlTags($el.html()).trim()
    } else if ($el.prop('tagName') === 'P') {
      if (!foundTitle && hasImage($el)) {
        currentSection.items.push({ type: 'title', imageAlt: getImgAlt($el) })
        foundTitle = true
      } else if (!foundSubtitle && isShortText($el.html())) {
        currentSection.items.push({ type: 'subtitle', text: stripHtmlTags($el.html()) })
        foundSubtitle = true
      } else {
        // Forward reference -> delegates to Task 1f (paragraph formatter)
        currentSection.items.push({ type: 'paragraph', content: $el.html() })
      }
    } else if ($el.prop('tagName') === 'UL' || $el.prop('tagName') === 'OL') {
      // Task 1e — list converter: recursive nested list → indented markdown
      // $el[0] unwraps the cheerio jQuery-like wrapper to get the native element
      // with iterable .children that convertList expects.
      currentSection.items.push({ type: 'list', content: convertList($el[0], 0) })
    }
  })

  pushCurrent()
  return { sections, extractedImages: deduped }
}

// ─── Task 1e: List converter (nested list → indented markdown) ────────────────

/**
 * Recursively convert a <ul> or <ol> DOM element into indented Markdown list text.
 * Handles arbitrary nesting depth via recursive depth tracking.
 * Uses native DOM APIs — no cheerio dependency required.
 *
 * @param {HTMLElement} listEl — <ul> or <ol> element from DOM
 * @param {number} depth — current nesting depth (0 = top-level)
 * @returns {string} Markdown-formatted list text with proper indentation
 */
function convertList(listEl, depth) {
  const isOrdered = listEl.tagName === 'OL' || listEl.tagName === 'ol'
  let md = ''
  let count = 0

  for (const child of listEl.children) {
    // Skip non-element nodes (text nodes / whitespace)
    if (child.nodeType !== 1) continue
    if (child.tagName !== 'LI' && child.tagName !== 'li') continue
    count++

    // Collect text from children and extract nested lists.
    // Mammoth outputs list item text as TEXT NODES directly inside <li> (nodeType=3),
    // NOT wrapped in <p> tags.  Cheerio auto-closing can also create <p>/<ul> siblings
    // when content has mixed formatting. We handle all cases:
    //   - Direct text nodes: nodeType === 3 → .data contains the text
    //   - <p> elements: extract all descendant text
    //   - Nested <ul>/<ol>: recurse into convertList for indented sub-items
    let text = ''
    let nestedMd = ''

    function collectText(node) {
      if (node.type === 'text' || typeof node.data === 'string') return node.data || ''
      for (const c of node.children || []) { text += collectText(c) }
      return text
    }

    for (const gc of child.children) {
      // Text nodes directly inside <li> (mammoth default for simple list items)
      if ((gc.nodeType === 3 || gc.type === 'text' || typeof gc.data === 'string') && !gc.tagName) {
        const t = (gc.textContent ?? gc.data ?? '').trim()
        if (t) text += t
      } else if (gc.tagName && (gc.tagName !== 'UL' && gc.tagName !== 'ul' &&
             gc.tagName !== 'OL' && gc.tagName !== 'ol')) {
        // Any non-list element (<p>, <em>, <strong>, etc.) contributes its descendant text
        // Only first such element to avoid duplication with direct text nodes
        if (!text) text = collectText(gc).trim()
      } else if ((gc.tagName === 'UL' || gc.tagName === 'ul') && gc.children.length > 0) {
        nestedMd += convertList(gc, depth + 1) + '\n'
      } else if ((gc.tagName === 'OL' || gc.tagName === 'ol') && gc.children.length > 0) {
        nestedMd += convertList(gc, depth + 1) + '\n'
      }
    }

    // Add the current item and any nested list markdown (appended after)
    const prefix = isOrdered ? `${count}. ` : '- '
    md += '  '.repeat(depth) + prefix + text + '\n'
    if (nestedMd) md += nestedMd
  }

  return md.trimEnd()
}

// ─── Placeholder: Markdown emitter (Task 1g)

function generateFrontmatter(fm) {
  let md = '---\n'
  md += `slug: ${fm.slug}\n`
  md += `title: "${fm.title}"\n`
  md += `date: ${fm.date}\n`
  if (fm.excerpt) md += `excerpt: "${fm.excerpt}"\n`
  if (fm.coverImage) md += `coverImage: ./${fm.coverImage}\n`
  md += '---\n'
  return md
}

function generateMarkdown(fm, sections) {
  let md = generateFrontmatter(fm) + '\n\n'

  for (const section of sections) {
    if (section.heading) md += '## ' + section.heading + '\n\n'
    for (const item of section.items) {
      if (item.type === 'paragraph') {
        md += item.content + '\n\n'
      } else if (item.type === 'list') {
        md += item.content + '\n\n'
      } else if (item.type === 'image') {
        md += '\n![' + item.alt + '](' + item.path + ')\n\n'
      }
    }
  }

  // TODO notes for human review
  md += '---\n\n'
  md += '> **TODO:** Review and refine section headings (the converter detected some automatically).\n'
  md += '> **TODO:** Verify image references and ensure all images were extracted correctly.\n'
  md += '> **TODO:** Check for any content that may need manual editing or reformatting.\n'

  return md
}

// ─── Task 1h: CLI entry point / main() ──────────────────────────────────────

async function convert(inputPath, options) {
  const { verbose, extract_images, skip_prompts } = options
  const inputAbs = resolve(inputPath)

  if (!existsSync(inputAbs)) {
    throw new Error('File not found: ' + inputAbs)
  }

  console.log('\nConverting DOCX: ' + basename(inputAbs))
  console.log('  Source : ' + inputAbs)
  console.log('  Output : ' + options.output)

  // Step 1: Convert DOCX → HTML + extract images (Task 1c)
  const htmlResult = await convertDocxToHtml(inputAbs)
  const images = htmlResult.images

  if (verbose) {
    console.log('  [HTML]     ' + htmlResult.html.length + ' chars')
    console.log('  [Images]   ' + images.length + ' embedded image(s) extracted')
  }

  // Create output directory first (needed before writing images or Article.md)
  const outputDir = options.output
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true })
  }

  // Write extracted images to disk
  let imagesWritten = []
  if (extract_images) {
    process.stdout.write('  Writing extracted images...\n')
    for (const img of extractedImages) {
      const imgPath = join(options.output, img.filename)
      await writeFile(imgPath, img.buffer)
      imagesWritten.push(img.filename)
      if (verbose) console.log('    ' + img.filename)
    }
  }

  // Step 2: Traverse HTML structure and classify elements (Task 1d)
  const analysis = traverseDocument(htmlResult.html, images)
  if (verbose) {
    console.log('  [Analysis] ' + analysis.sections.length + ' section(s), '
      + analysis.extractedImages.length + ' image(s) extracted')
  }

  // Collect frontmatter
  let fmTitle = options.title || undefined
  let fmDate = options.date || undefined
  let fmExcerpt = options.excerpt || undefined
  let fmSlug = options.slug || undefined
  let coverImage = options.coverImage

  // Auto-detect title from first section's title item (if present in traversal output)
  if (!fmTitle && analysis.sections.length > 0 && analysis.sections[0].items.length > 0) {
    const firstItem = analysis.sections[0].items[0]
    if (firstItem.type === 'title' || firstItem.type === 'subtitle') {
      // Look for the title text — it will be in the next non-title item or we skip auto-detection
      // Title text comes from mammoth HTML; for now use a placeholder and let user provide
    }
  }

  if (skip_prompts) {
    if (!fmTitle) fmTitle = 'Untitled Article'
    if (!fmDate) fmDate = new Date().toISOString().split('T')[0]
    if (!fmSlug) fmSlug = slugifyTitle(fmTitle)
  } else {
    const answers = await interactiveFrontmatter(fmTitle, fmSlug, fmDate, fmExcerpt)
    fmTitle = answers.title
    fmDate = answers.date
    fmExcerpt = answers.excerpt
    fmSlug = answers.slug
    coverImage = answers.coverImage
  }

  // Auto-detect cover image from extracted images
  if (!coverImage && imagesWritten.length > 0) {
    const bannerCandidate = imagesWritten.find((fn) => /banner/i.test(fn))
    coverImage = bannerCandidate || imagesWritten[0]
  }

  const mdPath = join(outputDir, 'Article.md')
  const mdContent = generateMarkdown(
    { slug: fmSlug, title: fmTitle, date: fmDate, excerpt: fmExcerpt, coverImage },
    analysis.sections
  )
  await writeFile(mdPath, mdContent, 'utf-8')

  console.log('\x1b[32mDone! Article written to: ' + mdPath + '\x1b[0m')
  console.log('  Slug:     ' + fmSlug)
  console.log('  Title:    ' + fmTitle)
  console.log('  Date:     ' + fmDate)
  if (fmExcerpt)   console.log('  Excerpt:  "' + fmExcerpt + '"')
  if (coverImage)  console.log('  Cover:    ' + coverImage)
  if (imagesWritten.length > 0) {
    console.log('  Images:   ' + imagesWritten.length + ' embedded image(s) extracted')
  }
  console.log('\x1b[90mNext steps: Review the generated Article.md for accuracy and tweak as needed.\x1b[0m')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const inputPath = args.input || (args.positional[0] && resolve(args.positional[0]))

  if (!inputPath) {
    console.error('Usage: node scripts/convert-docx-to-markdown.mjs <input.docx> [output.dir]')
    console.error('')
    console.error('Flags:')
    console.error('  --input          Source .docx file (required)')
    console.error('  --output         Output directory (creates folder + Article.md)')
    console.error('  --title          Article display title')
    console.error('  --date           ISO date YYYY-MM-DD')
    console.error('  --excerpt        Short description')
    console.error('  --slug           URL slug')
    console.error('  --extract-images Extract embedded DOCX images (optional)')
    console.error('  --skip-prompts   Skip interactive prompts (use defaults)')
    console.error('  --verbose        Print extra diagnostics')
    console.error('')
    console.error('Examples:')
    console.error('  node scripts/convert-docx-to-markdown.mjs article.docx')
    process.exit(1)
  }

  const inputAbs = resolve(inputPath)
  const oc = {
    output:          args.output || join(dirname(inputAbs), basename(inputPath, extname(inputPath))),
    title:           args.title || undefined,
    date:            args.date || undefined,
    excerpt:         args.excerpt || undefined,
    slug:            args.slug || undefined,
    coverImage:      undefined,
    verbose:         args.verbose || false,
    extract_images:  args.extract_images || false,
    skip_prompts:    args.skip_prompts || false,
  }

  try {
    await convert(inputPath, oc)
  } catch (err) {
    console.error('\x1b[31mConversion failed:\x1b[0m', err.message || err)
    if (oc.verbose) console.error(err.stack)
    process.exit(1)
  }
}

main()
