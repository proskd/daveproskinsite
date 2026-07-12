import { experience, hobbies } from '../data/about'
import ProfilePhoto from '../components/ProfilePhoto'
import './Page.css'
import './About.css'

function About() {
  return (
    <section className="page about">
      <header className="about__header">
        <ProfilePhoto size="medium" className="about__photo" />
        <div className="about__intro">
          <h1 className="page__title">About Me</h1>
          <p className="about__summary">
            I'm an experienced engineering leader specializing in building mobile applications on iOS
            and Android. My experience spans a wide variety of technologies and domains. I love working
            on products that real people use and benefit from.
          </p>
        </div>
      </header>

      <section className="page__section" aria-labelledby="experience-heading">
        <h2 id="experience-heading" className="page__section-title">
          Professional Experience
        </h2>
        <ol className="about__experience-list">
          {experience.map((job, index) => (
            <li
              key={`${job.company}-${job.dates}`}
              className="about__experience-item"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="about__experience-marker" aria-hidden="true" />
              <div className="about__experience-content">
                <div className="about__experience-main">
                  <h3 className="about__job-title">{job.title}</h3>
                  <p className="about__company">
                    {job.company}
                    <span className="about__location"> · {job.location}</span>
                  </p>
                </div>
                <time className="about__dates" dateTime={job.dates}>
                  {job.dates}
                </time>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="page__section" aria-labelledby="interests-heading">
        <h2 id="interests-heading" className="page__section-title">
          Hobbies &amp; Interests
        </h2>

        <ul className="about__hobbies-grid">
          {hobbies.map((hobby, index) => (
            <li
              key={hobby.name}
              className={
                hobby.portrait
                  ? 'about__hobby-item about__hobby-item--portrait'
                  : 'about__hobby-item'
              }
              style={{ animationDelay: `${index * 60}ms` }}
            >
              {hobby.image ? (
                <img
                  className="about__hobby-image"
                  src={hobby.image}
                  alt={hobby.imageAlt ?? hobby.name}
                  loading="lazy"
                />
              ) : (
                <div
                  className="about__hobby-placeholder"
                  aria-label={`${hobby.name} — photo coming soon`}
                />
              )}
            </li>
          ))}
        </ul>
      </section>
    </section>
  )
}

export default About
