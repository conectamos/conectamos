import type { ReactNode } from "react";
import type {
  VendorWelcomeBlock,
  VendorWelcomeFontFamily,
} from "@/lib/vendor-welcome-message";

const alignClass: Record<VendorWelcomeBlock["align"], string> = {
  center: "text-center",
  left: "text-left",
  right: "text-right",
};

const sizeClass: Record<VendorWelcomeBlock["size"], string> = {
  large: "text-base leading-8 sm:text-lg",
  normal: "text-sm leading-7 sm:text-base",
};

const fontClass: Record<VendorWelcomeFontFamily, string> = {
  serif: "font-serif",
  system: "font-sans",
};

function renderBoldText(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={`${part}-${index}`} className="font-black text-slate-950">
          {part.slice(2, -2)}
        </strong>
      );
    }

    return part;
  });
}

export default function VendorMessageBody({
  blocks,
  className = "",
  fontFamily,
}: {
  blocks: VendorWelcomeBlock[];
  className?: string;
  fontFamily: VendorWelcomeFontFamily;
}) {
  return (
    <div className={["space-y-4 text-slate-600", fontClass[fontFamily], className].join(" ")}>
      {blocks.map((block, index) => (
        <p
          key={`${block.text}-${index}`}
          className={[alignClass[block.align], sizeClass[block.size]].join(" ")}
        >
          {renderBoldText(block.text)}
        </p>
      ))}
    </div>
  );
}
