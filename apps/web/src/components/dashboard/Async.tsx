import type { ReactNode } from 'react';
import type { AsyncState } from '../../hooks/useAsync';
import { ErrorState, Skeleton } from '../ui';

/**
 * Renders one dashboard panel's data: skeleton on the first load, the error with a retry if it failed
 * and nothing is on screen yet, otherwise the (possibly slightly old) data while a refresh runs.
 */
export function AsyncBlock<T>({ state, skeleton, children }: { state: AsyncState<T>; skeleton?: ReactNode; children: (data: T) => ReactNode }) {
  if (state.data !== undefined) {
    return (
      <div aria-busy={state.loading || undefined} className={`flex min-w-0 flex-col gap-[inherit] transition-opacity ${state.loading ? 'opacity-60' : ''}`}>
        {state.error && <ErrorState message={state.error.message} onRetry={() => void state.reload()} />}
        {children(state.data)}
      </div>
    );
  }
  if (state.error) return <ErrorState message={state.error.message} onRetry={() => void state.reload()} />;
  return <>{skeleton ?? <Skeleton className="h-32 w-full" />}</>;
}
