import { experience } from '../data/about'
import './About.css'

function About() {
  return (
    <section className="page about">
      <header className="about__header">
        <h1>About Me</h1>

        <p className="about__summary">
          I'm an experienced engineering leader specializing in building mobile applications on iOS and Android. My
          experience spans a wide variety of technologies and domains. I love working on products
          that real people use and benefit from.
        </p>
      </header>

      <section className="about__section" aria-labelledby="experience-heading">
        <h2 id="experience-heading">Professional Experience</h2>
        <ol className="about__experience-list">
          {experience.map((job) => (
            <li key={`${job.company}-${job.dates}`} className="about__experience-item">
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
            </li>
          ))}
        </ol>
      </section>

      <section className="about__section" aria-labelledby="interests-heading">
        <h2 id="interests-heading">Hobbies &amp; Interests</h2>

        <ul className="about__hobbies-list">
          <li>
            <span className="about__hobby-name">Taekwondo</span>
            <span className="about__hobby-detail">Black belt, 1st Dan</span>
          </li>
          <li>
            <span className="about__hobby-name">Rock climbing</span>
          </li>
          <li>
            <span className="about__hobby-name">Biking</span>
          </li>
          <li>
            <span className="about__hobby-name">Cooking</span>
          </li>
          <li>
            <span className="about__hobby-name">Video games</span>
            <span className="about__hobby-detail">Especially retro ones</span>
          </li>
          <li>
            <span className="about__hobby-name">Traveling</span>
          </li>
          <li>
            <span className="about__hobby-name">Studying Japanese</span>
          </li>
        </ul>
      </section>
    </section>
  )
}

export default About
