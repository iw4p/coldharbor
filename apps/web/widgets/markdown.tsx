"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Shared markdown renderer for long text (READMEs, issue bodies, commit messages). */
export function Markdown({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={`markdown text-sm leading-relaxed ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: (p) => <a {...p} target="_blank" rel="noopener noreferrer" /> }}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
