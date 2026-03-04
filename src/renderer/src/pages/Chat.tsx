import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserCog, Loader2, Trash2 } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { ChatMessage } from '../../../common/types'
import { PersonaModal } from '../components/persona-modal'
import { UserMessage } from '../components/chat/user-message'
import { AssistantMessage } from '../components/chat/assistant-message'
import { ToolMessage } from '../components/chat/tool-message'

export default function Chat(): React.JSX.Element {
  const navigate = useNavigate()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isPersonaModalOpen, setIsPersonaModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = (): void => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    const loadSession = async (): Promise<void> => {
      try {
        const history = await window.api.readSession()
        if (history && history.length > 0) {
          // Use history directly since Message is now just ChatMessage
          setMessages(history)
        }
      } catch (error) {
        console.error('Failed to load session:', error)
      }
    }
    loadSession()
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading])

  useEffect(() => {
    if (window.api?.onAgentUpdate) {
      const cleanup = window.api.onAgentUpdate((data) => {
        if (data.type === 'tool_use') {
          // Use the message provided by the backend if available, or construct one
          const newMessage: ChatMessage = data.message || {
            id: uuidv4(),
            content: `Using tool: ${data.tool}`,
            role: 'assistant',
            timestamp: Date.now(),
            toolUse: {
              tool: data.tool,
              input: data.input
            }
          }
          setMessages((prev) => [...prev, newMessage])
        } else if (data.type === 'tool_result') {
          setMessages((prev) => {
            // Try to find by ID first
            if (data.id) {
              const index = prev.findIndex((m) => m.id === data.id)
              if (index !== -1) {
                const msg = prev[index]
                const updated = {
                  ...msg,
                  toolUse: { ...msg.toolUse!, output: data.output }
                }
                const newMessages = [...prev]
                newMessages[index] = updated
                return newMessages
              }
            }

            // Fallback: Find the last message that is a tool use of the same tool and has no output
            // We search from the end
            const reversed = [...prev].reverse()
            const index = reversed.findIndex(
              (m) => m.toolUse && m.toolUse.tool === data.tool && !m.toolUse.output
            )

            if (index !== -1) {
              const realIndex = prev.length - 1 - index
              const msg = prev[realIndex]
              const updated = {
                ...msg,
                toolUse: { ...msg.toolUse!, output: data.output }
              }
              const newMessages = [...prev]
              newMessages[realIndex] = updated
              return newMessages
            }
            return prev
          })
        }
      })
      return cleanup
    }
    return undefined
  }, [])

  const handleSendMessage = async (e?: React.FormEvent): Promise<void> => {
    e?.preventDefault()

    if (!inputValue.trim() || isLoading) return

    // Check settings before sending
    try {
      const config = await window.api.readConfigFile('catbot.json')
      const parsed: Record<string, unknown> = JSON.parse(config)
      const model = parsed?.model || {}

      const requiredFields = ['provider', 'apiKey', 'modelName', 'baseUrl']
      const missingFields = requiredFields.filter((field) => !model[field])

      if (missingFields.length > 0) {
        if (
          window.confirm(
            '模型配置不完整，请先前往设置页面完善配置。\nModel configuration is incomplete. Go to settings?'
          )
        ) {
          navigate('/settings')
        }
        return
      }
    } catch (error) {
      console.error('Failed to validate settings:', error)
      if (
        window.confirm('无法读取配置文件，请检查设置。\nCannot read config file. Go to settings?')
      ) {
        navigate('/settings')
      }
      return
    }

    const userMessage: ChatMessage = {
      id: uuidv4(),
      content: inputValue,
      role: 'user',
      timestamp: Date.now()
    }

    // Optimistically add user message
    setMessages((prev) => [...prev, userMessage])
    setInputValue('')
    setIsLoading(true)

    try {
      // Prepare history for LLM
      // Map existing messages plus the new one
      const history = [...messages, userMessage]

      // Call agent loop (it will handle session appending)
      const responseText = await window.api.agentLoop(history)

      const botResponse: ChatMessage = {
        id: uuidv4(), // This ID will be different from what backend saves...
        // Ideally backend should return the saved message or ID?
        // But for now we just display. On reload it will sync.
        content: responseText,
        role: 'assistant',
        timestamp: Date.now()
      }
      setMessages((prev) => [...prev, botResponse])
    } catch (error: unknown) {
      console.error('Chat error:', error)
      const msg = error instanceof Error ? error.message : String(error)
      const errorMessage: ChatMessage = {
        id: uuidv4(),
        content: `Error: ${msg || 'Failed to get response'}`,
        role: 'assistant',
        timestamp: Date.now(),
        isError: true
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleClearSession = async (): Promise<void> => {
    if (
      window.confirm('此操作无法恢复，请谨慎操作。\nAre you sure you want to clear the session?')
    ) {
      await window.api.clearSession()
      setMessages([])
    }
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 text-gray-900 dark:text-white relative">
      {/* Header */}
      <header className="flex-none p-4 border-b border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 backdrop-blur flex justify-between items-center">
        <h1 className="text-xl font-bold">CatBot Chat</h1>
        <div className="flex gap-2">
          <button
            onClick={handleClearSession}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors hover:text-red-500 dark:hover:text-red-400"
            title="Clear Session"
          >
            <Trash2 size={20} />
          </button>
          <button
            onClick={() => setIsPersonaModalOpen(true)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
            title="Set Persona"
          >
            <UserCog size={20} />
          </button>
        </div>
      </header>

      {/* Persona Modal */}
      <PersonaModal isOpen={isPersonaModalOpen} onClose={() => setIsPersonaModalOpen(false)} />

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => {
          if (message.role === 'user') {
            return <UserMessage key={message.id} message={message} />
          }
          if (message.toolUse) {
            return <ToolMessage key={message.id} message={message} />
          }
          return <AssistantMessage key={message.id} message={message} />
        })}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-bl-none px-4 py-3 flex items-center gap-2">
              <Loader2 className="animate-spin text-gray-400" size={16} />
              <span className="text-sm text-gray-500 dark:text-gray-400">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="flex-none p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <form onSubmit={handleSendMessage} className="flex gap-2 items-end">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={isLoading}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-200 dark:border-gray-700 placeholder-gray-400 dark:placeholder-gray-500 resize-none h-14 disabled:opacity-50 disabled:cursor-not-allowed"
            autoFocus
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isLoading}
            className="h-14 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 rounded-lg font-medium transition-colors flex items-center justify-center"
          >
            {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Send'}
          </button>
        </form>
      </div>
    </div>
  )
}
