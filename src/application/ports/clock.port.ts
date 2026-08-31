export interface ClockPort {
  /**
   * Return the current instant.
   * Use cases inject this instead of calling `new Date()` directly so that
   * time can be controlled deterministically in tests.
   */
  now(): Date;
}
