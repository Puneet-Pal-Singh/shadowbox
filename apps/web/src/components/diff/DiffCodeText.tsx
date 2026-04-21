import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

interface DiffCodeTextProps {
  content: string;
  language: string;
  wrap?: boolean;
}

export function DiffCodeText({
  content,
  language,
  wrap = false,
}: DiffCodeTextProps) {
  const whiteSpace = wrap ? "pre-wrap" : "pre";
  return (
    <SyntaxHighlighter
      language={language}
      style={vscDarkPlus}
      PreTag="span"
      CodeTag="span"
      customStyle={{
        display: "inline",
        margin: 0,
        padding: 0,
        background: "transparent",
        overflow: "visible",
        whiteSpace,
      }}
      codeTagProps={{
        style: {
          display: "inline",
          whiteSpace,
          wordBreak: wrap ? "break-word" : "normal",
          background: "transparent",
        },
      }}
    >
      {content}
    </SyntaxHighlighter>
  );
}

const LANGUAGE_MAP: Record<string, string> = {
  cjs: "javascript",
  cpp: "cpp",
  css: "css",
  go: "go",
  htm: "html",
  html: "html",
  java: "java",
  js: "javascript",
  json: "json",
  jsx: "jsx",
  md: "markdown",
  mjs: "javascript",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "bash",
  sql: "sql",
  svg: "xml",
  ts: "typescript",
  tsx: "tsx",
  txt: "text",
  vue: "vue",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
};

export function resolveDiffLanguage(path: string | undefined): string {
  if (!path) {
    return "text";
  }
  const extension = path.split(".").pop()?.trim().toLowerCase() ?? "";
  if (!extension) {
    return "text";
  }
  return LANGUAGE_MAP[extension] ?? "text";
}
