#!/usr/bin/env node

/**
 * Batch import script: loops over .docx files in rawArticles/ and delegates
 * conversion to convert-docx-to-markdown.mjs via subprocess.
 * Mirrors import-articles.mjs (PDF pipeline) but specialized for DOCX source docs.
 */

import { readdir, stat } from "fs/promises"
import { existsSync } from "fs"
import { resolve, join, basename, extname } from "path"
import { spawn } from "child_process"

const __dirname = import.meta.dirname ?? new URL(".", import.meta.url).pathname
const ROOT = resolve(__dirname, "..")
const RAW_DIR = join(ROOT, "rawArticles")
const ARTICLES_DIR = join(ROOT, "public", "articles")
const CONVERT_SCRIPT = join(__dirname, "convert-docx-to-markdown.mjs")

/** Simple slugify — the convert script also handles this, but we use it for dir checks. */
function slugify(input) {
  return String(input ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

/**
 * Process one DOCX by delegating to convert-docx-to-markdown.mjs via subprocess.
 * Returns the slug on success, null if skipped (already imported).
 */
async function processDocx(docxPath) {
  const docxName = basename(docxPath, extname(docxPath))
  const slug = slugify(docxName)
  if (!slug) {
    console.warn("  Skipping \"" + docxName + "\": could not generate a valid slug.")
    return null
  }

  const articleDir = join(ARTICLES_DIR, slug)

  // Skip if already imported (Article.md exists)
  try {
    await stat(join(articleDir, "Article.md"))
    console.log("  Skipped \"" + slug + "\" - already imported.")
    return null
  } catch (e) {}

  // Build args for convert script in batch mode
  const today = new Date().toISOString().split("T")[0]
  const args = [CONVERT_SCRIPT, "--input", docxPath, "--output", articleDir, "--date", today, "--slug", slug, "--extract-images", "--skip-prompts"]

  console.log("  Processing \"" + docxName + "\" ...")

  // Spawn convert script; inherit stdio so user sees progress/output
  await new Promise((resolve, reject) => {
    const child = spawn("node", args, { stdio: "inherit" })
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error("convert exited with code " + code)))
    child.on("error", reject)
  })

  return slug
}

async function main() {
  console.log("========================================")
  console.log("  DOCX Article Importer")
  console.log("========================================")

  if (!existsSync(RAW_DIR)) {
    await (await import("fs/promises")).mkdir(RAW_DIR, { recursive: true })
    console.log("Created " + RAW_DIR)
    console.log()
    console.log("Drop your DOCX files here, then run:")
    console.log("  npm run importDocx")
    process.exit(0)
  }

  if (!existsSync(ARTICLES_DIR)) {
    await (await import("fs/promises")).mkdir(ARTICLES_DIR, { recursive: true })
  }

  const allFiles = await readdir(RAW_DIR)
  const docxs = allFiles.filter((f) => extname(f).toLowerCase() === ".docx")

  if (docxs.length === 0) {
    console.log("No DOCX files found in " + RAW_DIR)
    console.log("Drop your article DOCX files into the folder and try again.")
    process.exit(0)
  }

  const total = docxs.length
  let imported = 0, skipped = 0, errors = 0

  console.log()
  console.log("Found " + total + " DOCX file(s) in rawArticles/")
  console.log()

  for (const docx of docxs.sort()) {
    const docxPath = join(RAW_DIR, docx)
    try {
      const result = await processDocx(docxPath)
      if (result) imported++
      else skipped++
    } catch (err) {
      errors++
      console.error("  Error processing \"" + docx + "\": " + err.message)
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
    console.log("  1. Review each Article.md in public/articles/")
    console.log("  2. Add images to article folders as needed")
    console.log("  3. Run: npm run build")
  }
}

main()