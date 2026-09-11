/**
 * Thrown by a handler after it has already called deferJob() itself — main.ts
 * recognizes this and does nothing further (no retryOrFailJob, no
 * completeJob: the row's status/run_after are already correct). Distinct
 * from a real failure, which does count against max_attempts.
 */
export class JobDeferred extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'JobDeferred'
  }
}
