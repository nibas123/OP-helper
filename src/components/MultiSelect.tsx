import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface Option {
  id: string;
  name: string;
}

interface MultiSelectProps {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export default function MultiSelect({ label, options, selected, onChange }: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter(i => i !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const selectedText = selected.length === 0 
    ? `All ${label}s` 
    : selected.length === 1 
      ? options.find(o => o.id === selected[0])?.name || `1 ${label}` 
      : `${selected.length} ${label}s`;

  return (
    <div className="relative" ref={containerRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-40 bg-background border border-border rounded-md px-3 py-1.5 text-sm hover:border-primary/50 transition-colors"
      >
        <span className="truncate pr-2">{selectedText}</span>
        <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-card border border-border rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
          <div className="p-1">
            {options.map(option => (
              <button
                key={option.id}
                onClick={() => toggleOption(option.id)}
                className="w-full flex items-center justify-between px-2 py-1.5 text-sm hover:bg-muted rounded-sm transition-colors text-left"
              >
                <span className="truncate">{option.name}</span>
                {selected.includes(option.id) && <Check className="w-4 h-4 text-primary" />}
              </button>
            ))}
            {options.length === 0 && (
              <div className="px-2 py-2 text-sm text-muted-foreground text-center">No options</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
