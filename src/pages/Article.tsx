import { useParams } from 'react-router-dom'
import { articleMap } from '../data/articles'
import './Page.css'
import './Article.css'

function Article() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';
  const article = articleMap[slug]

  if (!article) {
    return (
      <section className="page">
        <header className="page__header">
          <h1 className="page__title">Article not found</h1>
          <p className="page__subtitle">
            The article you're looking for doesn't exist.{' '}
            <a href="/articles" className="text-link">
              Back to articles
            </a>
          </p>
        </header>
      </section>
    )
  }

  return (
    <section className="page article-page">
      <header className="article-page__header">
        <time className="article-page__date" dateTime={article.date}>
          {article.date}
        </time>
        <h1 className="article-page__title">{article.title}</h1>
        <p className="article-page__excerpt">{article.excerpt}</p>
      </header>

      <div className="article__body">{article.body}</div>
    </section>
  )
}

export default Article
