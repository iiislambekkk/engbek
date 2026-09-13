"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface AiAssistantMarkdownProps {
    content: string
}

export function AiAssistantMarkdown({
                                        content,
                                    }: AiAssistantMarkdownProps) {
    return (
        <div className="text-sm leading-6">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    p: ({ children }) => (
                        <p className="mb-3 last:mb-0">
                            {children}
                        </p>
                    ),

                    strong: ({ children }) => (
                        <strong className="font-semibold">
                            {children}
                        </strong>
                    ),

                    em: ({ children }) => (
                        <em>{children}</em>
                    ),

                    ul: ({ children }) => (
                        <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">
                            {children}
                        </ul>
                    ),

                    ol: ({ children }) => (
                        <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">
                            {children}
                        </ol>
                    ),

                    li: ({ children }) => (
                        <li className="pl-1">
                            {children}
                        </li>
                    ),

                    blockquote: ({ children }) => (
                        <blockquote className="my-3 border-l-2 pl-4 italic text-muted-foreground">
                            {children}
                        </blockquote>
                    ),

                    code: ({ children, className }) => {
                        const isCodeBlock =
                            className?.includes("language-")

                        if (isCodeBlock) {
                            return (
                                <code className={className}>
                                    {children}
                                </code>
                            )
                        }

                        return (
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]">
                                {children}
                            </code>
                        )
                    },

                    pre: ({ children }) => (
                        <pre className="my-3 overflow-x-auto rounded-lg bg-muted p-3 text-xs leading-5">
                            {children}
                        </pre>
                    ),

                    hr: () => (
                        <hr className="my-4 border-border" />
                    ),

                    a: ({ href, children }) => (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline underline-offset-2 hover:opacity-80"
                        >
                            {children}
                        </a>
                    ),

                    h1: ({ children }) => (
                        <h1 className="mb-3 text-lg font-semibold">
                            {children}
                        </h1>
                    ),

                    h2: ({ children }) => (
                        <h2 className="mb-3 mt-4 text-base font-semibold first:mt-0">
                            {children}
                        </h2>
                    ),

                    h3: ({ children }) => (
                        <h3 className="mb-2 mt-3 text-sm font-semibold first:mt-0">
                            {children}
                        </h3>
                    ),

                    del: ({ children }) => (
                        <del className="text-muted-foreground">
                            {children}
                        </del>
                    ),
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    )
}