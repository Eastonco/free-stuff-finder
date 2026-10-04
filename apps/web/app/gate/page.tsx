import { enterGate } from "./actions";

export default async function Gate({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  return (
    <>
      <h1>Free Stuff Finder</h1>
      <p className="lede">Members only. Enter the invite code to continue.</p>
      {error ? <div className="err">Wrong invite code.</div> : null}
      <form action={enterGate}>
        <input type="hidden" name="next" value={next ?? "/"} />
        <label htmlFor="code">Invite code</label>
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <input id="code" name="code" type="password" autoFocus />
        <button type="submit">Enter</button>
      </form>
    </>
  );
}
