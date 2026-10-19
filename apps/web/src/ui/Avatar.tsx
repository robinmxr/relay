import type { User } from '@relay/shared';
import { colorFor, initials } from '../format';

export function Avatar({ user, size = 36, online }: { user: User; size?: number; online?: boolean }) {
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{ width: size, height: size, background: colorFor(user.id), fontSize: Math.round(size * 0.38), borderRadius: Math.round(size * 0.24) }}
    >
      {initials(user.name)}
      {online !== undefined && <span className={`presence ${online ? 'on' : 'off'}`} />}
    </span>
  );
}
