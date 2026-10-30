"use client";

import { useRef, useState } from "react";
import ReactCrop, { type PercentCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import type { Area } from "react-easy-crop";

type Props = {
  image: string;
  onCropComplete: (area: Area, areaPixels: Area, natural: { width: number; height: number }) => void;
  /** Initial selection, normalized 0..1 to the image. */
  initialCrop?: { x: number; y: number; width: number; height: number };
};

export default function EventImageCropper({ image, onCropComplete, initialCrop }: Props) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<PercentCrop>(initialCrop
    ? { unit: "%", x: initialCrop.x * 100, y: initialCrop.y * 100, width: initialCrop.width * 100, height: initialCrop.height * 100 }
    : { unit: "%", x: 10, y: 10, width: 80, height: 80 });

  const completeCrop = (selection: PercentCrop) => {
    const source = imageRef.current;
    if (!source) return;
    onCropComplete(selection, {
      x: source.naturalWidth * selection.x / 100,
      y: source.naturalHeight * selection.y / 100,
      width: source.naturalWidth * selection.width / 100,
      height: source.naturalHeight * selection.height / 100,
    }, { width: source.naturalWidth, height: source.naturalHeight });
  };

  return (
    <div className="flex min-h-40 w-full items-center justify-center overflow-hidden bg-black">
      <ReactCrop
        crop={crop}
        onChange={(_, selection) => setCrop(selection)}
        onComplete={(_, selection) => completeCrop(selection)}
        minWidth={1}
        minHeight={1}
        keepSelection
        ruleOfThirds
        ariaLabels={{
          cropArea: "Area di ritaglio",
          nwDragHandle: "Ridimensiona in alto a sinistra",
          nDragHandle: "Ridimensiona in alto",
          neDragHandle: "Ridimensiona in alto a destra",
          eDragHandle: "Ridimensiona a destra",
          seDragHandle: "Ridimensiona in basso a destra",
          sDragHandle: "Ridimensiona in basso",
          swDragHandle: "Ridimensiona in basso a sinistra",
          wDragHandle: "Ridimensiona a sinistra",
        }}
      >
        <img
          ref={imageRef}
          src={image}
          alt="Immagine da ritagliare"
          className="block max-w-full"
          style={{ maxHeight: "45vh", width: "auto", height: "auto" }}
          onLoad={() => completeCrop(crop)}
        />
      </ReactCrop>
    </div>
  );
}