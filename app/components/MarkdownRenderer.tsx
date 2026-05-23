"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { isValidElement, useState } from "react";
import { Check, Copy } from "lucide-react";
import ChartBlock from "./ChartBlock";
import MermaidBlock from "./MermaidBlock";

interface MarkdownRendererProps {
  content: string;
}

function isChartClassName(className: unknown): boolean {
  return typeof className === "string" && /\blanguage-chart\b/.test(className);
}

function isMermaidClassName(className: unknown): boolean {
  return typeof className === "string" && /\blanguage-mermaid\b/.test(className);
}

function extractText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return extractText(props.children);
  }
  return "";
}

function PreBlock({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) {
  // If the only child is a `code` element with the chart or mermaid language, skip the <pre> wrapper.
  if (isValidElement(children)) {
    const childProps = children.props as { className?: string };
    if (isChartClassName(childProps?.className) || isMermaidClassName(childProps?.className)) {
      return <>{children}</>;
    }
  }
  return (
    <pre className="!mt-0 !rounded-t-none" {...props}>
      {children}
    </pre>
  );
}

function CodeBlock({ children, className, ...props }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const isInline = !match && !className;

  if (isInline) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  if (isChartClassName(className)) {
    return <ChartBlock spec={extractText(children)} />;
  }

  if (isMermaidClassName(className)) {
    return <MermaidBlock code={extractText(children)} />;
  }

  const handleCopy = () => {
    const text = String(children).replace(/\n$/, "");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <div className="flex items-center justify-between bg-light-border dark:bg-dark-border px-4 py-2 rounded-t-lg text-xs">
        <span className="text-light-muted dark:text-dark-muted">{match ? match[1] : "code"}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text transition-colors"
        >
          {copied ? (
            <>
              <Check size={14} />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy size={14} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="!mt-0 !rounded-t-none">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="message-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code: CodeBlock as any,
          pre: PreBlock as any,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
