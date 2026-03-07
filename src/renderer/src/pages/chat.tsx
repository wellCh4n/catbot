import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  UserCog,
  Loader2,
  Trash2,
  Send as SendIcon,
  MessageSquare,
  BrushCleaning
} from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { ChatMessage } from '../../../common/types'
import { PersonaModal } from '../components/persona-modal'
import { UserMessage } from '../components/chat/user-message'
import { AssistantMessage } from '../components/chat/assistant-message'
import { ToolMessage } from '../components/chat/tool-message'
import { ThinkingMessage } from '../components/chat/thinking-message'

export default function Chat(): React.JSX.Element {
  const navigate = useNavigate()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isPersonaModalOpen, setIsPersonaModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [sessions, setSessions] = useState<string[]>([])
  const [currentSessionId, setCurrentSessionId] = useState('main')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isHydratingHistoryRef = useRef(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = (behavior: ScrollBehavior): void => {
    messagesEndRef.current?.scrollIntoView({ behavior })
  }

  const focusInput = useCallback((): void => {
    if (isPersonaModalOpen) return
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [isPersonaModalOpen])

  useEffect(() => {
    if (window.api?.onSessionCreated) {
      const cleanup = window.api.onSessionCreated((newSessionId) => {
        setSessions((prev) => {
          if (prev.includes(newSessionId)) return prev
          return [...prev, newSessionId].sort((a, b) => {
            if (a === 'main') return -1
            if (b === 'main') return 1
            return a.localeCompare(b)
          })
        })
      })
      return cleanup
    }
    return undefined
  }, [])

  useEffect(() => {
    const loadSessions = async (): Promise<void> => {
      try {
        const sessionList = await window.api.listSessions()
        setSessions(sessionList)
      } catch (error) {
        console.error('Failed to load sessions:', error)
      }
    }
    loadSessions()
  }, [])

  useEffect(() => {
    const loadSession = async (): Promise<void> => {
      try {
        const history = await window.api.readSession(currentSessionId)
        if (history) {
          isHydratingHistoryRef.current = true
          setMessages(history)
        }
      } catch (error) {
        console.error('Failed to load session:', error)
      }
    }
    loadSession()
  }, [currentSessionId])

  const handleSessionChange = async (sessionId: string): Promise<void> => {
    if (sessionId === currentSessionId) return
    setCurrentSessionId(sessionId)
  }

  useEffect(() => {
    const behavior: ScrollBehavior = isHydratingHistoryRef.current ? 'auto' : 'smooth'
    scrollToBottom(behavior)
    if (isHydratingHistoryRef.current) {
      isHydratingHistoryRef.current = false
    }
    focusInput()
  }, [messages, isLoading, focusInput])

  useEffect(() => {
    if (window.api?.onAgentMessage) {
      const cleanup = window.api.onAgentMessage((msg, sessionId) => {
        if (sessionId !== currentSessionId) return
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) {
            return prev
          }
          return [...prev, msg]
        })
      })
      return cleanup
    }
    return undefined
  }, [currentSessionId])

  useEffect(() => {
    if (window.api?.onAgentUpdate) {
      const cleanup = window.api.onAgentUpdate((data, sessionId) => {
        if (sessionId !== currentSessionId) return
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
  }, [currentSessionId])

  const handleSendMessage = async (e?: React.SyntheticEvent): Promise<void> => {
    e?.preventDefault()
    focusInput()

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
    focusInput()

    try {
      // Prepare history for LLM
      // Map existing messages plus the new one
      const history = [...messages, userMessage]

      // Call agent loop (it will handle session appending)
      await window.api.agentLoop(history, currentSessionId)
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
      focusInput()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleClearChat = async (): Promise<void> => {
    if (!window.confirm('Are you sure you want to clear the chat history?')) {
      return
    }

    try {
      await window.api.clearSession(currentSessionId)
      setMessages([])
    } catch (error) {
      console.error('Failed to clear chat:', error)
    }
  }

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string): Promise<void> => {
    e.stopPropagation()
    if (!window.confirm(`Are you sure you want to delete session "${sessionId}"?`)) {
      return
    }

    try {
      await window.api.deleteSession(sessionId)
      const updatedSessions = await window.api.listSessions()
      setSessions(updatedSessions)

      if (sessionId === currentSessionId) {
        await handleSessionChange('main')
      }
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
  }

  return (
    <div className="flex h-full w-full bg-gray-100 dark:bg-gray-800 gap-1">
      {/* Sidebar */}
      <div className="w-64 flex flex-col gap-1">
        <div className="flex-1 bg-white dark:bg-gray-900 rounded-lg flex flex-col border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
          <div className="h-11 px-4 flex items-center bg-gray-50/50 dark:bg-gray-800/50">
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Sessions
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sessions.map((id) => (
              <div
                key={id}
                onClick={() => handleSessionChange(id)}
                className={`group flex items-center justify-between px-3 py-1 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                  id === currentSessionId
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <div className="flex items-center gap-3 truncate">
                  <MessageSquare size={18} className="shrink-0 opacity-70" />
                  <span className="truncate">{id}</span>
                </div>
                <button
                  onClick={(e) => id !== 'main' && handleDeleteSession(e, id)}
                  className={`p-2 rounded-md transition-all ${
                    id === 'main'
                      ? 'invisible'
                      : 'opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-600 cursor-pointer'
                  }`}
                  title={id !== 'main' ? 'Delete Session' : undefined}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="flex-none p-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-200/50 dark:border-gray-700/50">
          <button
            onClick={() => setIsPersonaModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border border-gray-200/50 dark:border-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
          >
            <UserCog size={16} />
            <span>Agent Configuration</span>
          </button>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 bg-white dark:bg-gray-900 rounded-lg flex flex-col border border-gray-200/50 dark:border-gray-700/50 overflow-hidden relative">
        {/* Header */}
        <div className="flex-none px-4 py-2 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            {/* Strut to match Skills/Workspace header height */}
            <span className="text-sm py-1 invisible w-0">|</span>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              {currentSessionId}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClearChat}
              className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors cursor-pointer"
              title="Clear Chat History"
            >
              <BrushCleaning size={16} />
            </button>
          </div>
        </div>

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
          {isLoading && <ThinkingMessage />}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="flex-none px-4 pb-4 bg-white dark:bg-gray-900">
          <form onSubmit={handleSendMessage} className="relative">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg transition-all border border-gray-200 dark:border-gray-700 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-transparent">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                className="w-full bg-transparent text-gray-900 dark:text-white px-4 py-3 focus:outline-none resize-none min-h-[80px] max-h-[200px] select-text"
                autoFocus
              />

              <div className="flex justify-end items-center px-2 pb-2">
                <button
                  type="submit"
                  disabled={!inputValue.trim() || isLoading}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  {isLoading ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <>
                      <span>Send</span>
                      <SendIcon size={16} />
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Persona Modal */}
      <PersonaModal isOpen={isPersonaModalOpen} onClose={() => setIsPersonaModalOpen(false)} />
    </div>
  )
}
