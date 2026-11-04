export function escapeLike(value: string): string {
  return value.replaceAll(/[\\%_]/gu, (match) => `\\${match}`);
}
