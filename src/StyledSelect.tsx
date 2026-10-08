import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export default function StyledSelect({ label, value, options, onChange, icon, hideLabel = false, className = '' }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void;
  icon?: ReactNode; hideLabel?: boolean; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  useEffect(() => {
    if (!open) return;
    // Safari may blur an option without focusing the tapped button. Wait for an
    // actual outside pointer/focus target so the option's click can finish.
    const dismiss = (event: Event) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('focusin', dismiss);
    root.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('focusin', dismiss); };
  }, [open]);
  return <div className={`remodel-select ${hideLabel ? '' : 'form-label'} ${className}`} ref={root} onKeyDown={(event) => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!open) { setOpen(true); return; }
      const items = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  }}>{!hideLabel && <span>{label}</span>}<div className="remodel-control"><button ref={trigger} type="button" className={`remodel-trigger ${open ? 'open' : ''}`} aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} onClick={() => setOpen((current) => !current)}>{icon}<span className="select-value">{options.find((option) => option.value === value)?.label}</span><ChevronDown className="select-chevron" size={16}/></button>
    {open && <div id={listId} className="remodel-options" role="listbox" aria-label={label}>{options.map((option) => <button type="button" role="option" aria-selected={value === option.value} key={option.value} onClick={() => { onChange(option.value); setOpen(false); trigger.current?.focus(); }}><span>{option.label}</span>{value === option.value && <Check size={15}/>}</button>)}</div>}
  </div></div>;
}

