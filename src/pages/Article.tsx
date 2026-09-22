import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize from 'rehype-sanitize'
import { parseArticle } from '../utils/articleParser'
import type { ArticleFrontmatter } from '../types/article'
import './Page.css'
import './Article.css'

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; frontmatter: ArticleFrontmatter; content: string }

function Article() {
  const slug = useParams<{ slug: string }>().slug ?? ''
  const [state, setState] = useState<State>(slug ? { kind: 'loading' } : { kind: 'error', message: 'not-found' })

  useEffect(() => {
    if (!slug) return

    // Try the new Markdown-based path first
    fetch(`/articles/${slug}/Article.md`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`)
        if (res.status === 404) throw new Error('not-found')
        const text = await res.text()
        return text
      })
      .then((text) => {
        if (!text) throw new Error('empty-article')
        const parsed = parseArticle(text)
        setState({ kind: 'success', frontmatter: parsed.frontmatter, content: parsed.content })
      })
      .catch(() => {
        // Fall back to old JSX-based article map (for backward compat during transition)
        import('../data/articles')
          .then((mod) => {
            const article = mod.articleMap[slug]
            if (article) {
              setState({ kind: 'success', frontmatter: { slug, title: article.title, date: article.date, excerpt: article.excerpt }, content: '' })
            } else {
              setState({ kind: 'error', message: 'not-found' })
            }
          })
          .catch(() => setState({ kind: 'error', message: 'not-found' }))
      })
  }, [slug])

  // ── Loading ───────────────────────────────────────────────────────
  if (state.kind === 'loading') {
    return (
      <section className="page article-page">
        <header className="article-page__header">
          <h1 className="article-page__title">Loading…</h1>
        </header>
      </section>
    )
  }

  // ── Error / Not Found ────────────────────────────────────────────
  if (state.kind === 'error') {
    return (
      <section className="page">
        <header className="page__header">
          <h1 className="page__title">Article not found</h1>
          <p className="page__subtitle">
            The article you&apos;re looking for doesn&apos;t exist.{' '}
            <Link to="/articles" className="text-link">
              Back to articles
            </Link>
          </p>
        </header>
      </section>
    )
  }

  // ── Success ───────────────────────────────────────────────────────
  const { frontmatter, content } = state
  const coverImage = frontmatter.coverImage as string | undefined

  // gray-matter parses YYYY-MM-DD dates as JS Date objects; normalize to ISO string
  const dateRaw = frontmatter.date
  const fmDate = typeof dateRaw === 'string'
    ? dateRaw
    : new Date(dateRaw as any).toISOString().split('T')[0]
  const fmTitle = String(frontmatter.title)
  const fmExcerpt = String(frontmatter.excerpt)

  return (
    <section className="page article-page">
      <header className="article-page__header">
        <time className="article-page__date" dateTime={fmDate}>
          {fmDate}
        </time>
        <h1 className="article-page__title">{fmTitle}</h1>
        <p className="article-page__excerpt">{fmExcerpt}</p>
      </header>

      {coverImage && (
        <img
          src={`/articles/${slug}/${coverImage}`}
          alt={String(frontmatter.title)}
          className="article-page__cover"
        />
      )}

      <div className="article__body">
        <ReactMarkdown
          rehypePlugins={[rehypeHighlight, rehypeSanitize]}
          components={{
            h1: ({ children }) => {
              const id = children?.toString().trim().toLowerCase().replace(/\s+/g, '-')
              return (
                <h2 id={id} className="article__heading-h2">
                  {children}
                </h2>
              )
            },
            h2: ({ children }) => {
              const id = children?.toString().trim().toLowerCase().replace(/\s+/g, '-')
              return (
                <h3 id={id} className="article__heading-h3">
                  {children}
                </h3>
              )
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </section>
  )
}

export default Article
