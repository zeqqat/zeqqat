// A listed app's single-colour logo, drawn in the text colour.
export function AppLogo({ src, size = 20 }: { src: string; size?: number }) {
  return (
    <span
      className="zq-mono-logo"
      style={{ width: size, height: size, maskImage: `url(${src})`, WebkitMaskImage: `url(${src})`, flex: "0 0 auto" }}
      aria-hidden="true"
    />
  );
}
