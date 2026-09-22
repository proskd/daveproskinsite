import { useEffect, useState } from 'react'
import type { ArticleCardData } from '../types/article'
import './Page.css'
import './Articles.css'

function Articles() {
  const [articles, setArticles] = useState<ArticleCardData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/articles-manifest.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data: ArticleCardData[]) => {
        setArticles(data)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load articles manifest:', err)
        setError('Could not load articles.')
        setLoading(false)
      })
  }, [])

  return (
    <section className="page articles">
      <header className="page__header">
        <h1 className="page__title">Articles</h1>
        <p className="page__subtitle">
          Thoughts, lessons, and experiments from the test kitchen.
        </p>
      </header>

      {loading && <p className="articles__empty">Loading articles…</p>}
      {error && <p className="articles__empty">{error}</p>}

      {!loading && !error && (
        <ul className="articles__list">
          {articles.map((article, index) => (
            <li
              key={article.slug}
              className="article-card"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <div className="article-card__content">
                <time className="article-card__date">{article.date}</time>
                <h2 className="article-card__title">{article.title}</h2>
                <p className="article-card__excerpt">{article.excerpt}</p>
                <a href={`/articles/${article.slug}`} className="text-link article-card__link">
                  Read more
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && articles.length === 0 && (
        <p className="articles__empty">No articles published yet.</p>
      )}
    </section>
  )
}

export default Articles
