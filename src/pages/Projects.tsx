import { projects } from '../data/projects'
import './Projects.css'

function Projects() {
  return (
    <section className="page projects">
      <header className="projects__header">
        <h1>Projects</h1>
        <p className="projects__intro">
          Personal apps and side projects I&apos;ve designed and built.
        </p>
      </header>

      <ul className="projects__list">
        {projects.map((project) => (
          <li key={project.id} className="project-card">
            <img
              className="project-card__image"
              src={project.image}
              alt={project.imageAlt}
              width={120}
              height={120}
            />
            <div className="project-card__content">
              <h2 className="project-card__title">{project.name}</h2>
              <p className="project-card__description">{project.description}</p>
              <ul className="project-card__tech" aria-label="Technologies used">
                {project.technologies.map((tech) => (
                  <li key={tech}>{tech}</li>
                ))}
              </ul>
              <div className="project-card__links">
                {project.links.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="project-card__link"
                    {...(link.external
                      ? { target: '_blank', rel: 'noopener noreferrer' }
                      : {})}
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default Projects
