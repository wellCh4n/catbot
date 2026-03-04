import { ipcMain, BrowserWindow } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { join, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import type {
  ContentBlock,
  MessageParam,
  Tool,
  ToolResultBlockParam,
  ToolUseBlock
} from '@anthropic-ai/sdk/resources/messages'
import { SystemPromptManager } from '../managers/system-prompt-manager'
import { SettingsManager } from '../managers/settings-manager'
import { SessionManager } from '../managers/session-manager'
import { ChatMessage, AgentUpdate } from '../../common/types'
import { SYSTEM_PROMPT } from '../prompts/prompt'

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

export interface AgentLoopOptions {
  client: Anthropic
  model: string
  system: string
  workspacePath: string
  maxTokens?: number
  maxSteps?: number
  onToolUse?: (toolName: string, input: unknown, toolUseId: string) => void | Promise<void>
  onToolResult?: (toolName: string, output: string) => void | Promise<void>
}

function resolveWorkspacePath(workspacePath: string, inputPath: string): string {
  const full = resolve(join(workspacePath, inputPath))
  const base = resolve(workspacePath)
  if (full !== base && !full.startsWith(base + sep)) {
    throw new Error('Access denied')
  }
  return full
}

function limitText(text: string, limit: number): string {
  if (limit <= 0) return ''
  return text.length > limit ? text.slice(0, limit) : text
}

export function createToolHandlers(workspacePath: string): Record<string, ToolHandler> {
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
    read_file: async (input: unknown) => {
      const parsed =
        typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
      const filePath = resolveWorkspacePath(
        workspacePath,
        typeof parsed.path === 'string' ? parsed.path : ''
      )
      const content = await readFile(filePath, 'utf-8')
      const limit = typeof parsed.limit === 'number' ? parsed.limit : 2000
      return limitText(content, limit)
    },
    write_file: async (input: unknown) => {
      const parsed =
        typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
      const filePath = resolveWorkspacePath(
        workspacePath,
        typeof parsed.path === 'string' ? parsed.path : ''
      )
      const content = typeof parsed.content === 'string' ? parsed.content : ''
      await writeFile(filePath, content, 'utf-8')
      return 'ok'
    },
    edit_file: async (input: unknown) => {
      const parsed =
        typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
      const filePath = resolveWorkspacePath(
        workspacePath,
        typeof parsed.path === 'string' ? parsed.path : ''
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

export async function agentLoop(
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

  const handlers = createToolHandlers(opts.workspacePath)
  const maxSteps = typeof opts.maxSteps === 'number' ? opts.maxSteps : 20
  const maxTokens = typeof opts.maxTokens === 'number' ? opts.maxTokens : 8000

  for (let step = 0; step < maxSteps; step++) {
    const response = await opts.client.messages.create({
      model: opts.model,
      system: opts.system,
      messages,
      tools: TOOLS,
      max_tokens: maxTokens
    })

    messages.push({
      role: 'assistant',
      content: response.content as unknown as MessageParam['content']
    })

    if (response.stop_reason !== 'tool_use') {
      return messages
    }

    const results: ToolResultBlockParam[] = []
    for (const block of response.content as ContentBlock[]) {
      if (block.type !== 'tool_use') continue
      const toolUse = block as ToolUseBlock
      const handler = handlers[toolUse.name]
      let output: string
      try {
        await opts.onToolUse?.(toolUse.name, toolUse.input, toolUse.id)
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

interface AgentHandlerOptions {
  workspacePath: string
  systemPromptManager: SystemPromptManager
  settingsManager: SettingsManager
  sessionManager: SessionManager
}

export function registerAgentHandlers({
  workspacePath,
  systemPromptManager,
  settingsManager,
  sessionManager
}: AgentHandlerOptions): void {
  // IPC Handler for Agent Loop
  ipcMain.handle('agent-loop', async (_, messages: ChatMessage[]) => {
    try {
      // 1. Read Config
      const config = await settingsManager.read()
      const { provider, apiKey, baseUrl, modelName } = config.model

      if (!apiKey) {
        throw new Error('API Key is missing in Settings')
      }

      if (provider !== 'anthropic') {
        throw new Error('Agent Loop currently only supports Anthropic provider')
      }

      // 2. Read System Prompt (Identity)
      const identityPrompt = await systemPromptManager.read('IDENTITY.md')

      // 3. Initialize Client
      const client = new Anthropic({
        apiKey,
        baseURL: baseUrl || undefined
      })

      // 4. Run Agent Loop

      // Extract user's last message and append to session
      const lastUserMsg = messages[messages.length - 1]
      if (lastUserMsg && lastUserMsg.role === 'user') {
        await sessionManager.append(lastUserMsg)
      }

      let currentToolMsgId: string | undefined
      let currentToolInput: unknown | undefined

      const finalMessages = await agentLoop(messages, {
        client,
        model: modelName || 'claude-3-opus-20240229',
        system: SYSTEM_PROMPT + '\n' + identityPrompt,
        workspacePath,
        maxSteps: 10, // reasonable default
        onToolUse: async (toolName, input, toolUseId) => {
          try {
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

            // Use event.sender instead of mainWindow
            const win = BrowserWindow.getAllWindows()[0]
            if (win) {
              const update: AgentUpdate = {
                type: 'tool_use',
                tool: toolName,
                input,
                toolUseId,
                message: msg
              }
              win.webContents.send('agent-update', update)
            }

            // Append to session
            await sessionManager.append(msg)
          } catch (e) {
            console.error('Failed to send tool_use update', e)
          }
        },
        onToolResult: async (toolName, output) => {
          try {
            const win = BrowserWindow.getAllWindows()[0]
            if (win) {
              const update: AgentUpdate = {
                type: 'tool_result',
                tool: toolName,
                output,
                id: currentToolMsgId
              }
              win.webContents.send('agent-update', update)
            }

            if (currentToolMsgId && currentToolInput) {
              await sessionManager.update(currentToolMsgId, {
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
          await sessionManager.append(msg)
          return responseText
        }
      }
      return ''
    } catch (error: unknown) {
      console.error('Agent Loop Failed:', error)
      const msg = error instanceof Error ? error.message : String(error)
      throw new Error(msg || 'Failed to run agent loop')
    }
  })
}
