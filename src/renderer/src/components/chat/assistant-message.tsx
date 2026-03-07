import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Copy, Check } from 'lucide-react'
import 'highlight.js/styles/atom-one-dark.css'
import { ChatMessage } from '../../../../common/types'
import { formatMessageTime } from '../../utils/date'
import catbotIcon from '../../assets/catbot_circle_icon.png'

interface AssistantMessageProps {
  message: ChatMessage
}

export function AssistantMessage({ message }: AssistantMessageProps): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }

  return (
    <div className="flex justify-start items-start gap-3 group">
      <img src={catbotIcon} alt="CatBot" className="w-12 h-12 rounded-full mt-1" />
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 select-text ${
          message.isError
            ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 rounded-bl-none border border-red-200 dark:border-red-800'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-bl-none border border-gray-200 dark:border-gray-700'
        }`}
      >
        <div className="prose dark:prose-invert max-w-none wrap-break-word text-sm">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={{
              pre: ({ node, ...props }) => (
                <pre {...props} className="p-0!" key={node?.position?.start.line} />
              )
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
        <div className="flex items-center justify-between mt-1 gap-2">
          <span className="text-xs opacity-50">{formatMessageTime(message.timestamp)}</span>
          <button
            onClick={handleCopy}
            className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            title="Copy message"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}
