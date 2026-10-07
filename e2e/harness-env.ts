// Lane harness addresses come from the environment only. A built-in default
// once pointed at another session's harness (API 3308, PG 55438), so an unset
// value fails loudly instead of reaching someone else's server or database.
export function harnessEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set: point it at this lane's harness (e2e has no default address)`);
  return value;
}
