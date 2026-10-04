/** What a form's server action returns: errors (with the submitted values, to refill the form) or saved. */
export type FormResult<V> = { errors?: string[]; values?: V; saved?: boolean } | null;

export const field = (fd: FormData, key: string) => String(fd.get(key) ?? "");
