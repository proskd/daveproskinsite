#!/usr/bin/env node
/**
 * CLI tool: converts exported article .pdf files into structured Markdown.
 */

import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { resolve, dirname, basename, extname, join } from 'path'
import { createInterface } from 'readline'

function parseArgs(argv) {
  const flags = { verbose: false, extractImages: false, skipPrompts: false }
  let positional = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = argv[i + 1]
      if (key === 'skip-prompts' || key === 'batch-mode') { flags.skipPrompts = true }
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

// --- Structured Text Extraction (MuPDF) ---
// Uses MuPDF structured text with Y-coordinate-aware block merging.
// Body paragraphs are merged regardless of vertical gap size, since
// MuPDF often outputs 12px/24px alternating gaps within a single paragraph.

async function parseStructuredText(pdfBuffer, verbose) {
  let mupdfMod;
  try {
    mupdfMod = await import('mupdf');
  } catch (err) {
    if (verbose) console.log('[extract] MuPDF not available, falling back to pdf-parse.');
    return null; // signal: use fallback
  }

  const doc = new mupdfMod.PDFDocument(pdfBuffer);
  const totalPages = doc.countPages();
  const allBlocks = [];

  for (let pg = 0; pg < totalPages; pg++) {
    const page = doc.loadPage(pg);
    let json;
    try {
      const jsonStr = page.toStructuredText().asJSON(1.0);
      json = JSON.parse(jsonStr);
    } catch {
      page.destroy();
      continue; // skip unreadable pages
    }
    if (!json.blocks || !Array.isArray(json.blocks)) {
      page.destroy();
      continue;
    }

    for (const blk of json.blocks) {
      if (!blk.lines || !Array.isArray(blk.lines)) continue;

      // Collect ALL lines including empty ones as paragraph separators
      const allEntries = [];
      for (const line of blk.lines) {
        const text = String(line.text ?? "").trimEnd();
        // MuPDF structured text uses `y` not `y0`; fallback to bbox.y
        const y0 = typeof line.y === "number" ? line.y : (line.bbox?.y ?? 0);
        const font = line.font ?? {};

        if (!text) {
          allEntries.push({ isSeparator: true, y0 });
        } else {
          const fontName = String(font.name ?? "");
          const fontSize = Number(font.size ?? 11);
          const isBold = font.weight === "bold" || (fontName.includes("-Bold") || fontName.includes("+Bold"));
          const isItalic = font.style === "italic" || (fontName.includes("Italic") || fontName.includes("+Italic"));
          allEntries.push({ isSeparator: false, y0, text, fontName, fontSize, isBold, isItalic });
        }
      }

      // Merge consecutive same-style lines into blocks.
      // KEY FIX: Ignore Y-gap thresholds for body text. Paragraph breaks come from:
      //   1. Empty lines (U+2028) → separator
      //   2. Font style changes (bold, large size) → new block
      // Same-style contiguous lines are always merged regardless of vertical gap.
      let curBlock = null;
      for (const entry of allEntries) {

        if (entry.isSeparator) {
          if (curBlock && curBlock.lines.trim()) {
            allBlocks.push(curBlock);
          }
          curBlock = null;
          continue;
        }

        // Check style compatibility (font size, bold, italic)
        const prevFontSize = curBlock?.fontSize ?? entry.fontSize;
        const isSameStyle = Math.abs(entry.fontSize - prevFontSize) <= 1 &&
                            (entry.isBold === curBlock?.isBold || !curBlock) &&
                            (entry.isItalic === curBlock?.isItalic || !curBlock);

        // Bullet points: flush current block, start new one with this bullet
        if (/^[\u2022-\u25AA\u25D8-\u25DB]/.test(entry.text) &&
            entry.isBold === curBlock?.isBold && entry.fontSize === curBlock?.fontSize) {
          allBlocks.push(curBlock);
          curBlock = null;
        }

        // New block (no current, or style mismatch)
        if (!curBlock || !isSameStyle) {
          curBlock = {
            page: pg, y0: entry.y0, lines: entry.text,
            fontName: entry.fontName, fontSize: entry.fontSize,
            isBold: entry.isBold, isItalic: entry.isItalic
          };
        } else {
          // Same style, not a bullet: merge into current block (ignore Y-gap)
          curBlock.lines += " " + entry.text;
        }
      }

      if (curBlock && curBlock.lines.trim()) {
        allBlocks.push(curBlock);
      }
    }

    page.destroy();
  }

  doc.destroy();

  // Convert blocks to plain text joined by newlines, with page-break markers between pages
  let result = "";
  let lastPg = -1;
  for (let i = 0; i < allBlocks.length; i++) {
    const b = allBlocks[i];
    if (b.page !== lastPg) {
      result += `\n--- Page ${b.page + 1} of ${totalPages} ---\n\n`;
      lastPg = b.page;
    }
    result += b.lines + "\n";
  }

  return result || null; // return null if no blocks extracted → fallback to pdf-parse
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

  let rawText = '', totalPages = 0

  // Try MuPDF structured text first (better paragraph reconstruction)
  if (oc.verbose) process.stdout.write('\x1b[90mAttempting structured text extraction...\x1b[0m\n')
  rawText = await parseStructuredText(pdfBuffer, oc.verbose)
  if (!rawText) {
    // Fall back to plain pdf-parse text extraction
    if (oc.verbose) process.stdout.write('\x1b[90mFalling back to basic text extraction...\x1b[0m\n')
    try {
      const mod = await import('pdf-parse')
      const PDFParseClass = mod.PDFParse || mod.default
      const pdfObj = new PDFParseClass({ data: pdfBuffer })
      const textResult = await pdfObj.getText()
      rawText = textResult.text; totalPages = textResult.total
    } catch (err) { console.error('Error extracting text from PDF: ' + err.message); process.exit(1) }
  }

  if (!rawText || !rawText.trim()) { console.error('Error: No text content found.'); process.exit(1) }

  totalPages = totalPages || (rawText.match(/-- \d+ of \d+ --/g) || []).length + 1
  await mkdir(articleDir, { recursive: true })

  const fallbackTitle = basename(inputResolved, extname(inputResolved)).replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  const today = new Date().toISOString().split('T')[0]
  let fmTitle = oc.title || fallbackTitle, fmDate = oc.date || today, fmExcerpt = oc.excerpt || '', fmSlug = oc.slug || slugifyTitle(fmTitle), coverImage = undefined

  if (!oc.title && !oc.date && !oc.excerpt && !oc.slug && !oc.skip_prompts) {
    console.log('\n\x1b[33mInteractive mode: please provide article metadata.\x1b[0m\n')
    const answers = await interactiveFrontmatter(fmTitle, fmSlug, fmDate, fmExcerpt)
    fmTitle = answers.title; fmDate = answers.date; fmExcerpt = answers.excerpt; fmSlug = answers.slug; coverImage = answers.coverImage
  }

  // Page-break markers are stripped since we removed heuristic processing.
  let bodyText = rawText
    .replace(/--- Page \d+ of \d+ ---\n*/g, '')
    .replace(/^-+\s+\d+\sof\s+\d+\s+-+\s*\n*/gm, '')  // pdf-parse page dividers (Bug #3)
    .trim()

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
    skip_prompts: args.skipPrompts || false,
  }

  try { await convert(inputPath, oc) }
  catch (err) { console.error('\x1b[31mConversion failed:\x1b[0m', err.message || err); if (oc.verbose) console.error(err.stack); process.exit(1) }
}

main()
