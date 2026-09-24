#!/usr/bin/env node
/**
 * Post-build script: scans `public/articles/` for Article.md files,
 * extracts YAML frontmatter, and writes `dist/articles-manifest.json`.
 *
 * Run via: node scripts/generate-articles-manifest.mjs
 */

import { readdir, readFile, writeFile, stat } from 'fs/promises'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'
import matter from 'gray-matter'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(__dirname, '..')
const ARTICLES_DIR = join(ROOT, 'public', 'articles')
const MANIFEST_OUT_PUBLIC = join(ROOT, 'public', 'articles-manifest.json')
const MANIFEST_OUT_DIST = join(ROOT, 'dist', 'articles-manifest.json')

/**
 * Write the manifest to both locations:
 *  - public/  → served by Vite dev server (npm run dev)
 *  - dist/    → deployed artifact (production build)
 */
async function writeManifest(manifest) {
  await Promise.all([
    writeFile(MANIFEST_OUT_PUBLIC, JSON.stringify(manifest, null, 2), 'utf-8'),
    writeFile(MANIFEST_OUT_DIST, JSON.stringify(manifest, null, 2), 'utf-8'),
  ])
}

async function scanArticles() {
  const entries = []

  try {
    const folders = await readdir(ARTICLES_DIR)
    for (const folder of folders) {
      const articleMdPath = join(ARTICLES_DIR, folder, 'Article.md')
      const mdStat = await stat(articleMdPath).catch(() => null)
      if (!mdStat?.isFile()) continue

      const raw = await readFile(articleMdPath, 'utf-8')
      const { data } = matter(raw)

      const slug = String(data.slug ?? folder)
      let title = String(data.title ?? '')
      let date = data.date instanceof Date ? data.date.toISOString().split('T')[0] : String(data.date ?? '')
      let excerpt = String(data.excerpt ?? '')
      let coverImage = data.coverImage ? String(data.coverImage) : undefined

      // Skip entries missing required fields
      if (!slug || !title || !date) {
        console.warn(` Skipping "${folder}" — missing required frontmatter (slug/title/date).`)
        continue
      }

      entries.push({ slug, title, date, excerpt, coverImage })
    }
  } catch (err) {
    console.error('Failed to scan articles directory:', err)
    process.exit(1)
  }

  // Sort newest first
  entries.sort((a, b) => b.date.localeCompare(a.date))
  return entries
}

async function main() {
  const manifest = await scanArticles()
  await writeManifest(manifest)
  console.log(`Generated articles-manifest.json with ${manifest.length} article(s).`)
}

main()
