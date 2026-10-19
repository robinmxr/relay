import { useEffect, useId, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';
import { LIMITS, type FileInfo, type User } from '@relay/shared';
import { formatBytes, toWire } from '../format';
import { Avatar } from './Avatar';
import { CloseIcon, FileIcon, PaperclipIcon, SendIcon } from './icons';

interface Props {
  placeholder: string;
  users: Record<string, User>;
  onSend: (body: string, fileIds: string[]) => Promise<void>;
  /** Omit to hide the attach button. */
  onUpload?: (file: File) => Promise<FileInfo>;
  onTyping?: () => void;
  /** Refocuses the box when this changes, e.g. on channel switch. */
  focusKey?: string;
}

interface Attachment {
  key: string;
  name: string;
  size: number;
  status: 'uploading' | 'done' | 'error';
  info?: FileInfo;
  error?: string;
}

const TYPING_EVERY_MS = 3000;
const MENTION_QUERY_RE = /(?:^|\s)@([\p{L}\p{N}._-]{0,30})$/u;

export function Composer({ placeholder, users, onSend, onUpload, onTyping, focusKey }: Props) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastTyping = useRef(0);
  const mentions = useRef(new Map<string, string>());
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caret, setCaret] = useState(0);
  const [pick, setPick] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    ref.current?.focus();
  }, [focusKey]);

  const query = useMemo(() => MENTION_QUERY_RE.exec(text.slice(0, caret))?.[1] ?? null, [text, caret]);
  const suggestions = useMemo(() => {
    if (query === null || dismissed) return [];
    const q = query.toLowerCase();
    return Object.values(users)
      .filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().startsWith(q))
      .slice(0, 6);
  }, [query, users, dismissed]);

  useEffect(() => setPick(0), [query]);

  const insertMention = (user: User) => {
    const before = text.slice(0, caret).replace(MENTION_QUERY_RE, (m) => `${m.startsWith('@') ? '' : m[0]}@${user.name} `);
    const next = before + text.slice(caret);
    mentions.current.set(user.name, user.id);
    setText(next);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(before.length, before.length);
      setCaret(before.length);
    });
  };

  const addFiles = (files: FileList | File[]) => {
    if (!onUpload) return;
    const list = [...files].slice(0, LIMITS.filesPerMessage - attachments.length);
    for (const file of list) {
      const key = `${file.name}-${file.size}-${Math.random()}`;
      setAttachments((a) => [...a, { key, name: file.name, size: file.size, status: 'uploading' }]);
      onUpload(file)
        .then((info) => setAttachments((a) => a.map((x) => (x.key === key ? { ...x, status: 'done', info } : x))))
        .catch((err: Error) => setAttachments((a) => a.map((x) => (x.key === key ? { ...x, status: 'error', error: err.message } : x))));
    }
  };

  const uploading = attachments.some((a) => a.status === 'uploading');
  const ready = attachments.filter((a) => a.status === 'done' && a.info);
  const canSend = !busy && !uploading && (text.trim().length > 0 || ready.length > 0);

  const submit = async () => {
    if (!canSend) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(
        toWire(text.trim(), mentions.current),
        ready.map((a) => a.info!.id),
      );
      setText('');
      setAttachments([]);
      mentions.current.clear();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Message not sent');
    } finally {
      setBusy(false);
      ref.current?.focus();
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setPick((p) => (p + (e.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(suggestions[pick]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDismissed(true);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const onPaste = (e: ClipboardEvent) => {
    if (onUpload && e.clipboardData.files.length) {
      e.preventDefault();
      addFiles(e.clipboardData.files);
    }
  };

  return (
    <form
      className={`composer${dragging ? ' dragging' : ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onDragOver={(e) => {
        if (onUpload && e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {suggestions.length > 0 && (
        <ul className="mention-menu" role="listbox" aria-label="People to mention">
          {suggestions.map((u, i) => (
            <li key={u.id} role="option" aria-selected={i === pick}>
              <button
                type="button"
                className={i === pick ? 'active' : ''}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(u);
                }}
              >
                <Avatar user={u} size={22} />
                <span>{u.name}</span>
                <span className="muted small">{u.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {attachments.length > 0 && (
        <ul className="attachments" aria-label="Attachments">
          {attachments.map((a) => (
            <li key={a.key} className={`attachment ${a.status}`}>
              <FileIcon size={16} />
              <span className="attachment-name">{a.name}</span>
              <span className="muted small">{a.status === 'uploading' ? 'Uploading…' : a.status === 'error' ? a.error : formatBytes(a.size)}</span>
              <button
                type="button"
                className="icon-btn small"
                aria-label={`Remove ${a.name}`}
                onClick={() => setAttachments((list) => list.filter((x) => x.key !== a.key))}
              >
                <CloseIcon size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="sr-only" htmlFor={id}>
        {placeholder}
      </label>
      <textarea
        id={id}
        ref={ref}
        rows={1}
        value={text}
        maxLength={LIMITS.messageBody}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          setCaret(e.target.selectionStart);
          setDismissed(false);
          const now = Date.now();
          if (onTyping && e.target.value && now - lastTyping.current > TYPING_EVERY_MS) {
            lastTyping.current = now;
            onTyping();
          }
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        aria-autocomplete="list"
      />
      <div className="composer-bar">
        <div className="composer-tools">
          {onUpload && (
            <>
              <button type="button" className="icon-btn" aria-label="Attach files" title="Attach files" onClick={() => fileInput.current?.click()}>
                <PaperclipIcon size={17} />
              </button>
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </>
          )}
          <span className="muted small hint">Enter to send · Shift+Enter for a new line · @ to mention</span>
        </div>
        <button type="submit" className="btn primary send" disabled={!canSend} aria-label="Send message">
          <SendIcon size={15} /> Send
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
