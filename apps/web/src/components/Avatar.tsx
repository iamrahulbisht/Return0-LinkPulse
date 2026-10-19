import { useState } from 'react';
import { api } from '../lib/api';
import { initials } from '../lib/format';
import { useAuth } from '../hooks/useAuth';

/** Profile photo, or initials on a dark tile when there is no photo (or it fails to load). */
export function Avatar({
  name,
  path,
  size = 44,
  className = '',
  label,
}: {
  name: string;
  /** API path from `user.avatarPath`, or null. */
  path?: string | null;
  size?: number;
  className?: string;
  /** Accessible name. Without it the avatar is decorative (the name is shown next to it). */
  label?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const showImg = !!path && failed !== path;
  const a11y = label ? { role: 'img' as const, 'aria-label': label } : { 'aria-hidden': true as const };
  return (
    <span
      {...a11y}
      className={`inline-flex flex-none items-center justify-center overflow-hidden rounded-xl border border-line-strong bg-[#202026] font-bold text-accent-400 ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
    >
      {showImg ? (
        <img src={api.profile.avatarUrl(path!)} alt="" width={size} height={size} className="h-full w-full object-cover" onError={() => setFailed(path!)} />
      ) : (
        initials(name || '?')
      )}
    </span>
  );
}

/** The signed-in user's avatar (keeps up with photo changes via useAuth().refresh()). */
export function MyAvatar({ size = 44, className = '', label }: { size?: number; className?: string; label?: string }) {
  const { me } = useAuth();
  return <Avatar name={me?.user.name ?? ''} path={me?.user.avatarPath} size={size} className={className} label={label} />;
}
