import { NavLink } from 'react-router-dom'
import { MessageSquare, Zap, Settings, Menu, ChevronLeft, Folder, Radio } from 'lucide-react'
import { useState } from 'react'

export default function Sidebar(): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false)

  const mainNavItems = [
    { path: '/', icon: MessageSquare, label: 'Chat' },
    { path: '/skills', icon: Zap, label: 'Skills' },
    { path: '/workspace', icon: Folder, label: 'Workspace' },
    { path: '/channels', icon: Radio, label: 'Channel' }
  ]

  const bottomNavItems = [{ path: '/settings', icon: Settings, label: 'Settings' }]

  return (
    <div
      className={`flex flex-col h-full bg-gray-100 dark:bg-gray-800 transition-all duration-300 ${
        isExpanded ? 'w-42' : 'w-14'
      }`}
    >
      <nav className="flex-1 pb-2 flex flex-col justify-between">
        <ul className="space-y-2 px-2">
          <li>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className={`w-full flex items-center h-10 ${
                isExpanded ? 'justify-between px-3' : 'justify-center px-1'
              } rounded-lg transition-colors text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer`}
            >
              {isExpanded ? (
                <>
                  <span className="font-bold text-xl text-gray-900 dark:text-white">CatBot</span>
                  <ChevronLeft size={20} />
                </>
              ) : (
                <Menu size={20} />
              )}
            </button>
          </li>
          {mainNavItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center h-10 ${isExpanded ? 'px-3' : 'justify-center px-1'} rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
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
                  `flex items-center h-10 ${isExpanded ? 'px-3' : 'justify-center px-1'} rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
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
