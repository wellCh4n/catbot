import { useState, useRef, useEffect } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { ChatMessage } from '../../../../common/types'
import { formatMessageTime } from '../../utils/date'
import catbotIcon from '../../assets/catbot_circle_icon.png'

interface ToolMessageProps {
  message: ChatMessage
}

export function ToolMessage({ message }: ToolMessageProps): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(message.toolUse?.output === undefined)
  const resultRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (resultRef.current) {
      resultRef.current.scrollTop = resultRef.current.scrollHeight
    }
  }, [message.toolUse?.output, isExpanded])

  if (!message.toolUse) return <></>

  return (
    <div className="flex justify-start items-start gap-3">
      <img src={catbotIcon} alt="CatBot" className="w-12 h-12 rounded-full mt-1" />
      <div className="max-w-[80%] rounded-lg px-4 py-2 bg-gray-50 dark:bg-gray-800/50 text-gray-800 dark:text-gray-100 rounded-bl-none font-mono text-sm w-full border border-gray-200 dark:border-gray-700">
        <div className="space-y-2">
          <div
            className="flex items-center justify-between gap-2 text-xs uppercase tracking-wider opacity-70 font-bold cursor-pointer hover:opacity-100 transition-opacity"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  message.toolUse.output !== undefined
                    ? 'bg-green-500'
                    : 'bg-blue-500 animate-pulse'
                } -translate-y-px`}
              />
              <span>Tool Use: {message.toolUse.tool}</span>
            </div>
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </div>
          {isExpanded && (
            <div className="space-y-2 mt-2 select-text">
              <div className="bg-white dark:bg-gray-900 rounded-lg p-2 overflow-x-auto">
                <pre className="text-xs">{JSON.stringify(message.toolUse.input, null, 2)}</pre>
              </div>
              {message.toolUse.output && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
                  <div className="text-xs uppercase tracking-wider opacity-50 font-bold mb-1">
                    Result
                  </div>
                  <div
                    ref={resultRef}
                    className="bg-white dark:bg-gray-900 rounded-lg p-2 overflow-auto max-h-40"
                  >
                    <pre className="text-xs whitespace-pre-wrap">{message.toolUse.output}</pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <span className="text-xs opacity-50 mt-1 block">
          {formatMessageTime(message.timestamp)}
        </span>
      </div>
    </div>
  )
}
