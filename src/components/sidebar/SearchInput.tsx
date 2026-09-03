import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useChat } from '@/store/chatStore';

export function SearchInput() {
  const setSearch = useChat((s) => s.setSearch);
  const [value, setValue] = useState('');

  useEffect(() => {
    const t = setTimeout(() => void setSearch(value), 150);
    return () => clearTimeout(t);
  }, [value, setSearch]);

  return (
    <div className="relative">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      <Input
        id="chat-search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setValue('');
        }}
        placeholder="Search chats  ⌘K"
        className="bg-background h-9 pr-8 pl-8"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue('')}
          aria-label="Clear search"
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
