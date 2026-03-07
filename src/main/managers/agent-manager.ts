import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { join, resolve, isAbsolute, relative } from 'node:path'
import { homedir } from 'node:os'
import Anthropic from '@anthropic-ai/sdk'
import type {
  ContentBlock,
  MessageParam,
  Tool,
  ToolResultBlockParam,
  ToolUseBlock
} from '@anthropic-ai/sdk/resources/messages'
import { PromptManager } from './prompt-manager'
import { SettingsManager } from './settings-manager'
import { SessionManager } from './session-manager'
import { SkillsManager } from './skills-manager'
import { ChatMessage, AgentUpdate } from '../../common/types'
import { SYSTEM_PROMPT } from '../prompts/prompt'
import { WORKSPACE_PATH } from '../configs'

const execAsync = promisify(exec)

export const TOOLS: Tool[] = [
  {
    name: 'bash',
    description: 'Run a shell command.',
    input_schema: {
      type: 'object',
      properties: { command: { type: 'string' } },
      required: ['command']
    }
  },
  {
    name: 'load_skill',
    description: 'Load skill content by skill name.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' }, limit: { type: 'integer' } },
      required: ['name']
    }
  },
  {
    name: 'read_file',
    description: 'Read file contents.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' }, limit: { type: 'integer' } },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Write content to file.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content']
    }
  },
  {
    name: 'edit_file',
    description: 'Replace exact text in file.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_text: { type: 'string' },
        new_text: { type: 'string' }
      },
      required: ['path', 'old_text', 'new_text']
    }
  }
] as unknown as Tool[]

type ToolHandler = (input: unknown) => Promise<string>

export interface AgentManagerOptions {
  promptManager: PromptManager
  settingsManager: SettingsManager
  sessionManager: SessionManager
}

interface AgentLoopOptions {
  client: Anthropic
  model: string
  system: string
  maxTokens?: number
  maxSteps?: number
  onToolUse?: (
    toolName: string,
    input: Record<string, unknown>,
    toolUseId: string
  ) => void | Promise<void>
  onToolResult?: (toolName: string, output: string) => void | Promise<void>
}

export class AgentManager extends EventEmitter {
  private promptManager: PromptManager
  private settingsManager: SettingsManager
  private sessionManager: SessionManager
  private skillsManager: SkillsManager

  constructor(options: AgentManagerOptions) {
    super()
    this.promptManager = options.promptManager
    this.settingsManager = options.settingsManager
    this.sessionManager = options.sessionManager
    this.skillsManager = new SkillsManager()
  }

  async run(messages: ChatMessage[], onUpdate?: (update: AgentUpdate) => void): Promise<string> {
    const startedAt = Date.now()
    try {
      console.log(`[agent-manager] start messages=${messages.length}`)

      // 1. Read Config
      const config = await this.settingsManager.read()
      const { provider, apiKey, baseUrl, modelName } = config.model

      if (!apiKey) {
        throw new Error('API Key is missing in Settings')
      }

      if (provider !== 'anthropic') {
        throw new Error('Agent Loop currently only supports Anthropic provider')
      }

      console.log(
        `[agent-manager] config provider=${provider} model=${modelName || '(default)'} baseUrl=${baseUrl || '(default)'}`
      )

      // 2. Read System Prompt (Identity & Agents)
      const identityPrompt = await this.promptManager.read('IDENTITY.md')
      const agentsPrompt = await this.promptManager.read('AGENTS.md')

      // 3. Initialize Client
      const client = new Anthropic({
        apiKey,
        baseURL: baseUrl || undefined
      })

      // 4. Run Agent Loop

      // Extract user's last message and append to session
      const lastUserMsg = messages[messages.length - 1]
      if (lastUserMsg && lastUserMsg.role === 'user') {
        await this.sessionManager.append(lastUserMsg)
        this.emit('message', lastUserMsg)
      }

      let currentToolMsgId: string | undefined
      let currentToolInput: Record<string, unknown> | undefined

      const skillsSummary = await this.skillsManager.buildSkillsSummary()
      const alwaysSkills = await this.skillsManager.getAlwaysSkills()
      const alwaysSkillsContent = await this.skillsManager.loadSkillsForContext(alwaysSkills)
      const skillsContext = [skillsSummary, alwaysSkillsContent].filter(Boolean).join('\n\n')
      const system = [
        SYSTEM_PROMPT,
        identityPrompt,
        agentsPrompt,
        `# Skills
The following skills extend your capabilities. To use a skill, read its SKILL.md file using the load_skill tool.
Skills with available="false" need dependencies installed first - you can try installing them with apt/brew.
All skill executions must be performed strictly within the directory specified by the <location>{path}</location>.
${skillsContext}`
      ]
        .filter(Boolean)
        .join('\n\n')

      console.log(
        `[agent-manager] system identity=${identityPrompt.length} agents=${agentsPrompt.length} skills_summary=${skillsSummary.length} always_skills=${alwaysSkills.length} always_skills_content=${alwaysSkillsContent.length} total=${system.length}`
      )
      if (process.env.DEBUG_SYSTEM_PROMPT === '1') {
        console.log('System Prompt:', system)
      }

      const finalMessages = await this.executeLoop(messages, {
        client,
        model: modelName || 'claude-3-opus-20240229',
        system,
        maxSteps: 50, // reasonable default
        onToolUse: async (toolName, input, toolUseId) => {
          try {
            const inputKeys = input && typeof input === 'object' ? Object.keys(input) : []
            console.log(
              `[agent-manager] tool_use name=${toolName} id=${toolUseId} input_keys=${inputKeys.join(',') || '(none)'}`
            )

            const id = randomUUID()
            currentToolMsgId = id
            currentToolInput = input
            const timestamp = Date.now()

            const msg: ChatMessage = {
              id,
              role: 'assistant',
              content: `Using tool: ${toolName}`,
              timestamp,
              toolUse: { tool: toolName, input, toolUseId }
            }

            if (onUpdate) {
              const update: AgentUpdate = {
                type: 'tool_use',
                tool: toolName,
                input,
                toolUseId,
                message: msg
              }
              onUpdate(update)
            }
            this.emit('update', {
              type: 'tool_use',
              tool: toolName,
              input,
              toolUseId,
              message: msg
            })

            // Append to session
            await this.sessionManager.append(msg)
          } catch (e) {
            console.error('Failed to send tool_use update', e)
          }
        },
        onToolResult: async (toolName, output) => {
          try {
            console.log(
              `[agent-manager] tool_result name=${toolName} bytes=${Buffer.byteLength(output || '', 'utf-8')} error=${output.startsWith('Tool error')}`
            )

            if (onUpdate) {
              const update: AgentUpdate = {
                type: 'tool_result',
                tool: toolName,
                output,
                id: currentToolMsgId
              }
              onUpdate(update)
            }
            this.emit('update', {
              type: 'tool_result',
              tool: toolName,
              output,
              id: currentToolMsgId
            })

            if (currentToolMsgId && currentToolInput) {
              await this.sessionManager.update(currentToolMsgId, {
                toolUse: { tool: toolName, input: currentToolInput, output }
              })
            }
          } catch (e) {
            console.error('Failed to send tool_result update', e)
          }
        }
      })

      // Return the last message content
      const lastMessage = finalMessages[finalMessages.length - 1]
      if (lastMessage.role === 'assistant') {
        let responseText = ''
        if (typeof lastMessage.content === 'string') {
          responseText = lastMessage.content
        } else if (Array.isArray(lastMessage.content)) {
          const textBlock = (lastMessage.content as ContentBlock[]).find(
            (block) => block.type === 'text'
          )
          responseText =
            textBlock && 'text' in textBlock ? (textBlock as { text: string }).text : ''
        }

        if (responseText) {
          const msg: ChatMessage = {
            id: randomUUID(),
            role: 'assistant',
            content: responseText,
            timestamp: Date.now()
          }
          await this.sessionManager.append(msg)
          this.emit('message', msg)
          console.log(
            `[agent-manager] done duration_ms=${Date.now() - startedAt} response_chars=${responseText.length}`
          )
          return responseText
        }
      }
      console.log(`[agent-manager] done duration_ms=${Date.now() - startedAt} response_chars=0`)
      return ''
    } catch (error: unknown) {
      console.error('Agent Manager Failed:', error)
      const msg = error instanceof Error ? error.message : String(error)
      console.log(`[agent-manager] failed duration_ms=${Date.now() - startedAt} message=${msg}`)
      throw new Error(msg || 'Failed to run agent loop')
    }
  }

  private async executeLoop(
    initialMessages: ChatMessage[],
    opts: AgentLoopOptions
  ): Promise<MessageParam[]> {
    // Convert ChatMessage[] to MessageParam[] for Anthropic
    const messages: MessageParam[] = []

    for (const msg of initialMessages) {
      if (msg.role === 'user') {
        messages.push({ role: 'user', content: msg.content })
      } else if (msg.role === 'assistant') {
        if (msg.toolUse) {
          // Reconstruct Tool Use and Tool Result
          // We use the persisted toolUseId if available, otherwise fallback to deterministic ID
          const toolUseId = msg.toolUse.toolUseId || `call_${msg.id.slice(0, 10)}`

          // 1. Assistant Message with Tool Use
          messages.push({
            role: 'assistant',
            content: [
              { type: 'text', text: msg.content },
              {
                type: 'tool_use',
                id: toolUseId,
                name: msg.toolUse.tool,
                input: msg.toolUse.input
              }
            ]
          })

          // 2. User Message with Tool Result (if output exists)
          if (msg.toolUse.output !== undefined) {
            messages.push({
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: toolUseId,
                  content: msg.toolUse.output,
                  is_error: false // We don't track is_error in ChatMessage yet, assume false
                }
              ]
            })
          }
        } else {
          // Standard Assistant Message
          messages.push({ role: 'assistant', content: msg.content })
        }
      }
    }

    const handlers = this.createToolHandlers(WORKSPACE_PATH)
    const maxSteps = typeof opts.maxSteps === 'number' ? opts.maxSteps : 20
    const maxTokens = typeof opts.maxTokens === 'number' ? opts.maxTokens : 8000

    console.log(`[agentLoop] system=${opts.system}`)
    console.log(`[agentLoop] messages=${JSON.stringify(messages)}`)

    for (let step = 0; step < maxSteps; step++) {
      console.log(`[agentLoop] step=${step + 1}/${maxSteps} messages=${messages.length}`)
      const response = await opts.client.messages.create({
        model: opts.model,
        system: opts.system,
        messages,
        tools: TOOLS,
        max_tokens: maxTokens
      })

      console.log(
        `[agentLoop] step=${step + 1} stop_reason=${response.stop_reason} content_blocks=${response.content.length}`
      )

      messages.push({
        role: 'assistant',
        content: response.content as unknown as MessageParam['content']
      })

      if (response.stop_reason !== 'tool_use') {
        return messages
      }

      const toolNames = (response.content as ContentBlock[])
        .filter((b) => b.type === 'tool_use')
        .map((b) => (b as ToolUseBlock).name)
      console.log(`[agentLoop] step=${step + 1} tool_use=${toolNames.join(',') || '(none)'}`)

      const results: ToolResultBlockParam[] = []
      for (const block of response.content as ContentBlock[]) {
        if (block.type !== 'tool_use') continue
        const toolUse = block as ToolUseBlock
        const handler = handlers[toolUse.name]
        let output: string
        try {
          await opts.onToolUse?.(toolUse.name, toolUse.input as Record<string, unknown>, toolUse.id)
          output = handler ? await handler(toolUse.input) : `Unknown tool: ${toolUse.name}`
          await opts.onToolResult?.(toolUse.name, output)
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          output = `Tool error (${toolUse.name}): ${msg}`
          opts.onToolResult?.(toolUse.name, output)
        }
        results.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: output,
          is_error: output.startsWith('Tool error')
        })
      }
      messages.push({ role: 'user', content: results })
    }

    return messages
  }

  private createToolHandlers(workspacePath: string): Record<string, ToolHandler> {
    const skillsManager = new SkillsManager()

    return {
      bash: async (input: unknown) => {
        const parsed =
          typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
        const command = typeof parsed.command === 'string' ? parsed.command : ''
        if (!command.trim()) return ''

        const DANGEROUS_COMMANDS = ['rm -rf /', 'sudo', 'shutdown', 'reboot', '> /dev/']
        if (DANGEROUS_COMMANDS.some((d) => command.includes(d))) {
          return 'Error: Dangerous command blocked'
        }

        try {
          const { stdout, stderr } = await execAsync(command, {
            cwd: workspacePath,
            timeout: 120_000,
            maxBuffer: 10 * 1024 * 1024
          })
          const output = (stdout || '') + (stderr ? `\n${stderr}` : '')
          const trimmed = output.trim()
          return trimmed ? trimmed.slice(0, 50000) : '(no output)'
        } catch (err) {
          const error = err as Error & {
            code?: string | number
            stdout?: string
            stderr?: string
            killed?: boolean
          }

          if (error.killed || error.code === 'ETIMEDOUT') {
            return 'Error: Timeout (120s)'
          }

          const msg = error.message ? error.message.split('\n')[0] : 'Command failed'
          const output = (error.stdout || '') + (error.stderr || '')
          return `Error: ${msg}\n${output}`.trim().slice(0, 50000)
        }
      },
      load_skill: async (input: unknown) => {
        const parsed =
          typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
        const name = typeof parsed.name === 'string' ? parsed.name : ''
        if (!name.trim()) throw new Error('name is required')

        const content = await skillsManager.loadSkill(name)
        if (!content) throw new Error(`Skill not found: ${name}`)

        const limit = typeof parsed.limit === 'number' ? parsed.limit : 50000
        return this.limitText(content, limit)
      },
      read_file: async (input: unknown) => {
        const parsed =
          typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
        const filePath = this.resolveWorkspacePath(
          typeof parsed.path === 'string' ? parsed.path : '',
          WORKSPACE_PATH,
          WORKSPACE_PATH
        )
        const content = await readFile(filePath, 'utf-8')
        const limit = typeof parsed.limit === 'number' ? parsed.limit : 2000
        return this.limitText(content, limit)
      },
      write_file: async (input: unknown) => {
        const parsed =
          typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
        const filePath = this.resolveWorkspacePath(
          typeof parsed.path === 'string' ? parsed.path : '',
          WORKSPACE_PATH,
          WORKSPACE_PATH
        )
        const content = typeof parsed.content === 'string' ? parsed.content : ''
        await writeFile(filePath, content, 'utf-8')
        return 'ok'
      },
      edit_file: async (input: unknown) => {
        const parsed =
          typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
        const filePath = this.resolveWorkspacePath(
          typeof parsed.path === 'string' ? parsed.path : '',
          WORKSPACE_PATH,
          WORKSPACE_PATH
        )
        const oldText = typeof parsed.old_text === 'string' ? parsed.old_text : ''
        const newText = typeof parsed.new_text === 'string' ? parsed.new_text : ''
        const content = await readFile(filePath, 'utf-8')
        if (!oldText) throw new Error('old_text is required')
        const next = content.includes(oldText) ? content.split(oldText).join(newText) : content
        await writeFile(filePath, next, 'utf-8')
        return content === next ? 'no_change' : 'ok'
      }
    }
  }

  private resolveWorkspacePath(
    inputPath: string,
    workspacePath?: string,
    allowedDir?: string
  ): string {
    // 1. Expand user home directory (~)
    let p = inputPath
    if (p.startsWith('~')) {
      p = join(homedir(), p.slice(1))
    }

    // 2. Resolve absolute path
    let resolvedPath: string
    if (!isAbsolute(p) && workspacePath) {
      resolvedPath = resolve(workspacePath, p)
    } else {
      resolvedPath = resolve(p)
    }

    // 3. Enforce directory restriction
    if (allowedDir) {
      const allowed = resolve(allowedDir)
      const rel = relative(allowed, resolvedPath)
      if (rel.startsWith('..') || isAbsolute(rel)) {
        throw new Error(`Path ${inputPath} is outside allowed directory ${allowedDir}`)
      }
    }

    return resolvedPath
  }

  private limitText(text: string, limit: number): string {
    if (limit <= 0) return ''
    return text.length > limit ? text.slice(0, limit) : text
  }
}
