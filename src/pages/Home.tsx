import { Link } from 'react-router-dom'
import ProfilePhoto from '../components/ProfilePhoto'
import './Page.css'
import './Home.css'

function Home() {
  return (
    <section className="page home">
      <div className="home__hero">
        <ProfilePhoto size="large" className="home__photo" />
        <div className="home__intro">
          <p className="home__eyebrow">Software engineering leader</p>
          <h1 className="home__title">Hey there, I'm Dave</h1>
        </div>
      </div>

      <div className="home__summary">
        <p>
          I've been in the business of software engineering for more than 2 decades, which makes me
          feel old sometimes. I put this site together as a place for me to have some fun,
          experiment, and share things about me. Maybe some day I'll find a better use for it, but
          for now, this works.
        </p>

        <p>
          If you're curious about my professional background, you can peek at my{' '}
          <Link to="/about" className="text-link">
            About Me
          </Link>{' '}
          page for an overview. In summary, I love building apps, and leading and growing engineers who share
          that love.
        </p>

        <p>
          Outside of work, I sometimes build things on my own, including this silly site. I've
          contributed to open source projects I find interesting, and put together my own iOS app
          which you can see on my{' '}
          <Link to="/projects" className="text-link">
            Projects
          </Link>{' '}
          page.
        </p>
      </div>
    </section>
  )
}

export default Home
