import { experience, summary } from '../data/resume'
import './Resume.css'

function Resume() {
  return (
    <section className="page resume">
      <header className="resume__header">
        <h1>Resume</h1>
        <p className="resume__summary">{summary}</p>
      </header>

      <section className="resume__section" aria-labelledby="experience-heading">
        <h2 id="experience-heading">Experience</h2>
        <ol className="resume__experience-list">
          {experience.map((job) => (
            <li key={`${job.company}-${job.dates}`} className="resume__experience-item">
              <div className="resume__experience-main">
                <h3 className="resume__job-title">{job.title}</h3>
                <p className="resume__company">
                  {job.company}
                  <span className="resume__location"> · {job.location}</span>
                </p>
              </div>
              <time className="resume__dates" dateTime={job.dates}>
                {job.dates}
              </time>
            </li>
          ))}
        </ol>
      </section>

      <section className="resume__section" aria-labelledby="interests-heading">
        <h2 id="interests-heading">Hobbies &amp; Interests</h2>
        <p className="resume__placeholder">
          Coming soon — board games, outdoor activities, and more.
        </p>
      </section>
    </section>
  )
}

export default Resume
