import { Link, NavLink, Outlet } from 'react-router-dom'
import './Layout.css'

const navItems = [
  { to: '/', label: 'Home', end: true },
  { to: '/projects', label: 'Projects' },
  { to: '/about', label: 'About Me' },
] as const

function Layout() {
  return (
    <div className="layout">
      <header className="layout__header">
        <Link className="layout__brand" to="/">
          Dave Proskin
        </Link>
        <nav className="layout__nav" aria-label="Main navigation">
          {navItems.map(({ to, label, ...rest }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                isActive ? 'layout__nav-link layout__nav-link--active' : 'layout__nav-link'
              }
              {...rest}
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="layout__main">
        <Outlet />
      </main>

      <footer className="layout__footer">
        <p>&copy; {new Date().getFullYear()} Dave Proskin</p>
      </footer>
    </div>
  )
}

export default Layout
