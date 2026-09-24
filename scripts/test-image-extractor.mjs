#!/usr/bin/env node
import { mkdir, writeFile, rm, readFile } from "fs/promises"
import { existsSync } from "fs"
import { join } from "path"

async function writeExtractedImages(images, outputDir) {
  const written = []
  const seenB64 = new Set()
  for (let i = 0; i < images.length; i++) {
    const img = images[i]
    let b64Key
    if (img.buffer) { b64Key = img.buffer.toString("base64") }
    else if (img.base64) { b64Key = img.base64 }
    else { continue }
    if (seenB64.has(b64Key)) continue
    seenB64.add(b64Key)
    const ext = img.mimeType.split("/")[1] || "png"
    let filename
    if (i === 0) { filename = `banner.${ext}` }
    else {
      const altMatch = img.alt?.match(/section(\d+)\./)
      if (altMatch) { filename = `section${altMatch[1]}.${ext}` }
      else { filename = `image-${i}.${ext}` }
    }
    while (written.some(w => w.filename === filename)) { filename = `${filename}-copy` }
    const fullPath = join(outputDir, filename)
    const writeBuffer = img.buffer || Buffer.from(b64Key, "base64")
    await writeFile(fullPath, writeBuffer)
    written.push({ filename, path: fullPath, originalAlt: img.alt })
  }
  return written
}

let passed = 0, failed = 0
const testDir = "/tmp/test-img-ex-" + Date.now()
function test(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { console.log("  PASS -- " + name); passed++ }
  else { console.log("  FAIL -- " + name); console.log("  Expected: " + JSON.stringify(expected)); console.log("  Got:      " + JSON.stringify(actual)); failed++ }
}
function testEquals(name, actual, expected) {
  if (actual === expected) { console.log("  PASS -- " + name); passed++ }
  else { console.log("  FAIL -- " + name); console.log("  Expected: " + JSON.stringify(expected)); console.log("  Got:      " + JSON.stringify(actual)); failed++ }
}
function mb(str) { return Buffer.from(str, "utf-8") }
async function setup() { if (existsSync(testDir)) await rm(testDir, { recursive: true }); await mkdir(testDir, { recursive: true }) }
async function teardown() { if (existsSync(testDir)) await rm(testDir, { recursive: true }) }

async function runTests() {
  await setup()
  console.log("Test 1: First unique image gets banner name")
  const r1 = await writeExtractedImages([{ buffer: mb("fake1"), mimeType: "image/png", alt: "" }], testDir)
  test("filename is banner.png", r1[0].filename, "banner.png")
  test("path contains output dir", r1[0].path.includes(testDir), true)

  console.log("\nTest 2: Alt-text section3 pattern yields section3.jpg")
  const r2 = await writeExtractedImages([
    { buffer: mb("banner"), mimeType: "image/png", alt: "" },
    { buffer: mb("section"), mimeType: "image/jpg", alt: "section3.something" }
  ], testDir)
  test("second image is section3.jpg", r2[1].filename, "section3.jpg")

  console.log("\nTest 3: Non-section alt falls back to image-N.ext")
  const r3 = await writeExtractedImages([
    { buffer: mb("banner2"), mimeType: "image/png", alt: "" },
    { buffer: mb("other"), mimeType: "image/jpg", alt: "random-name" }
  ], testDir)
  test("non-section alt -> image-1.jpg", r3[1].filename, "image-1.jpg")

  console.log("\nTest 4: Duplicate images are deduplicated")
  const buf = mb("duplicate-content")
  const r4 = await writeExtractedImages([
    { buffer: buf, mimeType: "image/png", alt: "" },
    { buffer: buf, mimeType: "image/png", alt: "" },
    { buffer: mb("unique-3"), mimeType: "image/jpg", alt: "section5.foo" }
  ], testDir)
  testEquals("only 2 written (1 deduped)", r4.length, 2)
  test("first is banner.png", r4[0].filename, "banner.png")
  test("third uses alt pattern", r4[1].filename, "section5.jpg")

  console.log("\nTest 5: Cross-format dedup (buffer vs base64)")
  const b64 = mb("b64test").toString("base64")
  const r5 = await writeExtractedImages([
    { base64: b64, mimeType: "image/png", alt: "" },
    { buffer: Buffer.from(b64, "base64"), mimeType: "image/png", alt: "" }
  ], testDir)
  testEquals("1 written (deduped across formats)", r5.length, 1)

  console.log("\nTest 6: Duplicate alt-text causes filename collision → -copy suffix")
  // Two different images both with "section3." pattern would want the same filename
  const r6 = await writeExtractedImages([
    { buffer: mb("a"), mimeType: "image/png", alt: "" },           // i=0 → banner.png
    { buffer: mb("b1"), mimeType: "image/jpg", alt: "section3.foo" },  // i=1 → section3.jpg
    { buffer: mb("b2"), mimeType: "image/png", alt: "section3.different" }  // i=2, ext=png → section3.png (different from jpg)
  ], testDir)
  test("second image is section3.jpg", r6[1].filename, "section3.jpg")
  test("third image is section3.png (ext differs)", r6[2].filename, "section3.png")

  console.log("\nTest 7: Multiple same-section collisions each get unique -copy suffixes")
  // All have i > 0 and matching section pattern → they collide on section3.jpg
  const r7 = await writeExtractedImages([
    { buffer: mb("x1"), mimeType: "image/jpg", alt: "" },            // i=0 → banner.jpg (not a collision candidate)
    { buffer: mb("x2"), mimeType: "image/jpg", alt: "section3.a" },  // i=1 → section3.jpg
    { buffer: mb("x3"), mimeType: "image/jpg", alt: "section3.b" },  // i=2 → section3.jpg-copy (collision)
    { buffer: mb("x4"), mimeType: "image/jpg", alt: "section3.c" }   // i=3 → section3.jpg-copy-copy
  ], testDir)
  test("first is banner.jpg (i===0 overrides alt)", r7[0].filename, "banner.jpg")
  test("second uses section pattern", r7[1].filename, "section3.jpg")
  test("third collision → section3.jpg-copy", r7[2].filename, "section3.jpg-copy")
  test("fourth collision → section3.jpg-copy-copy", r7[3].filename, "section3.jpg-copy-copy")

  console.log("\nTest 8: Empty input returns empty output")
  const r8 = await writeExtractedImages([], testDir)
  testEquals("empty result for empty input", r8.length, 0)

  console.log("\nTest 9: Written files exist on disk with correct content")
  const r9 = await writeExtractedImages([{ buffer: mb("file-exists-test-123"), mimeType: "image/png", alt: "" }], testDir)
  const readBack = await readFile(r9[0].path)
  testEquals("written file content matches input", readBack.toString(), "file-exists-test-123")

  console.log("\nTest 10: Missing MIME type defaults to png")
  const r10 = await writeExtractedImages([{ buffer: mb("no-mime"), mimeType: "invalid", alt: "" }], testDir)
  test("defaults to banner.png", r10[0].filename, "banner.png")

  console.log("\nTest 11: Cross-format dedup with real image signatures")
  const pngSig = Buffer.from([0x89, 0x50, 0x4E, 0x47]).toString("base64")
  const r11 = await writeExtractedImages([
    { base64: pngSig, mimeType: "image/png", alt: "" },
    { buffer: Buffer.from(pngSig, "base64"), mimeType: "image/png", alt: "dup" },
    { base64: Buffer.from([0xFF, 0xD8, 0xFF]).toString("base64"), mimeType: "image/jpg", alt: "section2.bar" }
  ], testDir)
  testEquals("2 unique images (1 deduped)", r11.length, 2)
  test("first is banner.png", r11[0].filename, "banner.png")
  test("third uses section pattern", r11[1].filename, "section2.jpg")

  console.log("\n" + "=".repeat(50))
  console.log(`Results: ${passed} passed, ${failed} failed (total: ${passed + failed})`)
  await teardown()
  process.exit(failed > 0 ? 1 : 0)
}

runTests().catch(err => { console.error(err); process.exit(1) })
