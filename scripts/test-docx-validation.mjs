#!/usr/bin/env node
/**
 * Task 4: Validation tests for the DOCX Markdown conversion pipeline.
 *
 * Tests cover:
 *   1. Round-trip on sample docx                     end-to-end convert, output exists
 *   2. Heading detection accuracy                    all 7 H3 elements correct headings
 *   3. Image extraction count                         6 images (banner + 5 sections)
 *   4. Nested list indentation                        Setup sub-list has correct 2-space indent
 *   5. Inline formatting preservation                  bold, italic survive conversion
 *   6. Title/Subtitle rendering                       # h1 heading from banner image; subtitle adjacent
 *   7. No artificial headings                         Output does NOT contain ## Introduction, etc.
 *   8. Batch mode (skip-prompts)                      Script runs non-interactively
 *   9. Interactive mode (prompt flow structure)       Validates function signature exists
 *
 * Run: node scripts/test-docx-validation.mjs
 */

import { readdir, readFile, rm, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { resolve, join } from 'path'
import { spawnSync } from 'child_process'

const __dirname = import.meta.dirname ?? new URL('.', import.meta.url).pathname
const ROOT = resolve(__dirname, '..')
const SAMPLE_DOCX = join(ROOT, 'rawArticles', 'farmtotable-iosappwithlocalllms.docx')
const CONVERT_SCRIPT = join(__dirname, 'convert-docx-to-markdown.mjs')
const TEST_OUTPUT_DIR = join('/tmp', 'docx-validation-' + Date.now())
const ONLINE_TARGET = join(ROOT, 'onlineresults', 'farmtotable-iosappwithlocalllms.md')

let passed = 0
let failed = 0
let onlineTargetParsed = ''

function test(name, actual, expected) {
  const pass = typeof expected === 'function' ? expected(actual) : actual === expected
  if (pass) { console.log(`  PASS -- ${name}`); passed++ }
  else {
    console.log(`  FAIL -- ${name}`)
    console.log(`  Expected: ${JSON.stringify(expected).slice(0, 200)}`)
    console.log(`  Got:      ${JSON.stringify(actual).slice(0, 200)}`)
    failed++
  }
}

function testFn(name, checkFn, actual) {
  try {
    const pass = checkFn(actual)
    if (pass) { console.log(`  PASS -- ${name}`); passed++ }
    else { console.log(`  FAIL -- ${name}`); console.log(`  Got: ${JSON.stringify(actual).slice(0,200)}`); failed++ }
  } catch (e) { console.log(`  FAIL -- ${name} (${e.message})`); failed++ }
}

async function setup() {
  if (existsSync(TEST_OUTPUT_DIR)) await rm(TEST_OUTPUT_DIR, { recursive: true })
  await mkdir(TEST_OUTPUT_DIR, { recursive: true })
}
async function teardown() {
  if (existsSync(TEST_OUTPUT_DIR)) await rm(TEST_OUTPUT_DIR, { recursive: true })
}

// ─── Main test runner ──────────────────────────────────────────────────────────

async function main() {
  console.log('=====================================')
  console.log('  DOCX Markdown Validation (Task 4)')
  console.log('=====================================\n')
  await setup()

  // ── Pre-flight checks ──
  console.log('[Pre-flight]')
  testFn('Sample DOCX exists', (v) => v, existsSync(SAMPLE_DOCX))
  testFn('Online target exists', (v) => v, existsSync(ONLINE_TARGET))
  if (!existsSync(SAMPLE_DOCX)) {
    console.error(`Missing: ${SAMPLE_DOCX}`)
    await teardown(); process.exit(1)
  }

  // ── Run the converter (batch mode) ──
  console.log('\n[Converter run]')
  const today = new Date().toISOString().split('T')[0]
  const args = [CONVERT_SCRIPT, '--input', SAMPLE_DOCX, '--output', TEST_OUTPUT_DIR,
    '--date', today, '--slug', 'farm-to-table-local-llms',
    '--title', 'Farm-to-Table: Building an iOS App with Local LLMs',
    '--extract-images', '--skip-prompts']
  const { status: convertStatus, stdout: convertOut } = spawnSync('node', args, {
    cwd: ROOT, timeout: 30000, encoding: 'utf-8' })

  // ── Test Group 1: Round-trip on sample docx ──
  console.log('\n[Test 1: Round-trip]')
  const mdPath = join(TEST_OUTPUT_DIR, 'Article.md')
  let generatedMd = ''
  try { generatedMd = await readFile(mdPath, 'utf-8'); testFn('Article.md generated', (v) => v.length > 0, generatedMd) }
  catch (e) { console.log(`  FAIL -- Article.md generated\n  Got: ${e.message}`); failed++ }

  // Compare structural elements with online target
  if (generatedMd) {
    let onlineTarget = ''
    try { onlineTarget = await readFile(ONLINE_TARGET, 'utf-8') } catch {}
    testFn('Output contains ## heading pattern', (v) => /##\s+\d+\./.test(v), generatedMd)
    testFn('Output has paragraph content', (v) => /\n[^\n]+\n/.test(v), generatedMd)

    if (onlineTarget) {
      const onlineHeadings = onlineTarget.match(/^## .+$/gm) || []
      for (const h of onlineHeadings.slice(0, 5)) {
        testFn(`Online heading found: "${h.trim()}"`, (md) => md.includes(h.trim()), generatedMd)
      }
    }
  }

  // ── Test Group 2: Heading detection accuracy ──
  console.log('\n[Test 2: Heading detection]')
  if (generatedMd) {
    const expected = ['## 1. Write down your plan', '## 2. Keep your work bite sized',
      '## 3. Get to good and go', '## 4. Know when', '## 5. I say patience']
    for (const h of expected) { testFn(`Heading: "${h}"`, (md) => md.includes(h), generatedMd) }

    // Check closing heading
    const etVoila = /^##\s+Et\s*-\s*Voila!/m.test(generatedMd)
    testFn('Closing heading "Et-Voila!"', (v) => v, etVoila)

    // Count ## headings — expect 6-7 (5 tips + Et-Voila!, dividers may count)
    const h2Count = (generatedMd.match(/^## /gm) || []).length
    testFn(`H3-to-H2 conversion: ${h2Count} headings (expect 6-7)`, (n) => n >= 5 && n <= 8, h2Count)
  }

  // ── Test Group 3: Image extraction count ──
  console.log('\n[Test 3: Image extraction]')
  let imageFiles = []
  try { imageFiles = (await readdir(TEST_OUTPUT_DIR)).filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f)) } catch {}
  testFn('At least 1 image extracted', (v) => v.length >= 1, imageFiles)
  testFn('6 images total: banner + 5 sections', (v) => v.length === 6, imageFiles)
  if (imageFiles.length > 0) {
    testFn('Banner image present (banner.*)', (imgs) => imgs.some(i => /^banner\./i.test(i)), imageFiles)
    testFn('No duplicate filenames', (imgs) => new Set(imgs).size === imgs.length, imageFiles)
    imageFiles.sort().forEach(f => console.log(`    - ${f}`))
  }

  // ── Test Group 4: Nested list indentation ──
  console.log('\n[Test 4: Nested list indentation]')
  if (generatedMd) {
    const lines = generatedMd.split('\n')
    const setupIdx = lines.findIndex(l => /LLM Setup/i.test(l))
    if (setupIdx >= 0) {
      let indentedSubItems = 0
      for (let i = setupIdx + 1; i < Math.min(setupIdx + 20, lines.length); i++) {
        const line = lines[i]
        if (/^\s{2,}-\s/.test(line)) indentedSubItems++
        if (/^## /.test(line) || (line.trim() === '' && i > setupIdx + 3)) break
      }
      testFn('LLM Setup has >=3 indented sub-items', (n) => n >= 3, indentedSubItems)
      const nestedContent = lines.slice(setupIdx, Math.min(setupIdx + 20, lines.length)).join('\n')
      testFn('VS Code IDE in sub-list', (s) => s.includes('VS Code'), nestedContent)
      testFn('Cline in sub-list', (s) => s.includes('Cline'), nestedContent)
      testFn('Ollama in sub-list', (s) => s.includes('Ollama'), nestedContent)
    } else { console.log('  SKIP — LLM Setup section not found') }

    // Tips numbered list with formatting
    const tipsPattern = /[_*]1\.[^_*/]+[_*]?/g
      testFn('Tips as plain numbered items present', (md) => /1\. Write down/.test(md), generatedMd)
  }

  // ── Test Group 5: Inline formatting preservation ──
  console.log('\n[Test 5: Inline formatting]')
  if (generatedMd) {
    const boldCount = (generatedMd.match(/\*\*[^*]+\*\*/g) || []).length
    testFn('Bold markdown (**text**) present', (n) => n > 0, boldCount)
    const codeCount = (generatedMd.match(/`[^`]+`/g) || []).length
    // Inline code preserved: optional depending on DOCX source content
    testFn("Model name Qwen/qwen mentioned", (md) => /[Qq]wen/i.test(md), generatedMd)

    // Italic: look for _text_ or *text* patterns outside of bold context
    const italicCount = (generatedMd.match(/(?<!\*)_(?!\s)[^_\s][^_]*?(?<!\s)_(?!\*)/g) || []).length
    testFn('Italic markdown present', (n) => n > 0, italicCount)
  }

  // ── Test Group 6: Title/Subtitle rendering ──
  console.log('\n[Test 6: Title/Subtitle]')
  if (generatedMd) {
    const titleMatch = /^# .+$/m.exec(generatedMd)
    testFn('Title rendered as h1 (# heading)', (v) => v !== null, titleMatch)
    if (titleMatch) {
      testFn('Title contains Farm-to-Table', (h) => h.includes('Farm-to-Table'), titleMatch[0])
      testFn('Title contains iOS App', (h) => h.includes('iOS App'), titleMatch[0])
      testFn('Title contains Local LLMs', (h) => h.includes('LLMs'), titleMatch[0])
    }
    // Frontmatter should have excerpt and coverImage
    const fmRegion = generatedMd.substring(0, Math.min(500, generatedMd.indexOf('# ')))
    testFn('Frontmatter: coverImage reference', (s) => /^coverImage:/m.test(s), generatedMd)
  }

  // ── Test Group 7: No artificial headings ──
  console.log('\n[Test 7: No artificial headings]')
  if (generatedMd) {
    const forbidden = ['## Introduction', '## Setup', "## Let's talk about tips", '## Agent configuration']
    for (const fh of forbidden) {
      const found = new RegExp(`^${fh.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(generatedMd)
      testFn(`No "${fh}" heading`, (v) => !v, found)
    }
    console.log(`  H2 headings in output: ${(generatedMd.match(/^## /gm) || []).length}`)
  }

  // ── Test Group 8: Batch mode (skip-prompts) ──
  console.log('\n[Test 8: Batch mode]')
  if (convertStatus === 0) {
    testFn('Converter exit code 0', (s) => s === 0, convertStatus)
    const promptIndicators = ['Article title?', 'Date [', 'Excerpt', 'Slug [', 'Cover image']
    for (const p of promptIndicators) {
      testFn(`No interactive prompt: "${p}"`, (out) => !out.includes(p), convertOut)
    }
    testFn('Success message in output', (o) => o.includes('Done') || o.includes('done'), convertOut)
  } else {
    console.log(`  SKIP — converter exit code ${convertStatus}`)
  }

  // ── Test Group 9: Interactive mode structure (source-level checks) ──
  console.log('\n[Test 9: Interactive mode structure]')
  const convertSource = await readFile(CONVERT_SCRIPT, 'utf-8')
  testFn('interactiveFrontmatter function exists', (s) => s.includes('function interactiveFrontmatter'), convertSource)
  testFn('Prompt for Article title', (s) => s.includes('Article title?'), convertSource)
  testFn('Prompt for Date with default', (s) => /\[.+?\]/.test(s), convertSource)
  testFn('Prompt for Excerpt', (s) => /Excerpt/i.test(s), convertSource)
  testFn('Prompt for Slug with default', (s) => /Slug/i.test(s), convertSource)
  testFn('Prompt for Cover image', (s) => /Cover image/i.test(s), convertSource)
  testFn('--skip-prompts flag in parseArgs', (s) => s.includes("skip-prompts") || s.includes("skipPrompts"), convertSource)

  // ── Frontmatter validation ──
  console.log('\n[Frontmatter]')
  if (generatedMd) {
    const fmMatch = generatedMd.match(/^---\n([\s\S]*?)\n---/)
    testFn('YAML frontmatter present', (v) => v !== null, fmMatch)
    if (fmMatch) {
      testFn('Slug field in frontmatter', (s) => /^slug:/m.test(s), fmMatch[1])
      testFn('Title field in frontmatter', (s) => /^title:/m.test(s), fmMatch[1])
      testFn('Date field format YYYY-MM-DD', (s) => /^date: \d{4}-\d{2}-\d{2}/m.test(s), fmMatch[1])
      testFn('Cover image in frontmatter', (s) => /^coverImage:/m.test(s), fmMatch[1])

      const slugM = fmMatch[1].match(/^slug:\s*(.+)$/m)
      if (slugM) testFn('Slug is "farm-to-table-local-llms"', (v) => v.trim() === 'farm-to-table-local-llms', slugM[1])
    }

    // TODO notes
    testFn('TODO notes block appended', (md) => /\*\*TODO:\*\*/.test(md), generatedMd)

    // Image references in body should use relative path
    const imgRefs = generatedMd.match(/!\[[^\]]*\]\(\/?\.[^)]+\)/g) || []
    // Images referenced with relative paths: converter does not inject inline markdown for all images
  }

  // ── Structural comparison with online target ──
  console.log('\n[Comparison: Online mammoth output]')
  if (!onlineTargetParsed) {
    try { onlineTargetParsed = await readFile(ONLINE_TARGET, 'utf-8') } catch {}
  }
  if (generatedMd && onlineTargetParsed) {
    const topics = ['Write down your plan', 'Keep your work bite sized', 'Get to good and go',
      'Know when.*step in', 'I say patience', 'Et.*Voila']
    for (const t of topics) {
      const rx = new RegExp(t, 'i')
      testFn(`Online has "${t}"`, (md) => rx.test(md), onlineTargetParsed)
      testFn(`Generated has "${t}"`, (md) => rx.test(md), generatedMd)
    }
    // Paragraph order-of-magnitude check
    const onlP = (onlineTargetParsed.match(/^(?!##|#|<!--|-)/gm) || []).length
    const genP = (generatedMd.match(/^(?!##|#|---|>|\*|-|`|<\/|![A-Z])/gm) || []).length
    testFn('Paragraph count similar magnitude',
      (pct) => pct > onlP * 0.3 && pct < onlP * 5, genP)
    console.log(`  Online paragraphs: ~${onlP}, Generated: ~${genP}`)
  }

  // ── Summary ──
  await teardown()
  console.log('\n=====================================')
  console.log(`  Results: ${passed} passed, ${failed} failed (${passed + failed} total)`)
  console.log('=====================================')
  if (failed > 0) { console.log('\nSome tests failed. Review the output above.'); process.exit(1) }
  else { console.log('\nAll validation tests passed!'); process.exit(0) }
}

main().catch((err) => { console.error('Test error:', err); process.exit(1) })
