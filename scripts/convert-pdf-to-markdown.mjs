#!/usr/bin/env node
/**
 * CLI tool: converts exported article .pdf files into structured Markdown.
 */

import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { resolve, dirname, basename, extname, join } from 'path'
import { createInterface } from 'readline'

function parseArgs(argv) {
  const flags = { verbose: false, extractImages: false, applyHeuristics: true, skipPrompts: false }
  let positional = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = argv[i + 1]
      if (key === 'no-heuristics') { flags.applyHeuristics = false }
      else if (key === 'skip-prompts' || key === 'batch-mode') { flags.skipPrompts = true }
      else if (['verbose', 'extract-images'].includes(key)) {
        flags[key.replace('-', '_')] = next && !next.startsWith('--')
        if (flags[key.replace('-', '_')]) i++
      } else {
        const val = arg.includes('=') ? arg.split('=', 2)[1] : next
        flags[key] = val || ''
        if (val && !arg.includes('=')) i++
      }
    } else { positional.push(arg) }
  }
  return { ...flags, positional }
}

function createPrompter() {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const question = (q) => new Promise((resolve) => rl.question(q, resolve))
  return { question, close: () => rl.close() }
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
    const si = await p.question('Cover image filename (or press Enter to skip, e.g. banner.png)? ')
    answers.coverImage = si.trim() || undefined
    return answers
  } finally { p.close() }
}

function slugifyTitle(title) {
  return title.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, '-').replace(/^-|-$/g, '')
}

function detectHeading(line, index, lines) {
  const trimmed = line.trim()
  if (!trimmed) return 0
  if (/^[A-Z0-9][A-Z0-9\s]{5,74}$/.test(trimmed)) {
    const nl = lines[index + 1] ? lines[index + 1].trim() : ''
    if ((nl.length > 0 && /^[a-z]/.test(nl)) || !nl) return 1
  }
  if (/^(\d+(\.\d+)*)[\.\s]+.+[.:]\s*$/.test(trimmed)) return 2
  if (trimmed.length > 3 && trimmed.length < 80 && !/^[-*•\d]\s/.test(trimmed)) {
    const nl = lines[index + 1] ? lines[index + 1].trim() : ''
    const anl = lines[index + 2] ? lines[index + 2].trim() : ''
    if (nl === '' && anl.length > 0) return 3
  }
  if (/^[A-Z][A-Z\s]{2,50}:?\s*$/.test(trimmed) && trimmed.split(/\s/).length <= 6) return 2
  if (/^\d+\.\s+[A-Z][a-zA-Z]{2,}$/.test(trimmed)) return 2
  if (trimmed.length < 60 && !trimmed.endsWith('.') && !trimmed.startsWith('-')) {
    const words = trimmed.split(/\s+/)
    if (words.length >= 2 && words.length <= 8) {
      const cappedWords = words.filter((w) => /^[A-Z]/.test(w)).length
      if (cappedWords / words.length > 0.6) return 3
    }
  }
  return 0
}

function detectListItem(line) {
  const trimmed = line.trimStart()
  if (/^[-*•]\s+/.test(trimmed)) {
    const spaces = line.length - trimmed.length
    return { text: trimmed.replace(/^[-*•]\s+/, ''), indent: Math.round(spaces / 2), type: 'ul' }
  }
  return null
}

function detectOrderedListItem(line) {
  const trimmed = line.trimStart()
  const match = /^(\d+)\.\s+/.exec(trimmed)
  if (match) return { number: parseInt(match[1], 10), text: trimmed.slice(match[0].length) }
  return null
}

function applyHeuristics(rawText) {
  const lines = rawText.split('\n')
  const mdLines = []
  let inList = null

  function flushList() {
    if (!inList || !inList.items.length) return
    for (const item of inList.items) {
      const prefix = inList.type === 'ol' ? '1.' : '-'
      mdLines.push(' '.repeat(inList.minIndent * 2) + prefix + ' ' + item)
    }
    mdLines.push('')
    inList = null
  }

  function flushParagraph(buf) { if (buf.length) { mdLines.push(...buf); mdLines.push('') } }
  let paraBuf = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) { flushList(); flushParagraph(paraBuf); paraBuf = []; continue }
    if (/^>\s?/.test(trimmed)) { flushList(); flushParagraph(paraBuf); mdLines.push('> ' + trimmed.replace(/^>\s?/, '')); continue }
    const hl = detectHeading(trimmed, i, lines)
    if (hl > 0) { flushList(); flushParagraph(paraBuf); mdLines.push('#'.repeat(hl) + ' ' + trimmed); mdLines.push(''); continue }
    const ul = detectListItem(line)
    if (ul) { flushParagraph(paraBuf); if (!inList || inList.type !== 'ul' || inList.minIndent > ul.indent) { if (inList) flushList(); inList = { type: 'ul', items: [], minIndent: ul.indent } }; inList.items.push(ul.text); continue }
    const ol = detectOrderedListItem(line)
    if (ol) { flushParagraph(paraBuf); if (!inList || inList.type !== 'ol') { if (inList) flushList() }; if (inList && inList.type === 'ol') { inList.items.push(ol.text) } else { inList = { type: 'ol', items: [ol.text], minIndent: 0 } }; continue }
    flushList(); paraBuf.push(trimmed)
  }

  flushParagraph(paraBuf); flushList()
  return mdLines.join('\n')
}

async function extractImages(pdfBuffer, articleDir) {
  let PDFParseClass
  try { const mod = await import('pdf-parse'); PDFParseClass = mod.PDFParse || mod.default } catch { return [] }
  try {
    const pdfObj = new PDFParseClass({ data: pdfBuffer })
    const imageResult = await pdfObj.getImage()
    if (!imageResult?.pages || imageResult.pages.length === 0) return []
    let extracted = []
    for (const pi of imageResult.pages) {
      for (const img of pi.images) {
        const ext = /\.(png|jpg|jpeg)/i.test(img.name) ? '' : '.png'
        const fn = 'image_page' + pi.pageNumber + '_' + (img.name || 'extracted') + ext
        await writeFile(resolve(join(articleDir, fn)), Buffer.from(img.data))
        extracted.push({ name: fn })
      }
    }
    return extracted
  } catch (err) { console.warn('  Image extraction not available: ' + err.message); return [] }
}

function generateFrontmatter(fm) {
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const parts = ['---', 'slug: ' + fm.slug, 'title: "' + esc(fm.title) + '"', 'date: ' + fm.date, 'excerpt: "' + esc(fm.excerpt || '') + '"']
  if (fm.coverImage) parts.push('coverImage: ./' + fm.coverImage)
  parts.push('---')
  return parts.join('\n')
}

async function convert(inputPath, oc) {
  const isDir = !oc.output.endsWith('.md') && !existsSync(oc.output)
  const articleDir = isDir ? resolve(oc.output) : dirname(resolve(oc.output))
  const mdPath = isDir ? join(articleDir, 'Article.md') : resolve(oc.output)
  const inputResolved = resolve(inputPath)

  if (!existsSync(inputResolved)) { console.error('Error: Input file not found: ' + inputResolved); process.exit(1) }

  process.stdout.write('\x1b[90mReading PDF: ' + inputResolved + '\x1b[0m\n')
  const pdfBuffer = await readFile(inputResolved)

  let rawText, totalPages
  try {
    const mod = await import('pdf-parse')
    const PDFParseClass = mod.PDFParse || mod.default
    const pdfObj = new PDFParseClass({ data: pdfBuffer })
    const textResult = await pdfObj.getText()
    rawText = textResult.text; totalPages = textResult.total
  } catch (err) { console.error('Error extracting text from PDF: ' + err.message); process.exit(1) }

  if (!rawText || !rawText.trim()) { console.error('Error: No text content found.'); process.exit(1) }

  if (oc.verbose) console.log('\x1b[90mExtracted ' + rawText.length + ' chars across ' + totalPages + ' page(s).\x1b[0m')
  await mkdir(articleDir, { recursive: true })

  const fallbackTitle = basename(inputResolved, extname(inputResolved)).replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  const today = new Date().toISOString().split('T')[0]
  let fmTitle = oc.title || fallbackTitle, fmDate = oc.date || today, fmExcerpt = oc.excerpt || '', fmSlug = oc.slug || slugifyTitle(fmTitle), coverImage = undefined

  if (!oc.title && !oc.date && !oc.excerpt && !oc.slug && !oc.skip_prompts) {
    console.log('\n\x1b[33mInteractive mode: please provide article metadata.\x1b[0m\n')
    const answers = await interactiveFrontmatter(fmTitle, fmSlug, fmDate, fmExcerpt)
    fmTitle = answers.title; fmDate = answers.date; fmExcerpt = answers.excerpt; fmSlug = answers.slug; coverImage = answers.coverImage
  }

  let bodyText = rawText
  if (oc.applyHeuristics) { process.stdout.write('\x1b[90mApplying style-detection heuristics...\x1b[0m\n'); bodyText = applyHeuristics(rawText) }

  let extractedImages = []
  if (oc.extract_images) {
    process.stdout.write('\x1b[90mAttempting image extraction...\x1b[0m\n')
    extractedImages = await extractImages(pdfBuffer, articleDir)
    for (const img of extractedImages) { console.log('  Extracted: ' + img.name); if (!coverImage) coverImage = img.name }
  }

  const fmContent = generateFrontmatter({ slug: fmSlug, title: fmTitle, date: fmDate, excerpt: fmExcerpt, coverImage })
  const todo = ['', '---', '', '> **TODO:** Review and refine frontmatter values (slug, title, date, excerpt).']
  if (extractedImages.length > 0) todo.push('> **TODO:** Verify image references. ' + extractedImages.length + ' embedded image(s) extracted.')
  else todo.push('> **TODO:** Save article images (from source document) into this folder.')
  todo.push('> **TODO:** Check for any links that need to be converted to Markdown format.', '')

  const finalContent = fmContent + '\n\n' + bodyText.trim() + '\n' + todo.join('\n')
  await writeFile(mdPath, finalContent, 'utf-8')

  console.log('\x1b[32mDone! Article written to: ' + mdPath + '\x1b[0m')
  console.log('  Slug:     ' + fmSlug)
  console.log('  Title:    ' + fmTitle)
  console.log('  Date:     ' + fmDate)
  if (fmExcerpt) console.log('  Excerpt:  "' + fmExcerpt + '"')
  if (coverImage) console.log('  Cover:    ' + coverImage)
  if (extractedImages.length > 0) console.log('  Images:   ' + extractedImages.length + ' embedded image(s) extracted')
  console.log('\x1b[90mNext steps: Review the generated Article.md for accuracy and tweak as needed.\x1b[0m')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const inputPath = args.input || (args.positional[0] && resolve(args.positional[0]))

  if (!inputPath) {
    console.error('Usage: node scripts/convert-pdf-to-markdown.mjs <input.pdf> [output.md]')
    console.error('')
    console.error('Flags:')
    console.error('  --input          Source PDF file (required)')
    console.error('  --output         Output .md file or directory')
    console.error('  --title          Article display title')
    console.error('  --date           ISO date YYYY-MM-DD')
    console.error('  --excerpt        Short description')
    console.error('  --slug           URL slug')
    console.error('  --extract-images Extract embedded PDF images (optional)')
    console.error('  --no-heuristics  Skip style detection; raw text only')
    console.error('  --skip-prompts   Skip interactive prompts (use defaults)')
    console.error('  --verbose        Print extra diagnostics')
    console.error('')
    console.error('Examples:')
    console.error('  node scripts/convert-pdf-to-markdown.mjs article.pdf')
    process.exit(1)
  }

  const oc = {
    output: args.output || join(dirname(resolve(inputPath)), basename(inputPath, extname(inputPath)) + '.md'),
    title: args.title || undefined, date: args.date || undefined, excerpt: args.excerpt || undefined, slug: args.slug || undefined,
    verbose: args.verbose || false, extract_images: args.extract_images || false,
    applyHeuristics: args.apply_heuristics !== false && args.applyHeuristics !== false,
  }

  try { await convert(inputPath, oc) }
  catch (err) { console.error('\x1b[31mConversion failed:\x1b[0m', err.message || err); if (oc.verbose) console.error(err.stack); process.exit(1) }
}

main()
