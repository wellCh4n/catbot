import { useState, useEffect } from 'react'
import { Settings as SettingsIcon, Monitor, Cpu, Loader2, Save, Eye, EyeOff } from 'lucide-react'
import { useTheme } from '../components/theme-provider'

interface ModelSettings {
  provider: string
  apiKey: string
  modelName: string
  baseUrl: string
}

interface SystemSettings {
  theme: 'system' | 'light' | 'dark'
  language: string
}

interface AppSettings {
  model: ModelSettings
  system: SystemSettings
}

const DEFAULT_SETTINGS: AppSettings = {
  model: {
    provider: 'openai',
    apiKey: '',
    modelName: 'gpt-4o',
    baseUrl: 'https://api.openai.com/v1'
  },
  system: {
    theme: 'system',
    language: 'zh-CN'
  }
}

export default function Settings(): React.JSX.Element {
  const { setTheme } = useTheme()
  const [activeTab, setActiveTab] = useState<'model' | 'system'>('model')
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [originalSettings, setOriginalSettings] = useState<string>('')
  const [showApiKey, setShowApiKey] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  useEffect(() => {
    if (!loading) {
      setHasChanges(JSON.stringify(settings) !== originalSettings)
    }
  }, [settings, originalSettings, loading])

  const loadSettings = async (): Promise<void> => {
    try {
      const content = await window.api.readConfigFile('catbot.json')
      const parsed: unknown = JSON.parse(content)
      const parsedRecord =
        typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
      const parsedModel =
        typeof parsedRecord.model === 'object' && parsedRecord.model !== null
          ? (parsedRecord.model as Record<string, unknown>)
          : {}
      const parsedSystem =
        typeof parsedRecord.system === 'object' && parsedRecord.system !== null
          ? (parsedRecord.system as Record<string, unknown>)
          : {}

      const merged: AppSettings = {
        model: { ...DEFAULT_SETTINGS.model, ...(parsedModel as Partial<ModelSettings>) },
        system: { ...DEFAULT_SETTINGS.system, ...(parsedSystem as Partial<SystemSettings>) }
      }
      setSettings(merged)
      setOriginalSettings(JSON.stringify(merged))
    } catch (error) {
      console.error('Failed to load settings:', error)
      // If file doesn't exist or is invalid, use defaults (file created by main process)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      // Artificial delay for better UX
      await Promise.all([
        window.api.writeConfigFile('catbot.json', JSON.stringify(settings, null, 2)),
        new Promise<void>((resolve) => setTimeout(resolve, 800))
      ])
      setOriginalSettings(JSON.stringify(settings))
      setHasChanges(false)
    } catch (error) {
      console.error('Failed to save settings:', error)
    } finally {
      setSaving(false)
    }
  }

  const updateModelSetting = (key: keyof ModelSettings, value: string): void => {
    setSettings((prev) => ({
      ...prev,
      model: { ...prev.model, [key]: value }
    }))
  }

  const updateSystemTheme = (value: SystemSettings['theme']): void => {
    setSettings((prev) => ({
      ...prev,
      system: { ...prev.system, theme: value }
    }))
    setTheme(value)
  }

  const updateSystemLanguage = (value: SystemSettings['language']): void => {
    setSettings((prev) => ({
      ...prev,
      system: { ...prev.system, language: value }
    }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-gray-400" size={24} />
      </div>
    )
  }

  return (
    <div className="flex h-full bg-white dark:bg-gray-900">
      {/* Sidebar */}
      <div className="w-64 border-r border-gray-200 dark:border-gray-800 flex flex-col">
        <div className="p-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <SettingsIcon size={20} />
            Settings
          </h1>
        </div>
        <nav className="flex-1 px-2 space-y-1">
          <button
            onClick={() => setActiveTab('model')}
            className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'model'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <Cpu size={18} />
            Model Settings
          </button>
          <button
            onClick={() => setActiveTab('system')}
            className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'system'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <Monitor size={18} />
            System Settings
          </button>
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-2xl mx-auto space-y-8">
            {activeTab === 'model' ? (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Model Configuration
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Provider
                      </label>
                      <select
                        value={settings.model.provider}
                        onChange={(e) => updateModelSetting('provider', e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:text-white"
                      >
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="ollama">Ollama</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        API Key
                      </label>
                      <div className="relative">
                        <input
                          type={showApiKey ? 'text' : 'password'}
                          value={settings.model.apiKey}
                          onChange={(e) => updateModelSetting('apiKey', e.target.value)}
                          placeholder="sk-..."
                          className="w-full px-3 py-2 pr-10 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Model Name
                      </label>
                      <input
                        type="text"
                        value={settings.model.modelName}
                        onChange={(e) => updateModelSetting('modelName', e.target.value)}
                        placeholder="gpt-4o"
                        className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Base URL
                      </label>
                      <input
                        type="text"
                        value={settings.model.baseUrl}
                        onChange={(e) => updateModelSetting('baseUrl', e.target.value)}
                        placeholder="https://api.openai.com/v1"
                        className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    System Preferences
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Theme
                      </label>
                      <select
                        value={settings.system.theme}
                        onChange={(e) =>
                          updateSystemTheme(e.target.value as SystemSettings['theme'])
                        }
                        className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:text-white"
                      >
                        <option value="system">Follow System</option>
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Language
                      </label>
                      <select
                        value={settings.system.language}
                        onChange={(e) => updateSystemLanguage(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:text-white"
                      >
                        <option value="zh-CN">简体中文</option>
                        <option value="en-US">English</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-8 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex justify-end">
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-all ${
              !hasChanges && !saving
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600'
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
            }`}
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save size={16} />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
