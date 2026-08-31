export interface UnitOfWorkPort {
  /**
   * Execute `work` inside a single database transaction.
   * The adapter commits on success and rolls back on any thrown error.
   * Use cases call this without knowing how the transaction is implemented.
   */
  runInTransaction<T>(work: () => Promise<T>): Promise<T>;
}
