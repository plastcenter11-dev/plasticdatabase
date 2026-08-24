import { useState, useRef, useEffect, useMemo, Children } from 'react';
import { createPortal } from 'react-dom';

function optionText(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(optionText).join('');
  return String(node);
}

// Drop-in replacement for a native <select> (same children-as-<option> API,
// same onChange({ target: { value } }) shape) that lets the user type to
// filter the list instead of scrolling/arrowing through every option.
export default function SearchableSelect({ value, onChange, children, className = '', required, disabled, name, id }) {
  const options = useMemo(() => {
    const list = [];
    Children.forEach(children, child => {
      if (!child || !child.props) return;
      list.push({
        value: child.props.value == null ? '' : String(child.props.value),
        label: optionText(child.props.children),
        disabled: !!child.props.disabled,
      });
    });
    return list;
  }, [children]);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const currentValue = String(value ?? '');
  const selected = currentValue ? options.find(o => o.value === currentValue) : undefined;

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter(o => o.value === '' || o.label.toLowerCase().includes(q));
  }, [options, query]);

  const updatePosition = () => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  };

  const openDropdown = () => {
    if (disabled) return;
    updatePosition();
    setQuery('');
    setActiveIndex(Math.max(0, options.findIndex(o => o.value === String(value ?? ''))));
    setOpen(true);
  };

  const closeDropdown = () => { setOpen(false); setQuery(''); };

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e) => {
      if (wrapRef.current && wrapRef.current.contains(e.target)) return;
      if (e.target.closest && e.target.closest('[data-searchable-select-list]')) return;
      closeDropdown();
    };
    const onScrollOrResize = () => updatePosition();
    document.addEventListener('mousedown', onDocMouseDown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  useEffect(() => { setActiveIndex(0); }, [query]);

  const selectOption = (opt) => {
    if (!opt || opt.disabled) return;
    onChange({ target: { value: opt.value, name } });
    closeDropdown();
  };

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); openDropdown(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); selectOption(filtered[activeIndex]); }
    else if (e.key === 'Escape') { e.preventDefault(); closeDropdown(); }
    else if (e.key === 'Tab') { closeDropdown(); }
  };

  const displayValue = open ? query : (selected ? selected.label : '');
  const placeholder = !open ? (options.find(o => o.value === '')?.label || '') : '';

  return (
    <div className="relative" ref={wrapRef}>
      <input
        ref={inputRef}
        type="text"
        name={name}
        id={id}
        className={className}
        value={displayValue}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        onFocus={openDropdown}
        onClick={openDropdown}
        onChange={e => { setQuery(e.target.value); if (!open) setOpen(true); }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {open && pos && createPortal(
        <div
          data-searchable-select-list
          className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto text-sm"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          {filtered.length === 0 && <div className="px-3 py-2 text-gray-400">لا توجد نتائج</div>}
          {filtered.map((opt, idx) => (
            <div
              key={opt.value + '-' + idx}
              className={`px-3 py-1.5 cursor-pointer ${idx === activeIndex ? 'bg-primary/10 text-primary' : 'hover:bg-gray-50'} ${opt.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              onMouseDown={e => { e.preventDefault(); selectOption(opt); }}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              {opt.label || ' '}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
