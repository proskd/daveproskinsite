import { experience, summary } from '../data/resume'
import './About.css'

function About() {
  return (
    <section className="page about">
      <header className="about__header">
        <h1>About Me</h1>
        <p className="about__summary">{summary}</p>
      </header>

      <section className="about__section" aria-labelledby="experience-heading">
        <h2 id="experience-heading">Experience</h2>
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
        <p className="about__placeholder">
          Coming soon — board games, outdoor activities, and more.
        </p>
      </section>
    </section>
  )
}

export default About
