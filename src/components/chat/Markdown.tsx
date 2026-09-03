import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { CodeBlock } from './CodeBlock';

const remarkPlugins = [remarkGfm];
const rehypePlugins = [[rehypeHighlight, { detect: false, ignoreMissing: true }] as const];

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className="prose-chat">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
        rehypePlugins={rehypePlugins as any}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
