"use client";

import { useState } from "react";
import { resolveRecordDeviceVisual, type RecordDeviceMediaInput, type RecordDeviceFallback } from "@/lib/record-device-media";
import styles from "./device-visual.module.css";

export type RecordDeviceVisualProps = RecordDeviceMediaInput & { className?: string };

function DeviceFallback({ kind }: { kind: RecordDeviceFallback }) {
  if (kind === "apple") {
    return (
      <svg viewBox="0 0 24 24" className={styles.apple} fill="currentColor" aria-hidden="true">
        <path d="M17.05 12.54c.03 3.25 2.85 4.33 2.88 4.35-.02.08-.45 1.54-1.48 3.05-.89 1.3-1.81 2.6-3.27 2.63-1.43.03-1.89-.85-3.52-.85-1.62 0-2.13.82-3.47.88-1.41.05-2.48-1.41-3.38-2.7-1.84-2.65-3.25-7.49-1.36-10.77a5.25 5.25 0 0 1 4.45-2.7c1.39-.03 2.7.94 3.54.94.83 0 2.4-1.16 4.05-.99.69.03 2.65.28 3.91 2.12-.1.06-2.34 1.36-2.35 4.04ZM14.38 4.62c.75-.91 1.26-2.17 1.12-3.43-1.08.04-2.4.72-3.17 1.62-.7.8-1.31 2.1-1.15 3.33 1.2.09 2.43-.61 3.2-1.52Z" />
      </svg>
    );
  }
  if (kind === "android") {
    return (
      <svg viewBox="0 0 80 88" className={styles.android} fill="currentColor" aria-hidden="true">
        <path d="m24 13-6-9m38 9 6-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M15 31a25 25 0 0 1 50 0H15Z" />
        <circle cx="28" cy="22" r="2.2" fill="white" /><circle cx="52" cy="22" r="2.2" fill="white" />
        <path d="M15 35h50v29a7 7 0 0 1-7 7H22a7 7 0 0 1-7-7V35Z" />
        <rect x="2" y="34" width="10" height="31" rx="5" /><rect x="68" y="34" width="10" height="31" rx="5" />
        <rect x="23" y="65" width="11" height="22" rx="5.5" /><rect x="46" y="65" width="11" height="22" rx="5.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 64" className={styles.device} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="30" height="58" rx="5" /><path d="M19 8h10M21 55h6" />
      <path d="m18 30 4 4 8-9" strokeWidth="2" opacity=".45" />
    </svg>
  );
}

function DeviceImage({ media, reference, className }: { media: ReturnType<typeof resolveRecordDeviceVisual>; reference: RecordDeviceMediaInput["reference"]; className?: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const kind = media.kind === "photo" && !imageFailed ? "photo" : media.fallback;
  const description = kind === "apple" ? "Logotipo de Apple" : kind === "android" ? "Robot de Android" : "Icono de dispositivo";
  return (
    <div className={[styles.visual, className].filter(Boolean).join(" ")} data-device-visual={kind}>
      {kind === "photo" && media.imageSrc ? (
        // Catalog images can use authenticated or external sources; keep their original URL and a local error fallback.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={media.imageSrc} alt={`Imagen de catálogo de ${(reference ?? "").trim() || "equipo"}`} width={128} height={144} className={styles.photo} onError={() => setImageFailed(true)} />
      ) : (
        <span className={styles.fallback} role="img" aria-label={`${description}${reference ? `: ${reference.trim()}` : ""}`}>
          <DeviceFallback kind={media.fallback} />
        </span>
      )}
    </div>
  );
}

export function RecordDeviceVisual({ className, ...input }: RecordDeviceVisualProps) {
  const media = resolveRecordDeviceVisual(input);
  return <DeviceImage key={`${media.imageSrc ?? ""}|${input.reference ?? ""}|${media.fallback}`} media={media} reference={input.reference} className={className} />;
}
