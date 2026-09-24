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

// ─── Task 1c: DOCX content extraction ─────────────────────────────────────────

/**
 * Read a .docx file and produce both markdown content and extracted images.
 * Images are extracted from data URIs embedded in the markdown output.
 * Returns { markdown: string, messages: Array, images: Array<{filename, buffer}> }.
 */
async function extractDocxContent(inputPath) {
  const docxBuffer = await readFile(inputPath)

  // Pass 1: Get the markdown text (contains data URI image placeholders like
  // ![f-t-tbl-banner.png](data:image/png;base64,...))
  const mdResult = await mammoth.convertToMarkdown({ buffer: docxBuffer })

  // Pass 2: Extract embedded images from data URIs in the markdown output
  const extractedImages = []
  const uriPattern = /!\[([^\]]*)\]\(data:image\/([^;]+);base64,([A-Za-z0-9+/=]+?)\)/g
  let match

  while ((match = uriPattern.exec(mdResult.value)) !== null) {
    const alt = match[1]           // e.g. "f-t-tbl-banner.png"
    const ext = match[2]           // e.g. "png", "jpeg", "jpg"
    const b64 = match[3]           // base64-encoded image bytes

    // Build filename: use alt text as-is, or append extension if needed
    let filename = alt
    if (!filename.includes('.')) {
      filename = filename + '.' + (ext === 'jpeg' ? 'jpg' : ext)
    }

    const imgBuffer = Buffer.from(b64, 'base64')
    extractedImages.push({ filename, buffer: imgBuffer })
  }

  if (mdResult.messages.length > 0) {
    console.warn('Mammoth messages:', mdResult.messages)
  }

  return { markdown: mdResult.value, messages: mdResult.messages, images: extractedImages }
}

// ─── Task 1d: Document structure analyzer / heading detector ──────────────

/**
 * Split raw markdown into block-level units separated by blank lines.
 */
function splitIntoBlocks(rawText) {
  const blocks = []
  let current = []
  for (const line of rawText.split('\n')) {
    if (line.trim() === '') {
      if (current.length > 0) {
        blocks.push(current)
        current = []
      }
    } else {
      current.push(line)
    }
  }
  if (current.length > 0) blocks.push(current)
  return blocks
}

/**
 * Build a filename lookup map from extracted images.
 */
function buildImageMap(extractedImages) {
  const map = {}
  for (const img of extractedImages) {
    map[img.filename] = img
    const dotIndex = img.filename.lastIndexOf('.')
    if (dotIndex > 0) {
      map[img.filename.substring(0, dotIndex)] = img
    }
  }
  return map
}

/**
 * Replace data URIs in markdown with file references.
 */
function replaceDataUris(markdown, imageMap) {
  let result = markdown
  const dataUriRe = /!\[([^\]]*)\]\(data:image\/[a-z]+;base64,([A-Za-z0-9+/=]+?)\)/g
  let match

  while ((match = dataUriRe.exec(markdown)) !== null) {
    const alt = match[1]
    let img = imageMap[alt] || imageMap[alt.split('.')[0]]
    if (!img) {
      for (const key of Object.keys(imageMap)) {
        if (alt.toLowerCase().includes(key.toLowerCase())) {
          img = imageMap[key]
          break
        }
      }
    }
    const replacementFile = img ? img.filename : 'PLACEHOLDER'
    result = result.replace(match[0], `![${alt}](./${replacementFile})`)
  }

  return result
}

/**
 * Unescape mammoth's overzealous Markdown escaping.
 * Mammoth escapes characters like '.', '(', ')', '-' that don't need escaping.
 */
function unescapeMammoth(markdown) {
  // Remove mammoth overzealous backslash escaping for common chars
  let result = markdown.replace(/\\([.!()\-])/g, '$1')

  // Ensure blank lines around h3 headings so blocks split correctly
  result = result.replace(/([^#\s])\n(#)/g, '$1\n\n$2')
  result = result.replace(/(#)\n([^#\s])/g, '$1\n\n$2')

  return result
}

/**
 * Split lines that contain both paragraph text and image references.
 * Mammoth sometimes concatenates: "text...![img](path)" without any separator.
 * This inserts a newline so they become separate blocks for proper classification.
 */
function splitInlineImages(markdown) {
  // Insert newline before ![ patterns that immediately follow a non-whitespace char
  return markdown.replace(/(\S)(!\[)/g, '$1\n$2')
}


/**
 * Classify a block based on heuristics.
 */
function classifyBlock(blockLines, isFirstBlock) {
  const firstLine = blockLines[0].trim()
  const allText = blockLines.join('\n')

  // 1. Banner/title area: first block contains banner image + text
  if (isFirstBlock && /!\[.*banner/i.test(allText)) {
    return 'banner'
  }

  // 2. Setup label: standalone line that is just "Setup"
  if (blockLines.length === 1 && /^setup$/i.test(firstLine)) {
    return 'setup'
  }

  // 3. Tip heading from h3: only if it looks like a numbered tip (has "Tip" keyword)
  const h3Match = firstLine.match(/^###\s+(?:(?:Tip\s+)?(\d+)[.:]\s+)?(.+)$/i)
  if (h3Match && /tip/i.test(firstLine)) {
    return 'tip-heading'
  }

  // 3b. Detect h3 section headings that need conversion: "### Setup" or similar
  const h3SectionRe = /^###\s+(.+)$/
  const h3SectionMatch = firstLine.match(h3SectionRe)
  // Skip if this is just an image wrapped in heading style (e.g., ### ![section1.jpg])
  const isImageOnlyBlock = blockLines.length === 1 && /!?\[/.test(blockLines[0])
  if (h3SectionMatch && blockLines.length === 1 && !isImageOnlyBlock) {
    return 'h3-section'
  }

  // 4. Numbered tip from ordered list: "- *Tip N: ...*" or similar
  const tipListRe = /^[-*\d.]\s+\*?\s*(?:tip\s+\d+)\s*:.*\*/i
  if (tipListRe.test(firstLine)) {
    return 'tip-list-item'
  }

  // 5. Section divider image: block that is ONLY a single image reference
  // May be preceded by heading marker (###) when mammoth wraps images in heading styles
  const stripHeading = line => line.replace(/^#{1,6}\s+/, '')
  const strippedLines = blockLines.map(stripHeading)
  const strippedFirst = strippedLines[0] || ''
  const nonImgStrippedLines = strippedLines.filter(l => !/^\s*!\[/.test(l))
  if (blockLines.length === 1 && /!\[.*\]\(/.test(strippedFirst) && nonImgStrippedLines.length === 0) {
    return 'section-divider-image'
  }

  // 6. Default: paragraph or list content
  if (/^[\s]*[-*+]\s/.test(firstLine)) return 'list-item'
  if (/^[\s]*\d+\.\s/.test(firstLine)) return 'ordered-list-item'
  return 'paragraph'
}

/**
 * Extract tip number and title from a line.
 */
function extractTipNumberAndTitle(text) {
  // Strip heading markers first
  let clean = text.replace(/^#{1,6}\s+/, '')
  let m = clean.match(/^(?:(?:tip\s+)?\d+[.:]\s*)(.+)$/i)
  if (!m) return null
  const title = m[1].trim().replace(/[.,;:!]+$/, '').trim()
  const number = clean.match(/\d+/)?.[0]
  return { number, title }
}

/**
 * Main analysis: processes raw markdown through all heuristics.
 */
function analyzeDocumentStructure(contentResult, extractedImages) {
  const rawMarkdown = contentResult.markdown
  const imageMap = buildImageMap(extractedImages)
  // Step 1: Replace data URIs with file references
  let cleaned = replaceDataUris(rawMarkdown, imageMap)
  // Step 2: Unescape mammoth's overzealous backslash escaping
  cleaned = unescapeMammoth(cleaned)
  // Step 3: Split inline image patterns from preceding text
  cleaned = splitInlineImages(cleaned)
  const blocks = splitIntoBlocks(cleaned)

  const extractedImagesList = []
  let coverImage
  let titleText
  let introLabelled = false

  const sections = []
  let currentSection = { items: [] }

  function pushSection(heading) {
    if (currentSection.items.length > 0 || heading) {
      if (heading) {
        sections.push({ ...currentSection, heading })
      } else {
        sections.push(currentSection)
      }
      currentSection = { items: [] }
    }
  }

  let blockIndex = 0

  for (const blockLines of blocks) {
    blockIndex++
    const isFirst = blockIndex === 1
    const classification = classifyBlock(blockLines, isFirst)

    // Heuristic 1: Banner / title area
    if (classification === 'banner') {
      const imgMatch = blockLines.join('\n').match(/!\[([^\]]*)\]\(data:image/)
      if (imgMatch) {
        const alt = imgMatch[1]
        const imgFile = imageMap[alt] || imageMap[alt.split('.')[0]]
        coverImage = imgFile ? imgFile.filename : undefined

        const afterImgMatch = blockLines.join('\n').replace(/!\[[^\]]*\]\([^)]*\)/, '')
          .replace(/<[^>]+>/g, '').replace(/\s*<br\s*\/?>\s*/g, ' ').trim()
        if (afterImgMatch) {
          titleText = afterImgMatch.split('\n')[0].trim() || undefined
        }
      }
      continue
    }

    // Heuristic 2: "Setup" label
    if (classification === 'setup') {
      pushSection('Setup')
      continue
    }

    // Heuristic 3: Tip heading from h3
    if (classification === 'tip-heading') {
      // If there's existing un-headed content, it's the introduction — label and save it first
      if (!currentSection.heading && currentSection.items.length > 0 && !introLabelled) {
        sections.push({ ...currentSection, heading: 'Introduction' })
        introLabelled = true
        currentSection = { items: [] }
      }
      const tipInfo = extractTipNumberAndTitle(blockLines[0])
      if (tipInfo) {
        pushSection(`Tip ${tipInfo.number}: ${tipInfo.title}`)
      } else {
        const cleanText = blockLines[0].replace(/^###\s+/, '').trim()
        pushSection(cleanText)
      }
      continue
    }

    // Heuristic 4: Numbered tip list item
    if (classification === 'tip-list-item') {
      const tipInfo = extractTipNumberAndTitle(blockLines[0])
      if (tipInfo) {
        pushSection(`Tip ${tipInfo.number}: ${tipInfo.title}`)
      } else {
        currentSection.items.push({ type: 'list', content: blockLines.join('\n') })
      }
      continue
    }

    // Heuristic 4b: h3 section headings (non-tip): ### Setup, ### Let's talk about tips
    if (classification === 'h3-section') {
      const cleanText = blockLines[0].replace(/^#{1,6}\s+/, '').trim()
      pushSection(cleanText)
      continue
    }

    // Heuristic 5: Section divider image
    if (classification === 'section-divider-image') {
      const imgRefMatch = blockLines[0].match(/!\[([^\]]*)\]\((.+?)\)/)
      if (imgRefMatch) {
        const alt = imgRefMatch[1]
        const path = imgRefMatch[2]
        extractedImagesList.push({ alt, filename: basename(path) })
        currentSection.items.push({ type: 'image', alt, path })
      }
      continue
    }

    // Default: body text or list content
    const fullBlock = blockLines.join('\n')
    if (classification === 'list-item' || classification === 'ordered-list-item') {
      currentSection.items.push({ type: 'list', content: fullBlock })
    } else if (fullBlock.includes('![')) {
      currentSection.items.push({ type: 'paragraph', content: fullBlock })
    } else {
      currentSection.items.push({ type: 'paragraph', content: fullBlock })
    }
  }

  if (currentSection.items.length > 0) {
    sections.push(currentSection)
  }

  return { sections, extractedImages: extractedImagesList, coverImage, titleText }
}

// ─── Placeholder: Markdown emitter (Task 1g) ──────────────────────────────

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

  // Extract both markdown content and images in a single pass
  const contentResult = await extractDocxContent(inputAbs)
  const extractedImages = contentResult.images

  if (verbose) {
    console.log('  [Content] Markdown extracted: ' + contentResult.markdown.length + ' chars')
    console.log('  [Images]  ' + extractedImages.length + ' embedded image(s) found')
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

  // Analyze document structure with heuristics
  const analysis = analyzeDocumentStructure(contentResult, extractedImages)
  if (verbose) {
    console.log('  [Analysis] ' + analysis.sections.length + ' section(s), '
      + analysis.extractedImages.length + ' image refs detected')
  }

  // Collect frontmatter
  let fmTitle = options.title || undefined
  let fmDate = options.date || undefined
  let fmExcerpt = options.excerpt || undefined
  let fmSlug = options.slug || undefined
  let coverImage = options.coverImage

  // Auto-detect title from banner if not provided
  if (!fmTitle && analysis.titleText) {
    fmTitle = analysis.titleText
    if (verbose) console.log('  [Auto] Title detected: ' + fmTitle)
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

  // Auto-detect cover image from analysis or extracted images
  if (!coverImage && analysis.coverImage) {
    coverImage = analysis.coverImage
  } else if (!coverImage && imagesWritten.length > 0) {
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
