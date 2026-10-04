import { Text } from "@radix-ui/themes";

/** Label + control + optional hint, stacked. The label wraps the control so clicks focus it. */
export function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed in as children
    <label style={{ display: "block" }}>
      <Text as="div" size="2" weight="medium" mb="1">
        {label}
      </Text>
      {children}
      {hint ? (
        <Text as="div" size="1" color="gray" mt="1">
          {hint}
        </Text>
      ) : null}
    </label>
  );
}

export function FormErrors({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <div role="alert" style={{ color: "var(--red-11)", fontSize: "var(--font-size-2)" }}>
      {errors.map((e) => (
        <div key={e}>{e}</div>
      ))}
    </div>
  );
}
