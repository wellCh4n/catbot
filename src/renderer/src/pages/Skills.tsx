import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'

type SkillListItem = {
  name: string
  description: string
  source: 'workspace' | 'builtin'
}

export default function Skills(): React.JSX.Element {
  const location = useLocation()
  const [skills, setSkills] = useState<SkillListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadSkills = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true)
      setError(null)
      const items = await window.api.listSkills()
      setSkills(items)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg || 'Failed to load skills')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSkills()
  }, [loadSkills])

  useEffect(() => {
    if (location.pathname === '/skills') {
      loadSkills()
    }
  }, [location.pathname, loadSkills])

  const counts = useMemo(() => {
    const workspace = skills.filter((s) => s.source === 'workspace').length
    const builtin = skills.filter((s) => s.source === 'builtin').length
    return { workspace, builtin, total: skills.length }
  }, [skills])

  return (
    <div className="p-8 h-full overflow-auto">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Skills</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            总计 {counts.total}，工作区 {counts.workspace}，内置 {counts.builtin}
          </p>
        </div>
      </div>

      {isLoading && <div className="text-gray-600 dark:text-gray-400 text-sm">Loading...</div>}

      {!isLoading && error && (
        <div className="text-sm text-red-600 dark:text-red-400">Error: {error}</div>
      )}

      {!isLoading && !error && skills.length === 0 && (
        <div className="text-gray-600 dark:text-gray-400 text-sm">暂无技能</div>
      )}

      {!isLoading && !error && skills.length > 0 && (
        <div className="space-y-3">
          {skills.map((skill) => (
            <div
              key={`${skill.source}:${skill.name}`}
              className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 bg-white dark:bg-gray-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-gray-900 dark:text-white truncate">
                      {skill.name}
                    </h2>
                    {skill.source === 'builtin' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200 border border-blue-200 dark:border-blue-900">
                        内置
                      </span>
                    )}
                  </div>
                  {skill.description ? (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {skill.description}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">无描述</p>
                  )}
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-500 shrink-0">
                  {skill.source === 'workspace' ? 'workspace' : 'builtin'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
