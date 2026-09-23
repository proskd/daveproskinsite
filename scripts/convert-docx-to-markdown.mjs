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

// ─── Task 1a: CLI argument parsing ────────────────────────────────────────────
// Copied/replicated from convert-pdf-to-markdown.mjs. Same signature and behaviour.

function parseArgs(argv) {
  const flags = { verbose: false, extractImages: false, skipPrompts: false }
  let positional = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = argv[i + 1]
      if (key === 'skip-prompts' || key === 'batch-mode') {
        flags.skipPrompts = true
      } else if (['verbose', 'extract-images'].includes(key)) {
        flags[key.replace('-', '_')] = next && !next.startsWith('--')
        if (flags[key.replace('-', '_')]) i++
      } else {
        const val = arg.includes('=') ? arg.split('=', 2)[1] : next
        flags[key] = val || ''
        if (val && !arg.includes('=')) i++
      }
    } else {
      positional.push(arg)
    }
  }
  return { ...flags, positional }
}

// ─── Task 1b: Frontmatter collection ──────────────────────────────────────────
// Replicated from convert-pdf-to-markdown.mjs. Identical flow.

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

// ─── Task 1c: DOCX AST extraction ─────────────────────────────────────────────
// Uses mammoth.convertToMarkdown() + images.docx() for the full pipeline.
// convertToMarkdown produces structured markdown with headings, lists, and image refs.

/**
 * Read a .docx file and run mammoth.convertToMarkdown().
 * Returns { markdown: string, messages: Array }.
 */
async function extractDocxContent(inputPath) {
  const docxBuffer = await readFile(inputPath)
  const result = await mammoth.convertToMarkdown({ buffer: docxBuffer })

  if (result.messages.length > 0) {
    console.warn('Mammoth messages:', result.messages)
  }

  return { markdown: result.value, messages: result.messages }
}

/**
 * Extract embedded images from the .docx using mammoth.images.docx().
 * Returns an array of { filename: string, buffer: Buffer }.
 */
async function extractDocxImages(docxBuffer) {
  const imgResult = await mammoth.images.docx(docxBuffer)
  const extracted = []

  for (const img of imgResult.images) {
    const filename = img.sourceImageName || basename(img.contentType)
    extracted.push({ filename, buffer: img.buffer })
  }

  return extracted
}

// ─── Task 1d: Document structure analyzer ────────────────────────────────

function analyzeDocumentStructure(contentResult, extractedImages) {
  const rawMarkdown = contentResult.markdown
  const dataUriPattern = /!\[([^\]]*)\]\(data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+\)/g
  const images = []
  let match

  while ((match = dataUriPattern.exec(rawMarkdown)) !== null) {
    const alt = match[1]
    const imgFile = extractedImages.find((img) =>
      alt.toLowerCase().includes(img.filename.split('.')[0].toLowerCase()) ||
      alt.toLowerCase().includes(img.filename.toLowerCase())
    )
    images.push({ alt, filename: imgFile ? imgFile.filename : (alt + '.unknown'), position: match.index })
  }

  const sections = []
  const lines = rawMarkdown.split('\n')
  let currentSection = { items: [] }

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    const headingMatch = trimmed.match(/^###\s+(.+)$/)
    if (headingMatch) {
      if (currentSection.items.length > 0) sections.push(currentSection)
      currentSection = { heading: headingMatch[1], items: [] }
      continue
    }
    currentSection.items.push({ type: 'paragraph', content: trimmed })
  }

  if (currentSection.items.length > 0) sections.push(currentSection)
  return { sections, images }
}

// ─── Placeholder: Markdown emitter (Task 1g) ──────────────────────────────

function generateMarkdown(fm, sections) {
  // TODO (Task 1g): Build YAML frontmatter + iterate sections to produce markdown.
  return '---\n# TODO: implement generateMarkdown (Task 1g)\n---\n\n'
}

// ─── Main entry point (Task 1h) ─────────────────────────────────────────

async function convert(inputPath, options) {
  const { verbose, extract_images, skip_prompts } = options
  const inputAbs = resolve(inputPath)

  if (!existsSync(inputAbs)) {
    throw new Error('File not found: ' + inputAbs)
  }

  console.log('\nConverting DOCX: ' + basename(inputAbs))
  console.log('  Source : ' + inputAbs)
  console.log('  Output : ' + options.output)

  const contentResult = await extractDocxContent(inputAbs)
  if (verbose) {
    console.log('  [Content] Markdown extracted successfully.')
    console.log('  [Content] ' + contentResult.markdown.length + ' chars')
  }

  let extractedImages = []
  if (extract_images) {
    process.stdout.write('  Attempting image extraction...\n')
    const docxBuffer = await readFile(inputAbs)
    extractedImages = await extractDocxImages(docxBuffer)
    for (const img of extractedImages) {
      console.log('  Extracted: ' + img.filename)
    }
  }

  const analysis = analyzeDocumentStructure(contentResult, extractedImages)
  if (verbose) {
    console.log('  [Analysis] Found ' + analysis.images.length + ' image(s), ' + analysis.sections.length + ' section(s).')
  }

  let fmTitle = options.title || undefined
  let fmDate = options.date || undefined
  let fmExcerpt = options.excerpt || undefined
  let fmSlug = options.slug || undefined
  let coverImage = options.coverImage

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

  if (!coverImage && extractedImages.length > 0) {
    const bannerCandidate = extractedImages.find((img) =>
      /banner/i.test(img.filename) || /\.(png|jpg|jpeg)$/i.test(img.filename)
    )
    if (bannerCandidate) coverImage = bannerCandidate.filename
  }

  const outputDir = options.output
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true })
  }

  const mdPath = join(outputDir, 'Article.md')
  const mdContent = generateMarkdown(
    { slug: fmSlug, title: fmTitle, date: fmDate, excerpt: fmExcerpt, coverImage },
    analysis.sections
  )
  await writeFile(mdPath, mdContent, 'utf-8')

  console.log('\nArticle written to: ' + mdPath)
  console.log('  Slug:     ' + fmSlug)
  console.log('  Title:    ' + fmTitle)
  console.log('  Date:     ' + fmDate)
  if (fmExcerpt)   console.log('  Excerpt:  "' + fmExcerpt + '"')
  if (coverImage)  console.log('  Cover:    ' + coverImage)
  if (extractedImages.length > 0) {
    console.log('  Images:   ' + extractedImages.length + ' embedded image(s) extracted')
  }
  console.log('\x1b[90mNext steps: Implement Tasks 1d full + 1f + 1g, then re-run.\x1b[0m')
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
    skip_prompts:    args.skipPrompts || false,
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

