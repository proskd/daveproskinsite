import React from 'react'
import ReactDOMServer from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize from 'rehype-sanitize'
import matter from 'gray-matter'
import { readFileSync } from 'fs'

const raw = readFileSync('public/articles/farm-to-table-local-llms/Article.md', 'utf-8')
const result = matter(raw)
const content = result.content

console.log('=== RAW CONTENT (first 300 chars) ===')
console.log(content.substring(0, 300))
console.log('\n=== REACT-MARKDOWN V10 RENDER TEST ===')

try {
  // Test 1: Minimal render without plugins
  const html1 = ReactDOMServer.renderToStaticMarkup(
    React.createElement(ReactMarkdown, null, content)
  )
  console.log('Test 1 (no plugins): HTML length =', html1.length)
  console.log('Has <p>:', html1.includes('<p>'))
  console.log('First render:', html1.substring(0, 400))

  // Test 2: With rehype-sanitize only
  const html2 = ReactDOMServer.renderToStaticMarkup(
    React.createElement(ReactMarkdown, { rehypePlugins: [rehypeSanitize] }, content)
  )
  console.log('\nTest 2 (rehypeSanitize only): HTML length =', html2.length)
  console.log('Has <p>:', html2.includes('<p>'))

  // Test 3: With both plugins
  const html3 = ReactDOMServer.renderToStaticMarkup(
    React.createElement(ReactMarkdown, { rehypePlugins: [[rehypeHighlight], [rehypeSanitize]] }, content)
  )
  console.log('\nTest 3 (both plugins): HTML length =', html3.length)
  console.log('Has <p>:', html3.includes('<p>'))

  // Test 4: Component overrides
  const html4 = ReactDOMServer.renderToStaticMarkup(
    React.createElement(ReactMarkdown, {
      rehypePlugins: [[rehypeHighlight], [rehypeSanitize]],
      components: {
        h1: ({ children }) => {
          console.log('h1 children type:', typeof children, Array.isArray(children) ? 'array len=' + children.length : '')
          return React.createElement('h2', null, children)
        },
      },
    }, content)
  )
  console.log('\nTest 4 (with component overrides): HTML length =', html4.length)
  console.log('Has <p>:', html4.includes('<p>'))

} catch (err) {
  console.error('ERROR:', err.message)
  console.error(err.stack)
}
