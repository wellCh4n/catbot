import { join } from 'path'
import { readFile, writeFile, access } from 'fs/promises'
import { constants } from 'fs'
import { WORKSPACE_PATH } from '../configs'

export interface ModelSettings {
  provider: string
  apiKey: string
  modelName: string
  baseUrl: string
}

export interface SystemSettings {
  theme: 'system' | 'light' | 'dark'
  language: string
}

export interface ChannelConfig {
  feishu: {
    appId: string
    appSecret: string
    encryptKey?: string
    verificationToken?: string
    port?: number
    enabled?: boolean
  }
  [key: string]: unknown
}

export interface AppConfig {
  model: ModelSettings
  system: SystemSettings
  channel: ChannelConfig
}

const DEFAULT_CONFIG: AppConfig = {
  model: {
    provider: 'openai',
    apiKey: '',
    modelName: 'gpt-4o',
    baseUrl: 'https://api.openai.com/v1'
  },
  system: {
    theme: 'system',
    language: 'zh-CN'
  },
  channel: {
    feishu: {
      appId: '',
      appSecret: '',
      encryptKey: '',
      verificationToken: '',
      port: 3000,
      enabled: false
    }
  }
}

export class SettingsManager {
  private configPath: string

  constructor() {
    this.configPath = join(WORKSPACE_PATH, 'catbot.json')
  }

  async init(): Promise<void> {
    await this.ensureFileExists(this.configPath, JSON.stringify(DEFAULT_CONFIG, null, 2))
  }

  private async ensureFileExists(filePath: string, defaultContent: string): Promise<void> {
    try {
      await access(filePath, constants.F_OK)
    } catch {
      await writeFile(filePath, defaultContent, 'utf-8')
    }
  }

  async read(): Promise<AppConfig> {
    try {
      const content = await readFile(this.configPath, 'utf-8')
      const parsed = JSON.parse(content)
      return { ...DEFAULT_CONFIG, ...parsed }
    } catch (error: unknown) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? (error as { code?: unknown }).code
          : undefined
      if (code === 'ENOENT') {
        await writeFile(this.configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8')
        return DEFAULT_CONFIG
      }
      console.warn('Failed to read or parse catbot.json', error)
      return DEFAULT_CONFIG
    }
  }

  async update(config: AppConfig | string): Promise<void> {
    const content = typeof config === 'string' ? config : JSON.stringify(config, null, 2)
    await writeFile(this.configPath, content, 'utf-8')
  }
}
