#!/usr/bin/env node
/**
 * Unit tests for Task 1e: convertList function
 * Tests both unordered (ul) and ordered (ol) list conversion with nesting.
 * Run: node scripts/test-convert-list.mjs
 */

import { load } from 'cheerio'

// ── ConvertList implementation (mirrors scripts/convert-docx-to-markdown.mjs) ─

/**
 * Recursively convert a <ul> or <ol> DOM element into indented Markdown list text.
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

// ── Test runner helpers ──────────────────────────────────────────────────────

let passed = 0
let failed = 0

function test(name, actual, expected) {
  if (actual === expected) {
    console.log(`  ✅ PASS — ${name}`)
    passed++
  } else {
    console.log(`  ❌ FAIL — ${name}`)
    console.log(`  Expected:\n${expected.split('\n').map(l => '    ' + l).join('\n')}`)
    console.log(`  Got:\n${actual.split('\n').map(l => '    ' + l).join('\n')}`)
    failed++
  }
}

// ── Test suites ───────────────────────────────────────────────────────────────

console.log('Test 1: Unordered nested list (Setup list pattern)')
{
  const html = `<ul>
    <li><p>Macbook Pro 2021 M1 Max, 64GB RAM</p></li>
    <li><p>LLM Setup
      <ul>
        <li><p>VS Code IDE</p></li>
        <li><p>Cline</p></li>
        <li><p>Ollama running the models</p></li>
        <li><p>qwen3.6:35b-a3b-q8_0</p></li>
      </ul>
    </p></li>
  </ul>`
  const $ = load(html)
  const result = convertList($('body').children()[0], 0)
  const expected = `- Macbook Pro 2021 M1 Max, 64GB RAM
- LLM Setup
  - VS Code IDE
  - Cline
  - Ollama running the models
  - qwen3.6:35b-a3b-q8_0`
  test('unordered nested list', result, expected)
}

console.log('\nTest 2: Ordered list with nested unordered list')
{
  const html = `<ol>
    <li><p>Write down your plan</p></li>
    <li><p>Keep work bite-sized
      <ul>
        <li><p>Small stories</p></li>
        <li><p>Milestones</p></li>
      </ul>
    </p></li>
    <li><p>Get to good and go</p></li>
  </ol>`
  const $ = load(html)
  const result = convertList($('body').children()[0], 0)
  const expected = `1. Write down your plan
2. Keep work bite-sized
  - Small stories
  - Milestones
3. Get to good and go`
  test('ordered with nested unordered', result, expected)
}

console.log('\nTest 3: Deeply nested list (3 levels, mixed ul/ol)')
{
  const html = `<ul>
    <li><p>Level 1 item A</p>
      <ul>
        <li><p>Level 2 item B
          <ol>
            <li><p>Level 3 item C.1</p></li>
            <li><p>Level 3 item C.2</p></li>
          </ol>
        </p></li>
      </ul>
    </li>
  </ul>`
  const $ = load(html)
  const result = convertList($('body').children()[0], 0)
  const expected = `- Level 1 item A
  - Level 2 item B
    1. Level 3 item C.1
    2. Level 3 item C.2`
  test('3-level mixed nesting', result, expected)
}

console.log('\nTest 4: Empty list')
{
  const $ = load('<ul></ul>')
  const result = convertList($('body').children()[0], 0)
  test('empty list returns empty string', result, '')
}

console.log('\nTest 5: Simple flat unordered list')
{
  const html = `<ul>
    <li><p>First item</p></li>
    <li><p>Second item</p></li>
    <li><p>Third item</p></li>
  </ul>`
  const $ = load(html)
  const result = convertList($('body').children()[0], 0)
  const expected = `- First item
- Second item
- Third item`
  test('flat unordered', result, expected)
}

console.log('\nTest 6: Simple flat ordered list')
{
  const html = `<ol>
    <li><p>First step</p></li>
    <li><p>Second step</p></li>
  </ol>`
  const $ = load(html)
  const result = convertList($('body').children()[0], 0)
  const expected = `1. First step
2. Second step`
  test('flat ordered', result, expected)
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\nResults: ${passed} passed, ${failed} failed (total: ${passed + failed})`)
process.exit(failed > 0 ? 1 : 0)
