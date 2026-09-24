import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Projects from './pages/Projects'
import About from './pages/About'
import PrivacyPolicy from './pages/PrivacyPolicy'
import Articles from './pages/Articles'
import Article from './pages/Article'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="projects" element={<Projects />} />
        <Route path="about" element={<About />} />
        <Route path="privacy-policy-dsa" element={<PrivacyPolicy />} />
        <Route path="articles" element={<Articles />} />
        <Route path="articles/:slug" element={<Article />} />
      </Route>
    </Routes>
  )
}

export default App
