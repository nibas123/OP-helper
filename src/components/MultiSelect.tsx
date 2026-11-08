import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';

export interface MultiSelectOption {
  id: string;
  name: string;
}

interface MultiSelectProps {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  className?: string;
  placeholder?: string;
}

export default function MultiSelect({
  label,
  options,
  selected,
  onChange,
  className = '',
  placeholder
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
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

  const handleSelectAll = () => {
    onChange(options.map(o => o.id));
  };

  const handleClearAll = () => {
    onChange([]);
  };

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(o => o.name.toLowerCase().includes(q));
  }, [options, search]);

  const selectedText = useMemo(() => {
    if (selected.length === 0) return placeholder || `All ${label}s`;
    if (selected.length === 1) {
      return options.find(o => o.id === selected[0])?.name || `1 ${label}`;
    }
    return `${selected.length} ${label}s`;
  }, [selected, options, label, placeholder]);

  const hasSelection = selected.length > 0;

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between min-w-[130px] max-w-[190px] bg-[#090d16] border rounded-lg px-2.5 py-1.5 text-xs transition cursor-pointer ${
          hasSelection 
            ? 'border-blue-500/60 bg-blue-500/10 text-white font-medium shadow-sm shadow-blue-500/10' 
            : 'border-[#1e293b] text-slate-300 hover:border-slate-600'
        }`}
      >
        <span className="truncate pr-1 text-left flex-1">{selectedText}</span>
        <div className="flex items-center gap-1 shrink-0">
          {hasSelection && (
            <span className="px-1.5 py-0.2 rounded-full bg-blue-600 text-white font-mono text-[10px] font-bold">
              {selected.length}
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-[#64748b] transition-transform ${isOpen ? 'rotate-180 text-blue-400' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 w-64 bg-[#0d1322] border border-[#1e293b] rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col animate-in fade-in duration-150">
          {/* Header controls: Search and Select All / Clear */}
          <div className="p-2 border-b border-[#1e293b] bg-[#0a0f1d] space-y-1.5">
            {options.length > 6 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#64748b] absolute left-2.5 top-2 pointer-events-none" />
                <input
                  type="text"
                  placeholder={`Search ${label.toLowerCase()}s...`}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-[#090d16] border border-[#1e293b] rounded-lg pl-7 pr-7 py-1 text-xs text-white placeholder-[#64748b] focus:border-blue-500 focus:outline-none"
                  autoFocus
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1.5 text-[#64748b] hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] font-mono px-0.5">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-blue-400 hover:text-blue-300 hover:underline"
              >
                Select All ({options.length})
              </button>
              {hasSelection && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-rose-400 hover:text-rose-300 hover:underline"
                >
                  Clear All
                </button>
              )}
            </div>
          </div>

          {/* List of Options */}
          <div className="max-h-56 overflow-y-auto p-1 space-y-0.5">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-xs text-[#64748b] text-center font-mono">
                No matching {label.toLowerCase()}s
              </div>
            ) : (
              filteredOptions.map(option => {
                const isSelected = selected.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggleOption(option.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg transition-colors text-left group ${
                      isSelected 
                        ? 'bg-blue-600/15 text-blue-300 font-medium' 
                        : 'text-slate-300 hover:bg-[#1e293b]/60 hover:text-white'
                    }`}
                  >
                    <span className="truncate pr-2">{option.name}</span>
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition ${
                      isSelected
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'border-[#334155] bg-[#090d16] group-hover:border-slate-500'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
