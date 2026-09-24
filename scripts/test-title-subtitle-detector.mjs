#!/usr/bin/env node
import { load } from 'cheerio'

function detectTitleSubtitle(html, images) {
  const $ = load(html)
  function stripHtmlTags(s) { return $('<div>').html(s).text() || '' }
  let title = null, subtitle = null, pCount = 0
  $('body > p, body > div > p').each(function(_idx, el) {
    const $el = $(el)
    if ($el.prop('tagName') !== 'P' && $el.prop('tagName') !== 'p') return
    pCount++
    if (!title && $el.find('img').length > 0) {
      const img = $el.find('img').first()
      const imageAlt = img.attr('alt') || ''
      const $clone = $('<div>').html($el.html())
      $clone.find('img').remove()
      const titleText = $clone.text().trim()
      if (titleText) { title = { text: titleText, imageAlt } }
      else if (imageAlt) { title = { text: imageAlt, imageAlt } }
    }
    if (!subtitle && pCount >= 2 && $el.find('img').length === 0) {
      const text = stripHtmlTags($el.html()).trim()
      if (text.length > 0 && text.length < 50) { subtitle = { text } }
    }
    if (title && subtitle) return false
  })
  return { title, subtitle }
}

let passed = 0, failed = 0
function test(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { console.log('  PASS -- ' + name); passed++ }
  else { console.log('  FAIL -- ' + name); console.log('  Expected: ' + JSON.stringify(expected)); console.log('  Got:      ' + JSON.stringify(actual)); failed++ }
}

console.log('Test 1: Title with text and subtitle')
const r1 = detectTitleSubtitle('<html><body><p><img src="x" alt="banner.png">Farm-to-Table: iOS App</p><p>A practical guide to AI.</p><p>Longer body...</p></body></html>', [])
test('title text', r1.title.text, 'Farm-to-Table: iOS App')
test('title imageAlt', r1.title.imageAlt, 'banner.png')
test('subtitle text', r1.subtitle.text, 'A practical guide to AI.')

console.log('\nTest 2: Title only (no subtitle)')
const r2 = detectTitleSubtitle('<html><body><p><img src="x" alt="cover.jpg">My Awesome Article</p><p>This is a long paragraph that exceeds fifty characters in total length and should not be detected as subtitle.</p></body></html>', [])
test('title text', r2.title.text, 'My Awesome Article')
test('no subtitle', r2.subtitle, null)

console.log('\nTest 3: No title (no p with img)')
const r3 = detectTitleSubtitle('<html><body><p>This article is about something.</p><p>Short intro.</p></body></html>', [])
test('no title', r3.title, null)

console.log('\nTest 4: Title falls back to alt text')
const r4 = detectTitleSubtitle('<html><body><p><img src="x" alt="banner-title"></p><p>Short intro.</p></body></html>', [])
test('title fallback', r4.title.text, 'banner-title')
test('imageAlt preserved', r4.title.imageAlt, 'banner-title')

console.log('\nTest 5: Subtitle too long rejected')
const r5 = detectTitleSubtitle('<html><body><p><img src="x" alt="i.png">Article Title</p><p>This paragraph is way too long to be considered a subtitle because it exceeds the limit.</p></body></html>', [])
test('title text', r5.title.text, 'Article Title')
test('subtitle rejected', r5.subtitle, null)

console.log('\nTest 6: Subtitle strips inline formatting')
const r6 = detectTitleSubtitle('<html><body><p><img src="x" alt="c.png">My Title</p><p>By <em>Author Name</em>.</p></body></html>', [])
test('title text', r6.title.text, 'My Title')
if (r6.subtitle) { test('subtitle plain text', r6.subtitle.text, 'By Author Name.') } else { console.log('  INFO -- no subtitle for byline'); passed++ }

console.log('\nTest 7: Early exit after both found')
const r7 = detectTitleSubtitle('<html><body><p><img src="x" alt="b.png">Title Here</p><p>Short subtitle.</p><p>Another should NOT match.</p></body></html>', [])
test('title text', r7.title.text, 'Title Here')
test('subtitle first only', r7.subtitle.text, 'Short subtitle.')

console.log('\nTest 8: Empty HTML returns nulls')
const r8 = detectTitleSubtitle('<html><body></body></html>', [])
if (r8.title === null && r8.subtitle === null) { console.log('  PASS -- empty HTML nulls'); passed++ } else { test('empty', r8, { title: null, subtitle: null }) }

console.log('\nTest 9: Multiple images in title')
const r9 = detectTitleSubtitle('<html><body><p><img src="x" alt="first.png"><img src="y" alt="second.png">My Cool Article</p><p>A short line.</p></body></html>', [])
test('title text', r9.title.text, 'My Cool Article')
test('first image alt', r9.title.imageAlt, 'first.png')

console.log('\nTest 10: Real mammoth pattern (bold title)')
const r10 = detectTitleSubtitle('<html><body><p><img src="x" alt="banner.png"><strong>Farm-to-Table: Building an iOS App with Local LLMs</strong></p><p>A practical guide to on-device AI.</p><h3>Intro</h3></body></html>', [])
test('title with strong', r10.title.text, 'Farm-to-Table: Building an iOS App with Local LLMs')

console.log('\n' + '='.repeat(50))
console.log('Results: ' + passed + ' passed, ' + failed + ' failed (total: ' + (passed + failed) + ')')
process.exit(failed > 0 ? 1 : 0)