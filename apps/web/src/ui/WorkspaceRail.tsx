import { useRef, useState, type FormEvent } from 'react';
import type { Workspace } from '@relay/shared';
import { initials } from '../format';
import { PlusIcon } from './icons';

interface Props {
  workspaces: Workspace[];
  activeId: string | null;
  onSwitch: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
  onJoin: (code: string) => Promise<void>;
}

export function WorkspaceRail({ workspaces, activeId, onSwitch, onCreate, onJoin }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <nav className="rail" aria-label="Workspaces">
      {workspaces.map((w) => (
        <button
          key={w.id}
          className={`rail-tile${w.id === activeId ? ' active' : ''}`}
          aria-label={w.name}
          aria-current={w.id === activeId ? 'page' : undefined}
          title={w.name}
          onClick={() => onSwitch(w.id)}
        >
          {initials(w.name)}
        </button>
      ))}
      <button className="rail-tile add" aria-label="Create or join a workspace" title="Create or join a workspace" onClick={() => dialog.current?.showModal()}>
        <PlusIcon size={18} />
      </button>
      <WorkspaceDialog dialogRef={dialog} onCreate={onCreate} onJoin={onJoin} />
    </nav>
  );
}

function WorkspaceDialog(props: {
  dialogRef: React.RefObject<HTMLDialogElement>;
  onCreate: (name: string) => Promise<void>;
  onJoin: (code: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (e: FormEvent, action: () => Promise<void>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await action();
      setName('');
      setCode('');
      props.dialogRef.current?.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog ref={props.dialogRef} className="dialog" aria-labelledby="ws-dialog-title" onClose={() => setError(null)}>
      <h2 id="ws-dialog-title">Add a workspace</h2>
      <form onSubmit={(e) => run(e, () => props.onCreate(name))} className="dialog-section">
        <label className="field">
          Create a new workspace
          <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Northwind Studio" />
        </label>
        <button className="btn primary" type="submit" disabled={busy || !name.trim()}>
          Create
        </button>
      </form>
      <form onSubmit={(e) => run(e, () => props.onJoin(code))} className="dialog-section">
        <label className="field">
          Or join with an invite code
          <input required maxLength={40} value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. k7mq2xw9ab" />
        </label>
        <button className="btn" type="submit" disabled={busy || !code.trim()}>
          Join
        </button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-foot">
        <button className="btn" onClick={() => props.dialogRef.current?.close()}>
          Close
        </button>
      </div>
    </dialog>
  );
}
