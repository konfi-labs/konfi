import { Image } from "../Image";

export function Logo({ src }: { src?: string }) {
  const logoSrc = src || "/assets/logo.svg";

  return (
    <Image
      ratio={2 / 1}
      width={80}
      height={40}
      src={logoSrc}
      alt={"Logo"}
      priority={true}
      objectFit={"contain"}
      filter={src ? undefined : { base: "none", _dark: "invert(1)" }}
      transparentBackground
    />
  );
}
