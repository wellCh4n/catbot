import { ChatMessage } from '../../../../common/types'

interface UserMessageProps {
  message: ChatMessage
}

export function UserMessage({ message }: UserMessageProps): React.JSX.Element {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl px-4 py-2 bg-blue-600 text-white rounded-br-none">
        <p className="whitespace-pre-wrap wrap-break-word">{message.content}</p>
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
