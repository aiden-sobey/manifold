import { useState } from 'react';
import { cn } from '@/lib/utils';

const DOMAINS: Record<string, string> = {
  openai: 'openai.com',
  anthropic: 'anthropic.com',
  google: 'google.com',
  deepseek: 'deepseek.com',
  moonshotai: 'moonshot.ai',
  'meta-llama': 'meta.com',
  meta: 'meta.com',
  'x-ai': 'x.ai',
  mistralai: 'mistral.ai',
  qwen: 'qwen.ai',
  cohere: 'cohere.com',
  perplexity: 'perplexity.ai',
  microsoft: 'microsoft.com',
  amazon: 'aws.amazon.com',
  nvidia: 'nvidia.com',
  'z-ai': 'z.ai',
  minimax: 'minimax.io',
  baidu: 'baidu.com',
  bytedance: 'bytedance.com',
  inception: 'inceptionlabs.ai',
  ai21: 'ai21.com',
  nousresearch: 'nousresearch.com',
};

export function providerOf(modelId: string): string {
  return (modelId.replace(/^~/, '').split('/')[0] ?? 'other').toLowerCase();
}

export function ProviderIcon({ modelId, className }: { modelId: string; className?: string }) {
  const provider = providerOf(modelId);
  const domain = DOMAINS[provider];
  const [failed, setFailed] = useState(false);

  if (domain && !failed) {
    return (
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
        alt=""
        width={16}
        height={16}
        onError={() => setFailed(true)}
        className={cn('size-4 shrink-0 rounded-sm', className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        'bg-muted text-muted-foreground inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-[9px] font-semibold uppercase',
        className,
      )}
    >
      {provider.slice(0, 1)}
    </span>
  );
}
