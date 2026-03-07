import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'

interface PersonaModalProps {
  isOpen: boolean
  onClose: () => void
}

export function PersonaModal({ isOpen, onClose }: PersonaModalProps): React.JSX.Element | null {
  const [activeTab, setActiveTab] = useState<'IDENTITY.md' | 'AGENTS.md'>('IDENTITY.md')
  const [fileContent, setFileContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadConfigFile(activeTab)
    }
  }, [isOpen, activeTab])

  const loadConfigFile = async (fileName: string): Promise<void> => {
    try {
      const content = await window.api.readConfigFile(fileName)
      setFileContent(content)
      setOriginalContent(content)
    } catch (error) {
      console.error('Failed to load config file:', error)
    }
  }

  const handleSaveConfig = async (): Promise<void> => {
    if (fileContent === originalContent) return

    setIsSaving(true)
    try {
      const minDelay: Promise<void> = new Promise((resolve) => setTimeout(resolve, 800))
      await Promise.all([window.api.writeConfigFile(activeTab, fileContent), minDelay])
      setOriginalContent(fileContent)
    } catch (error) {
      console.error('Failed to save config file:', error)
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-4xl h-[80vh] border border-gray-200 dark:border-gray-800 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-bold">Agent Configuration</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <div className="w-48 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
            <button
              onClick={() => setActiveTab('IDENTITY.md')}
              className={`w-full text-left px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'IDENTITY.md'
                  ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-l-2 border-blue-600'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              IDENTITY.md
            </button>
            <button
              onClick={() => setActiveTab('AGENTS.md')}
              className={`w-full text-left px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'AGENTS.md'
                  ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-l-2 border-blue-600'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              AGENTS.md
            </button>
          </div>

          {/* Editor Area */}
          <div className="flex-1 flex flex-col bg-white dark:bg-gray-900">
            <div className="flex-1 p-4 overflow-hidden">
              <textarea
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                className="w-full h-full bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white font-mono text-sm rounded-lg p-4 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-transparent resize-none"
                spellCheck={false}
              />
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex justify-end bg-white dark:bg-gray-900">
              <button
                onClick={handleSaveConfig}
                disabled={fileContent === originalContent || isSaving}
                className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                  fileContent === originalContent
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {isSaving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  `Save ${activeTab}`
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
