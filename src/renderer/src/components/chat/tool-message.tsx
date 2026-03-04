import { ChatMessage } from '../../../../common/types'
import catbotIcon from '../../assets/catbot_circle_icon.png'

interface ToolMessageProps {
  message: ChatMessage
}

export function ToolMessage({ message }: ToolMessageProps): React.JSX.Element {
  if (!message.toolUse) return <></>

  return (
    <div className="flex justify-start items-start gap-3">
      <img src={catbotIcon} alt="CatBot" className="w-10 h-10 rounded-full mt-1" />
      <div className="max-w-[80%] rounded-2xl px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-bl-none font-mono text-sm w-full">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider opacity-50 font-bold">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            Tool Use: {message.toolUse.tool}
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 overflow-x-auto">
            <pre className="text-xs">{JSON.stringify(message.toolUse.input, null, 2)}</pre>
          </div>
          {message.toolUse.output && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
              <div className="text-xs uppercase tracking-wider opacity-50 font-bold mb-1">
                Result
              </div>
              <div className="bg-white dark:bg-gray-900 rounded p-2 overflow-x-auto max-h-40">
                <pre className="text-xs whitespace-pre-wrap">{message.toolUse.output}</pre>
              </div>
            </div>
          )}
        </div>
        <span className="text-xs opacity-50 mt-1 block">
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </span>
      </div>
    </div>
  )
}
