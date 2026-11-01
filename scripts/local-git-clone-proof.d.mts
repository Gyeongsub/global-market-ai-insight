/** Sanitizer rejects unbounded or incomplete local clone/frozen-install evidence. */
export function safeLocalCloneProof(value: unknown): Record<string, any> | null;
