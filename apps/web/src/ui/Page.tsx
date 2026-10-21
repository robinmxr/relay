import { useEffect, useRef, type ReactNode } from 'react';
import { BackIcon } from './icons';

/**
 * A page of the workspace shell — settings, people, channel settings. While one is open the
 * rail and sidebar step aside (`.app[data-page]`) so it takes the whole window, and the
 * header's back button (or Escape) returns to the channel you came from.
 */
export function Page({
  title,
  subtitle,
  label,
  nav,
  actions,
  backLabel = 'Back',
  onBack,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Accessible name for the page region, when the title alone is not enough. */
  label?: string;
  /** Optional side navigation — the page's sections. */
  nav?: ReactNode;
  /** Extra controls at the right of the header. */
  actions?: ReactNode;
  /** The way back, spelled out so leaving the page is never a guess. */
  backLabel?: string;
  onBack: () => void;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  // Land focus on the heading: the pane's content just changed under the reader.
  useEffect(() => heading.current?.focus(), []);

  return (
    <section className="page" aria-label={label ?? (typeof title === 'string' ? title : undefined)}>
      <header className="page-head">
        <button className="page-back" onClick={onBack}>
          <BackIcon size={18} />
          {backLabel}
        </button>
        <div className="page-title">
          <h1 tabIndex={-1} ref={heading}>
            {title}
          </h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="page-head-actions">{actions}</div>}
      </header>
      <div className="page-body">
        {nav && <nav className="page-nav">{nav}</nav>}
        <div className="page-content settings-body">{children}</div>
      </div>
    </section>
  );
}
