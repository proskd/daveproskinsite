import { homeSummary } from '../data/home'
import './Home.css'

function Home() {
  const paragraphs = homeSummary.split('\n\n')

  return (
    <section className="page home">
      <h1>Hi, I&apos;m Dave</h1>
      <div className="home__summary">
        {paragraphs.map((paragraph) => (
          <p key={paragraph.slice(0, 32)}>{paragraph}</p>
        ))}
      </div>
    </section>
  )
}

export default Home
