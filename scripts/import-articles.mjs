#!/usr/bin/env node

import { readFile, writeFile, mkdir, readdir, stat } from "fs/promises"
import { existsSync } from "fs"
import { resolve, join, basename, dirname, extname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "..")
const RAW_DIR = join(ROOT, "rawArticles")
const ARTICLES_DIR = join(ROOT, "public", "articles")

/** Get the pdf-parse constructor (handles both ESM and CJS exports). */
async function getPdfParse() {
  const mod = await import("pdf-parse")
  return mod.PDFParse || mod.default
}

function slugify(input) {
  return String(input ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function toFrontmatter(fm) {
  const lines = ["---"]
  for (const [key, value] of Object.entries(fm)) {
    if (value === undefined || value === null) continue
    lines.push(key + ': "' + String(value).replace(/"/g, '\\"') + '"')
  }
  lines.push("---")
  return lines.join("\n")
}

function detectHeading(line, index, lines) {
  const trimmed = line.trim()
  if (!trimmed) return 0
  if (/^[A-Z0-9][A-Z0-9\s]{5,74}$/.test(trimmed)) {
    const nl = lines[index + 1] ? lines[index + 1].trim() : ""
    if ((nl.length > 0 && /^[a-z]/.test(nl)) || !nl) return 1
  }
  if (/^(\d+(\.\d+)*)[\s]+.+[:.]\s*$/.test(trimmed)) return 2
  if (trimmed.length > 3 && trimmed.length < 80 && !/^[-*\u2022\d]\s/.test(trimmed)) {
    const nl = lines[index + 1] ? lines[index + 1].trim() : ""
    const anl = lines[index + 2] ? lines[index + 2].trim() : ""
    if (nl === "" && anl.length > 0) return 3
  }
  if (/^[A-Z][A-Z\s]{2,50}:?\s*$/.test(trimmed) && trimmed.split(/\s/).length <= 6) return 2
  if (/^\d+\.\s+[A-Z][a-zA-Z]{2,}$/.test(trimmed)) return 2
  if (trimmed.length < 60 && !trimmed.endsWith(".") && !trimmed.startsWith("-")) {
    const words = trimmed.split(/\s+/)
    if (words.length >= 2 && words.length <= 8) {
      let allCapsWords = 0, titleCaseWords = 0
      for (const w of words) {
        if (/^[A-Z][A-Z\s]{1,}$/.test(w)) allCapsWords++
        else if (/^[A-Z][a-z]/.test(w)) titleCaseWords++
      }
      if (allCapsWords + titleCaseWords === words.length && titleCaseWords >= 2) return 3
    }
  }
  if (/^(NOTE|IMPORTANT|TIP)[\s:.-]+/i.test(trimmed)) return 1
  return 0
}

function applyHeuristics(rawText) {
  const lines = rawText.split("\n")
  const result = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) { result.push(""); continue }
    const hl = detectHeading(trimmed, i, lines)
    if (hl === 1) { result.push("\n## " + trimmed + "\n") }
    else if (hl >= 2) { result.push("\n### " + trimmed + "\n") }
    else { result.push(line) }
  }
  return result.join("\n")
}

async function pdfToMarkdown(pdfBuffer) {
  console.log("  Parsing PDF ...")
  const PDFParse = await getPdfParse()
  const pdfObj = new PDFParse({ data: pdfBuffer })
  const result = await pdfObj
  const rawText = result.text || ""
  if (!rawText?.trim()) throw new Error("PDF appears empty or unreadable.")
  return { text: rawText.trim(), body: applyHeuristics(rawText) }
}

async function processPdf(pdfPath) {
  const pdfName = basename(pdfPath, extname(pdfPath))
  const slug = slugify(pdfName)
  if (!slug) {
    console.warn('  Skipping "' + pdfName + '": could not generate a valid slug.')
    return null
  }

  const articleDir = join(ARTICLES_DIR, slug)
  const mdPath = join(articleDir, "Article.md")

  try {
    const s = await stat(mdPath)
    if (s.isFile()) {
      console.log('  Skipped "' + slug + '" - already imported.')
      return null
    }
  } catch(e) {}

  const pdfBuffer = await readFile(pdfPath)
  console.log('  Converting "' + basename(pdfPath) + '" ...')
  const converted = await pdfToMarkdown(pdfBuffer)

  let title = ""
  for (const ln of converted.text.split("\n")) {
    const t = ln.trim()
    if (t && t.length > 2) { title = t; break }
  }

  const fm = {
    slug,
    title: title || pdfName,
    date: new Date().toISOString().split("T")[0],
    excerpt: "",
    coverImage: "./banner.png",
  }

  const todo = [
    "> **TODO:** Review and refine frontmatter values (slug, title, date, excerpt).",
    "> **TODO:** Save article images (from source document) into this folder.",
    "> **TODO:** Check for any links that need to be converted to Markdown format.",
  ]

  const content = toFrontmatter(fm) + "\n\n" + converted.body.trim() + "\n" + todo.join("\n")

  await mkdir(articleDir, { recursive: true })
  await writeFile(mdPath, content, "utf-8")

  console.log("  Article written to " + mdPath)
  console.log("    Slug:   " + slug)
  console.log("    Title:  " + (title || "(fill in manually)"))
  return slug
}


async function main() {
  console.log("========================================")
  console.log("  Article Importer")
  console.log("========================================")

  if (!existsSync(RAW_DIR)) {
    await mkdir(RAW_DIR, { recursive: true })
    console.log("Created " + RAW_DIR)
    console.log()
    console.log("Drop your PDF files here, then run:")
    console.log("  npm run importArticles")
    process.exit(0)
  }

  if (!existsSync(ARTICLES_DIR)) {
    await mkdir(ARTICLES_DIR, { recursive: true })
  }

  const allFiles = await readdir(RAW_DIR)
  const pdfs = allFiles.filter(f => extname(f).toLowerCase() === ".pdf")

  if (pdfs.length === 0) {
    console.log("No PDF files found in " + RAW_DIR)
    console.log("Drop your article PDFs into the folder and try again.")
    process.exit(0)
  }

  const total = pdfs.length
  let imported = 0
  let skipped = 0
  let errors = 0

  console.log()
  console.log("Found " + total + " PDF file(s) in rawArticles/")
  console.log()

  for (const pdf of pdfs.sort()) {
    const pdfPath = join(RAW_DIR, pdf)
    try {
      const result = await processPdf(pdfPath)
      if (result) imported++
      else skipped++
    } catch (err) {
      errors++
      console.error('  Error processing "' + pdf + '": ' + err.message)
    }
  }

  console.log()
  console.log("========================================")
  console.log("  Import complete")
  console.log("  Imported:  " + imported)
  if (skipped > 0) console.log("  Skipped:   " + skipped + " (already imported)")
  if (errors > 0) console.log("  Errors:    " + errors)
  console.log("========================================")

  if (imported > 0) {
    console.log()
    console.log("Next steps:")
    console.log("  1. Review and edit each Article.md in public/articles/")
    console.log("  2. Add images to the article folder as needed")
    console.log("  3. Run: npm run build")
  }
}

main()

