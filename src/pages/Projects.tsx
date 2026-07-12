import { projects } from '../data/projects'
import './Page.css'
import './Projects.css'

function Projects() {
  return (
    <section className="page projects">
      <header className="page__header">
        <h1 className="page__title">Projects</h1>
        <p className="page__subtitle">
          Personal apps and side projects I've designed and built.
        </p>
      </header>

      <ul className="projects__list">
        {projects.map((project, index) => (
          <li
            key={project.id}
            className="project-card"
            style={{ animationDelay: `${index * 80}ms` }}
          >
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
                    {link.external && (
                      <span className="project-card__link-icon" aria-hidden="true">
                        ↗
                      </span>
                    )}
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
