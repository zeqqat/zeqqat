import type { InputHTMLAttributes } from "react";

// An API key field. Not type="password" on purpose: a password field makes
// the browser treat the form as a sign-in, fill the field above it (the URL)
// with a saved email and offer to save the key as a password afterwards.
// The key is masked with CSS instead (.zq-key-input), and password managers
// are told to leave the field alone.
export function KeyInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const { className, ...rest } = props;
  return (
    <input
      {...rest}
      type="text"
      className={`zq-input zq-key-input ${className ?? ""}`.trim()}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      data-1p-ignore=""
      data-lpignore="true"
      data-bwignore="true"
      data-form-type="other"
    />
  );
}

// Same opt-outs for the plain fields that sit next to a key (name, URL).
export const noAutofill = {
  autoComplete: "off",
  "data-1p-ignore": "",
  "data-lpignore": "true",
  "data-bwignore": "true",
  "data-form-type": "other",
} as const;
