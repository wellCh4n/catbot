import { NavLink } from 'react-router-dom'
import { MessageSquare, Zap, Settings, Menu, ChevronLeft, Folder } from 'lucide-react'
import { useState } from 'react'

export default function Sidebar(): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false)

  const mainNavItems = [
    { path: '/', icon: MessageSquare, label: 'Chat' },
    { path: '/skills', icon: Zap, label: 'Skills' },
    { path: '/workspace', icon: Folder, label: 'Workspace' }
  ]

  const bottomNavItems = [{ path: '/settings', icon: Settings, label: 'Settings' }]

  return (
    <div
      className={`flex flex-col h-screen bg-gray-100 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-all duration-300 ${
        isExpanded ? 'w-64' : 'w-16'
      }`}
    >
      <div className="flex items-center justify-between p-4 h-16">
        {isExpanded && (
          <span className="font-bold text-xl text-gray-900 dark:text-white">CatBot</span>
        )}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
        >
          {isExpanded ? <ChevronLeft size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <nav className="flex-1 py-4 flex flex-col justify-between">
        <ul className="space-y-2 px-2">
          {mainNavItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center px-3 py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'
                  }`
                }
              >
                <item.icon size={20} className="min-w-[20px]" />
                {isExpanded && (
                  <span className="ml-3 whitespace-nowrap overflow-hidden transition-all duration-300">
                    {item.label}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>

        <ul className="space-y-2 px-2">
          {bottomNavItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center px-3 py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'
                  }`
                }
              >
                <item.icon size={20} className="min-w-[20px]" />
                {isExpanded && (
                  <span className="ml-3 whitespace-nowrap overflow-hidden transition-all duration-300">
                    {item.label}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
