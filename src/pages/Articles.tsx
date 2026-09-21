import { articles } from '../data/articles'
import './Page.css'
import './Articles.css'

function Articles() {
  return (
    <section className="page articles">
      <header className="page__header">
        <h1 className="page__title">Articles</h1>
        <p className="page__subtitle">
          Thoughts, lessons, and experiments from the test kitchen.
        </p>
      </header>

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
    </section>
  )
}

export default Articles
