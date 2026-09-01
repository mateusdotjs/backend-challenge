export async function runParallel<T>(
  count: number,
  fn: (index: number) => Promise<T>,
): Promise<T[]> {
  return Promise.all(Array.from({ length: count }, (_, index) => fn(index)));
}

export async function runParallelSettled<T>(
  count: number,
  fn: (index: number) => Promise<T>,
): Promise<PromiseSettledResult<T>[]> {
  return Promise.allSettled(
    Array.from({ length: count }, (_, index) => fn(index)),
  );
}
