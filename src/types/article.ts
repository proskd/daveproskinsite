/**
 * Shared TypeScript types for the Markdown-based article system.
 */

/**
 * Fields available on each card in the articles listing page (from manifest).
 */
export interface ArticleCardData {
  slug: string
  title: string
  date: string // ISO 8601 YYYY-MM-DD
  excerpt: string
  coverImage?: string // Optional filename inside the article folder
}

/**
 * YAML frontmatter as it appears in an Article.md file.
 * Extends ArticleCardData with any extra keys gray-matter might expose.
 */
export interface ArticleFrontmatter extends ArticleCardData {
  [key: string]: unknown
}
