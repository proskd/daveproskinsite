/**
 * Parses a markdown string that may contain YAML frontmatter.
 * Returns the extracted frontmatter and the body content separately.
 */
import matter from 'gray-matter'
import type { ArticleFrontmatter } from '../types/article'

export interface ParsedArticle {
  /** YAML frontmatter fields (slug, title, date, excerpt, …) */
  frontmatter: ArticleFrontmatter
  /** Markdown body content (everything after the `---` closing delimiter) */
  content: string
}

/**
 * Parse a raw markdown string. If no frontmatter is detected, returns
 * an empty frontmatter object with the entire input as content.
 */
export function parseArticle(rawMarkdown: string): ParsedArticle {
  const result = matter(rawMarkdown)
  return {
    frontmatter: (result.data ?? {}) as ArticleFrontmatter,
    content: result.content ?? '',
  }
}
