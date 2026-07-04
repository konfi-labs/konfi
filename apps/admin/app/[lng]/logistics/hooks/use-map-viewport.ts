"use client";

import { useMap } from "@vis.gl/react-google-maps";
import { useEffect, useState } from "react";

type MapViewportOptions = {
  padding?: number;
};

type BoundingBox = [number, number, number, number];

export const useMapViewport = ({ padding = 0 }: MapViewportOptions = {}) => {
  const map = useMap();
  const [bbox, setBbox] = useState<BoundingBox>([-180, -90, 180, 90]);
  const [zoom, setZoom] = useState(0);

  useEffect(() => {
    if (!map) return;

    const listener = map.addListener("idle", () => {
      const bounds = map.getBounds();
      const currentZoom = map.getZoom();
      const projection = map.getProjection();

      if (!bounds || currentZoom === undefined || !projection) return;

      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();

      const paddingDegrees = degreesPerPixel(currentZoom) * padding;

      const n = Math.min(90, ne.lat() + paddingDegrees);
      const s = Math.max(-90, sw.lat() - paddingDegrees);
      const w = sw.lng() - paddingDegrees;
      const e = ne.lng() + paddingDegrees;

      setBbox([w, s, e, n]);
      setZoom(currentZoom);
    });

    return () => listener.remove();
  }, [map, padding]);

  return { bbox, zoom };
};

const degreesPerPixel = (zoomLevel: number) =>
  360 / (Math.pow(2, zoomLevel) * 256);
