import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { EmptyState, Loading, ButtonLink } from '../components/ui';
import { SetNewPassword } from '../components/SetNewPassword';

/** Sends signed-out visitors to /login and back afterwards. After an admin password reset, asks for a new one first. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  const loc = useLocation();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ground">
        <Loading label="Opening LinkPulse…" />
      </div>
    );
  }
  if (!me) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (me.passwordReset) return <SetNewPassword reason={me.passwordReset.reason} />;
  return <>{children}</>;
}

/**
 * Hides admin screens from non-admins. This is only for the UI:
 * the server checks the role on every /api/admin request (403 otherwise).
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  if (me?.user.role !== 'admin') {
    return (
      <EmptyState
        icon="shield"
        title="No access"
        body="Only platform admins can open the abuse monitor."
        action={<ButtonLink to="/dashboard">Back to dashboard</ButtonLink>}
      />
    );
  }
  return <>{children}</>;
}
