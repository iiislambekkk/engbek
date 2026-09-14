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
        <div className="ai-assistant-markdown text-[0.925rem] leading-6 text-foreground">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    p: ({ children }) => (
                        <p className="mb-3 last:mb-0">
                            {children}
                        </p>
                    ),

                    strong: ({ children }) => (
                        <strong className="font-semibold text-foreground">
                            {children}
                        </strong>
                    ),

                    em: ({ children }) => (
                        <em>{children}</em>
                    ),

                    ul: ({ children }) => (
                        <ul className="mb-3 list-disc space-y-1.5 pl-5 marker:text-primary last:mb-0">
                            {children}
                        </ul>
                    ),

                    ol: ({ children }) => (
                        <ol className="mb-3 list-decimal space-y-1.5 pl-5 marker:font-semibold marker:text-primary last:mb-0">
                            {children}
                        </ol>
                    ),

                    li: ({ children }) => (
                        <li className="pl-1">
                            {children}
                        </li>
                    ),

                    blockquote: ({ children }) => (
                        <blockquote className="my-3 rounded-r-lg border-l-2 border-primary bg-primary/5 py-2 pr-3 pl-4 text-foreground [&>p]:mb-0">
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
                            <code className="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[0.85em] font-medium text-primary">
                                {children}
                            </code>
                        )
                    },

                    pre: ({ children }) => (
                        <pre className="my-3 overflow-x-auto rounded-xl border bg-background p-3 text-xs leading-5 shadow-xs">
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
                        <h1 className="mb-3 text-xl font-bold tracking-tight">
                            {children}
                        </h1>
                    ),

                    h2: ({ children }) => (
                        <h2 className="mb-3 mt-5 flex items-center gap-2 text-base font-bold tracking-tight first:mt-0 before:h-5 before:w-1 before:rounded-full before:bg-primary">
                            {children}
                        </h2>
                    ),

                    h3: ({ children }) => (
                        <h3 className="mb-2 mt-4 text-sm font-bold first:mt-0">
                            {children}
                        </h3>
                    ),

                    del: ({ children }) => (
                        <del className="text-muted-foreground">
                            {children}
                        </del>
                    ),

                    table: ({ children }) => (
                        <div className="my-3 overflow-x-auto rounded-xl border">
                            <table className="w-full border-collapse text-left text-sm">
                                {children}
                            </table>
                        </div>
                    ),

                    th: ({ children }) => (
                        <th className="bg-muted px-3 py-2 font-semibold">
                            {children}
                        </th>
                    ),

                    td: ({ children }) => (
                        <td className="border-t px-3 py-2 align-top">
                            {children}
                        </td>
                    ),
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    )
}
