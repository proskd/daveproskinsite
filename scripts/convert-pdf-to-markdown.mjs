#!/usr/bin/env node
/**
 * CLI tool: converts exported article .pdf files into structured Markdown.
 * Usage: node scripts/convert-pdf-to-markdown.mjs <input.pdf> [output.md]
 */

import { readFile, writeFile } from 'fs/promises'
import { resolve, basename, extname } from 'path'
import pdfParse from 'pdf-parse/lib/pdf-parse.js'

function parseArgs() {
  const args = process.argv.slice(2)
  const result = { input: null, output: null }
  let i = 0
  while (i < args.length) {
    if (!result.input) { result.input = resolve(args[i]) }
    else { result.output = resolve(args[i]) }
    i++
  }
  if (!result.input) {
    console.error('Usage: node scripts/convert-pdf-to-markdown.mjs <input.pdf> [output.md]')
    process.exit(1)
  }
  if (!result.output) {
    const base = basename(result.input, extname(result.input))
    result.output = resolve(`${base}.md`)
  }
  return result
}

async function main() {
  const { input, output } = parseArgs()
  process.stdout.write(`\x1b[90mConverting: ${input}\nOutput Markdown: ${output}\n\x1b[0m`)

  const pdfBuffer = await readFile(input)
  const pdfData = await pdfParse(pdfBuffer)
  if (!pdfData.text || !pdfData.text.trim()) {
    console.error('No text content found in PDF.')
    process.exit(1)
  }

  // Group text by pages for better separation
  const pages = pdfData.pages
    ? pdfData.pages.map((p) => p.text || '').filter(Boolean)
    : [pdfData.text]
  const bodyMd = pages.join('\n\n')

  const pdfName = basename(input, extname(input))
  const titleSlug = basename(pdfName).replace(/[-_]/g, ' ')
  const today = new Date().toISOString().split('T')[0]

  const fullMarkdown = [
    '---',
    `slug: "${pdfName}"`,
    `title: "${titleSlug}"`,
    `date: ${today}`,
    'excerpt: ""',
    '---',
    '',
    bodyMd,
    '',
    '---',
    '',
    '> **TODO:** Review and refine frontmatter values.',
    '> **TODO:** Verify any links and image references.',
    '',
  ].join('\n')

  await writeFile(output, fullMarkdown, 'utf-8')
  console.log(`\x1b[32mDone! Markdown written to: ${output}\x1b[0m`)
}

main().catch((err) => { console.error('Conversion failed:', err); process.exit(1) })

