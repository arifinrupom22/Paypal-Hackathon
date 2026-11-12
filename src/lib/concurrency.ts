/**
 * Retries a transaction that PostgreSQL aborted because of a detected
 * deadlock. The policy engine keeps lock order consistent, so a retry is a
 * safety net for database-level lock scheduling, not a correctness mechanism.
 */
export async function withDeadlockRetry<T>(
  operation: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const deadlock = message.includes("40P01") || message.toLowerCase().includes("deadlock detected");
      if (!deadlock || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
    }
  }
  throw lastError;
}
