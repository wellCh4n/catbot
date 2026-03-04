import { useState } from 'react'
import { HashRouter, useLocation } from 'react-router-dom'
import Sidebar from './components/sidebar'
import Chat from './pages/chat'
import Skills from './pages/skills'
import Settings from './pages/settings'
import Workspace from './pages/workspace'

function MainLayout(): React.JSX.Element {
  const location = useLocation()
  const [visitedRoutes, setVisitedRoutes] = useState<Set<string>>(new Set([location.pathname]))

  if (!visitedRoutes.has(location.pathname)) {
    setVisitedRoutes((prev) => new Set(prev).add(location.pathname))
  }

  const routes = [
    { path: '/', component: <Chat /> },
    { path: '/skills', component: <Skills /> },
    { path: '/workspace', component: <Workspace /> },
    { path: '/settings', component: <Settings /> }
  ]

  return (
    <div className="flex h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
      <Sidebar />
      <main className="flex-1 overflow-hidden relative">
        {routes.map((route) => {
          // Only render if visited at least once
          if (!visitedRoutes.has(route.path)) return null

          // Toggle visibility based on current path
          const isVisible = location.pathname === route.path

          return (
            <div
              key={route.path}
              style={{ display: isVisible ? 'block' : 'none' }}
              className="h-full w-full"
            >
              {route.component}
            </div>
          )
        })}
      </main>
    </div>
  )
}

function App(): React.JSX.Element {
  return (
    <HashRouter>
      <MainLayout />
    </HashRouter>
  )
}

export default App
