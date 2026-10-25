import React, { useState, useRef, useEffect } from 'react';
import { Plus, ChevronDown, Check } from 'lucide-react';

interface CreatableComboboxProps {
  label?: string;
  value: string;
  onChange: (newValue: string) => void;
  options: string[];
  onAddNewOption?: (newOption: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export const CreatableCombobox: React.FC<CreatableComboboxProps> = ({
  label,
  value,
  onChange,
  options,
  onAddNewOption,
  placeholder = 'جستجو یا تایپ مورد جدید...',
  disabled = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(value || '');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = options.filter((opt) =>
    opt.toLowerCase().includes(normalizedQuery)
  );
  const exactExists = options.some(
    (opt) => opt.trim().toLowerCase() === normalizedQuery
  );

  const handleCreateAndSelect = (rawText?: string) => {
    const candidate = (rawText ?? query).trim();
    if (!candidate) return;
    if (!options.some((o) => o.trim().toLowerCase() === candidate.toLowerCase())) {
      onAddNewOption?.(candidate);
    }
    onChange(candidate);
    setQuery(candidate);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
          {label}
        </label>
      )}
      <div className="flex items-center gap-1">
        <div className="relative flex-1">
          <input
            type="text"
            disabled={disabled}
            value={query}
            placeholder={placeholder}
            onFocus={() => !disabled && setIsOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              onChange(e.target.value);
              setIsOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault();
                handleCreateAndSelect();
              } else if (e.key === 'Escape') {
                setIsOpen(false);
              }
            }}
            className="w-full px-3 py-1.5 pl-7 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-800 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="button"
            disabled={disabled}
            tabIndex={-1}
            onClick={() => setIsOpen((prev) => !prev)}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
        <button
          type="button"
          disabled={disabled}
          title="افزودن به لیست جامع (Shift+Enter)"
          onClick={() => {
            if (query.trim() && !exactExists) {
              handleCreateAndSelect();
            } else {
              setIsOpen((prev) => !prev);
            }
          }}
          className="px-2 py-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg transition-colors shrink-0 disabled:opacity-40"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-40 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-48 overflow-y-auto text-xs divide-y divide-slate-100 dark:divide-slate-800">
          {filteredOptions.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt);
                setQuery(opt);
                setIsOpen(false);
              }}
              className="w-full px-3 py-2 text-right hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between text-slate-800 dark:text-slate-200"
            >
              <span>{opt}</span>
              {value === opt && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
            </button>
          ))}
          {query.trim() && !exactExists && (
            <button
              type="button"
              onClick={() => handleCreateAndSelect()}
              className="w-full px-3 py-2 text-right bg-indigo-50/80 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 font-semibold flex items-center justify-between gap-2"
            >
              <span>+ افزودن «{query.trim()}» به لیست جامع</span>
              <span className="text-[10px] font-mono opacity-75">Shift+Enter</span>
            </button>
          )}
          {filteredOptions.length === 0 && !query.trim() && (
            <div className="px-3 py-2 text-slate-400 text-center">موردی یافت نشد</div>
          )}
        </div>
      )}
    </div>
  );
};
