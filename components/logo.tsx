import Image from "next/image";

export function Logo({
  size = "md",
  showText = true,
}: {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}) {
  const sizeMap = { sm: 24, md: 32, lg: 40 };
  const px = sizeMap[size];

  return (
    <div className="flex items-center gap-2">
      <Image
        src="/prepix-symbol.svg"
        alt="Prepix"
        width={px}
        height={px}
        className="invert-0"
      />
      {showText && (
        <Image
          src="/prepix-wordmark.svg"
          alt="Prepix"
          width={px * 2.8}
          height={px}
          className="invert-0"
        />
      )}
    </div>
  );
}
