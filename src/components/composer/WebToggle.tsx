import { Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/store/settingsStore';
import { cn } from '@/lib/utils';

/** Turns OpenRouter's web search and fetch tools on or off for every reply. */
export function WebToggle() {
  const enabled = useSettings((s) => s.settings.webAccess);
  const update = useSettings((s) => s.update);
  const label = enabled ? 'Web access on' : 'Web access off';

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('gap-1.5', enabled ? 'bg-muted text-foreground' : 'text-muted-foreground')}
      aria-pressed={enabled}
      aria-label={label}
      title={`${label}: the model can search the web and read pages when it needs to`}
      onClick={() => void update({ webAccess: !enabled })}
    >
      <Globe className="size-4" />
      <span className="hidden sm:inline">Web</span>
    </Button>
  );
}
