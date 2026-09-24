#!/usr/bin/env node
import { load } from 'cheerio'

// paragraphToMarkdown implementation (mirrors convert-docx-to-markdown.mjs)
function paragraphToMarkdown(html) {
  if (!html || !html.trim()) return ''
  let md = html
  let prev = ''
  while (md !== prev) {
    prev = md
    // Bold: <strong>...</strong> or <b>...</b> -> **...**
    md = md.replace(/<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**')
    // Italic: <em>...</em> or <i>...</i> -> *...*
    md = md.replace(/<(?:em|i)\b[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '*$1*')
    // Inline code: <code>...</code> -> `...`
    md = md.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
    // Links with double-quoted href
    md = md.replace(/<a\b[^>]*href="([^"]*?)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    // Links with single-quoted href
    md = md.replace(/<a\b[^>]*href='([^']*?)'[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    // Line breaks
    md = md.replace(/<br\s*\/?>/gi, '\n')
    // Strip any remaining HTML tags
    md = md.replace(/<[^>]+>/g, '')
  }
  md = md.replace(/[ \t]+/g, ' ').replace(/\n+/g, '\n').trim()
  return md
}

let passed = 0
let failed = 0

function test(name, actual, expected) {
  if (actual === expected) {
    console.log('  PASS -- ' + name)
    passed++
  } else {
    console.log('  FAIL -- ' + name)
    console.log('  Expected:\n' + expected.split('\n').map(l => '    ' + l).join('\n'))
    console.log('  Got:\n' + actual.split('\n').map(l => '    ' + l).join('\n'))
    failed++
  }
}

console.log('Test 1: Plain text paragraph')
test('plain text', paragraphToMarkdown('This is a plain paragraph.'), 'This is a plain paragraph.')

console.log('\nTest 2: Bold text (<strong>)')
test('strong tag', paragraphToMarkdown('This is <strong>bold</strong> text.'), 'This is **bold** text.')

console.log('\nTest 3: Bold text (<b>)')
test('b tag', paragraphToMarkdown('This is <b>bold</b> text.'), 'This is **bold** text.')

console.log('\nTest 4: Italic text (<em>)')
test('em tag', paragraphToMarkdown('This is <em>italic</em> text.'), 'This is *italic* text.')

console.log('\nTest 5: Italic text (<i>)')
test('i tag', paragraphToMarkdown('This is <i>italic</i> text.'), 'This is *italic* text.')

console.log('\nTest 6: Inline code (<code>)')
test('code tag', paragraphToMarkdown('Use the <code>qwen3.6</code> model.'), 'Use the `qwen3.6` model.')

console.log('\nTest 7: Link (<a href>)')
test('anchor', paragraphToMarkdown('Check <a href="https://example.com">this link</a> here.'), 'Check [this link](https://example.com) here.')

console.log('\nTest 8: Mixed formatting (bold + italic + code)')
test('mixed b+i+code', paragraphToMarkdown('Use <strong>VS Code</strong>, <em>Cline</em>, and <code>ollama</code>.'), 'Use **VS Code**, *Cline*, and `ollama`.')

console.log('\nTest 9: Nested bold with italic inside')
test('nested b+i', paragraphToMarkdown('<strong>bold with <em>italic inside</em></strong> text.'), '**bold with *italic inside*** text.')

console.log('\nTest 10: Space collapsing')
test('spaces', paragraphToMarkdown('This    has     multiple    spaces.'), 'This has multiple spaces.')

console.log('\nTest 11: Empty/null inputs')
test('empty', paragraphToMarkdown(''), '')
test('null', paragraphToMarkdown(null), '')
test('whitespace', paragraphToMarkdown('   '), '')

console.log('\nTest 12: Mammoth bold title pattern')
test('mammoth title', paragraphToMarkdown('<strong>Farm-to-Table: Building an iOS App with Local LLMs</strong>'), '**Farm-to-Table: Building an iOS App with Local LLMs**')

console.log('\nTest 13: Nested italic+bold (reversed nesting)')
test('nested i+b', paragraphToMarkdown('<em>italic with <strong>bold inside</strong></em> and more.'), '*italic with **bold inside*** and more.')

console.log('\nTest 14: Italic numbered item pattern')
test('italic list', paragraphToMarkdown('<em>1. Write down your plan - and then some</em>'), '*1. Write down your plan - and then some*')

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed (total: ' + (passed + failed) + ')')
process.exit(failed > 0 ? 1 : 0)
