import { useState, useEffect } from 'react'
import { Folder, FileText, File, ArrowLeft, ChevronRight, Home, RefreshCw } from 'lucide-react'

interface FileEntry {
  name: string
  isDirectory: boolean
  path: string
}

export default function Workspace(): React.JSX.Element {
  const [currentPath, setCurrentPath] = useState('')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!window.api.readWorkspaceDir) {
      setError(
        'System update detected. Please restart the application to enable workspace features.'
      )
      return
    }
    loadDirectory(currentPath)
  }, [currentPath])

  const loadDirectory = async (path: string): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const files = await window.api.readWorkspaceDir(path)
      setEntries(files)
    } catch (err) {
      console.error('Failed to load directory:', err)
      setError(
        `Failed to load directory contents: ${err instanceof Error ? err.message : String(err)}`
      )
    } finally {
      setLoading(false)
    }
  }

  const handleEntryDoubleClick = async (entry: FileEntry): Promise<void> => {
    if (entry.isDirectory) {
      // Navigate into directory
      // Use forward slashes for internal path state
      const newPath = currentPath ? `${currentPath}/${entry.name}` : entry.name
      setCurrentPath(newPath)
    } else {
      // Open file
      try {
        await window.api.openFile(entry.path)
      } catch (err) {
        console.error('Failed to open file:', err)
      }
    }
  }

  const handleNavigateUp = (): void => {
    if (!currentPath) return
    const parts = currentPath.split('/')
    parts.pop()
    setCurrentPath(parts.join('/'))
  }

  const handleBreadcrumbClick = (index: number): void => {
    if (index === -1) {
      setCurrentPath('')
      return
    }
    const parts = currentPath.split('/')
    const newPath = parts.slice(0, index + 1).join('/')
    setCurrentPath(newPath)
  }

  const pathParts = currentPath ? currentPath.split('/') : []

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Header / Breadcrumbs */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
        <div className="flex items-center overflow-hidden">
          <button
            onClick={handleNavigateUp}
            disabled={!currentPath}
            className={`p-1 mr-2 rounded-lg transition-colors ${
              !currentPath
                ? 'text-gray-300 dark:text-gray-700 cursor-not-allowed'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <ArrowLeft size={20} />
          </button>

          <div className="flex items-center text-sm overflow-x-auto no-scrollbar">
            <button
              onClick={() => handleBreadcrumbClick(-1)}
              className={`flex items-center hover:bg-gray-200 dark:hover:bg-gray-700 px-2 py-1 rounded transition-colors ${
                !currentPath
                  ? 'font-bold text-gray-900 dark:text-white'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
              title="~/.catbot/workspace"
            >
              <Home size={16} className="mr-1" />
              Workspace
            </button>

            {pathParts.map((part, index) => (
              <div key={`${index}-${part}`} className="flex items-center">
                <ChevronRight size={16} className="text-gray-400 mx-1 shrink-0" />
                <button
                  onClick={() => handleBreadcrumbClick(index)}
                  className={`hover:bg-gray-200 dark:hover:bg-gray-700 px-2 py-1 rounded transition-colors whitespace-nowrap ${
                    index === pathParts.length - 1
                      ? 'font-bold text-gray-900 dark:text-white'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {part}
                </button>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => loadDirectory(currentPath)}
          disabled={loading}
          className={`p-2 ml-2 rounded-lg transition-colors text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 shrink-0 ${
            loading ? 'animate-spin' : ''
          }`}
          title="Refresh"
        >
          <RefreshCw size={20} />
        </button>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex justify-center items-center h-full text-gray-400">Loading...</div>
        ) : error ? (
          <div className="flex justify-center items-center h-full text-red-500">{error}</div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col justify-center items-center h-full text-gray-400">
            <Folder size={48} className="mb-2 opacity-20" />
            <p>Empty folder</p>
          </div>
        ) : (
          <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-1">
            {entries.map((entry) => (
              <div
                key={entry.path}
                onDoubleClick={() => handleEntryDoubleClick(entry)}
                className="group flex flex-col items-center p-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-transparent hover:border-blue-200 dark:hover:border-blue-800 transition-all cursor-pointer select-none"
              >
                <div className="w-8 h-8 mb-1 flex items-center justify-center text-gray-400 group-hover:text-blue-500 transition-colors">
                  {entry.isDirectory ? (
                    <Folder
                      size={32}
                      className="fill-current text-blue-100 dark:text-blue-900/50 stroke-blue-500"
                      strokeWidth={1.5}
                    />
                  ) : entry.name.endsWith('.md') || entry.name.endsWith('.txt') ? (
                    <FileText size={28} strokeWidth={1.5} />
                  ) : (
                    <File size={28} strokeWidth={1.5} />
                  )}
                </div>
                <span className="text-[10px] text-center text-gray-700 dark:text-gray-300 font-medium break-all line-clamp-2 px-0.5 leading-tight">
                  {entry.name}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
