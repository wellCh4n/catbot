import { ipcMain } from 'electron'
import { SkillsManager } from '../managers/skills-manager'

export interface SkillListItem {
  name: string
  description: string
  source: 'workspace' | 'builtin'
}

export function registerSkillsHandlers(workspacePath: string): void {
  const skillsManager = new SkillsManager(workspacePath)

  ipcMain.handle('list-skills', async (_event, opts?: { filterUnavailable?: boolean }) => {
    const filterUnavailable =
      typeof opts?.filterUnavailable === 'boolean' ? opts.filterUnavailable : false
    const skills = await skillsManager.listSkills(filterUnavailable)

    const items: SkillListItem[] = []
    for (const skill of skills) {
      const meta = await skillsManager.getSkillMetadata(skill.name)
      items.push({
        name: skill.name,
        description: meta?.description ?? '',
        source: skill.source
      })
    }

    items.sort((a, b) => {
      if (a.source !== b.source) return a.source === 'workspace' ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    return items
  })
}
