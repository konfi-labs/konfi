"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Supercluster, {
  AnyProps,
  ClusterFeature,
  ClusterProperties,
  PointFeature,
} from "supercluster";
import { useMapViewport } from "./use-map-viewport";

type FeatureCollection<PointProps> = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  PointProps
>;

type BoundingBox = [number, number, number, number];

type UseSuperclusterConfig = {
  disableClusteringAtZoom?: number;
  viewportPadding?: number;
};

export const useSupercluster = <
  PointProps extends GeoJSON.GeoJsonProperties = AnyProps,
  ClusterProps extends GeoJSON.GeoJsonProperties = ClusterProperties,
>(
  geojson: FeatureCollection<PointProps>,
  options: Supercluster.Options<PointProps, ClusterProps>,
  config: UseSuperclusterConfig = {},
) => {
  const { disableClusteringAtZoom, viewportPadding = 80 } = config;
  const clustererMemo = useMemo(
    () => ({
      instance: new Supercluster<PointProps, ClusterProps>(options),
      key: Symbol("clusterer"),
    }),
    [options],
  );
  const clusterer = clustererMemo.instance;
  const clustererKey = clustererMemo.key;

  const [loadedKey, setLoadedKey] = useState<symbol | null>(null);
  const maxClusterZoom = useMemo(
    () => (typeof options.maxZoom === "number" ? options.maxZoom : 16),
    [options.maxZoom],
  );

  useEffect(() => {
    const features = Array.isArray(geojson.features) ? geojson.features : [];

    clusterer.load(features);
    setLoadedKey(clustererKey);
  }, [clusterer, clustererKey, geojson]);

  const { bbox, zoom } = useMapViewport({ padding: viewportPadding });

  const clusters = useMemo(() => {
    const isLoaded = loadedKey === clustererKey;
    const hasValidBbox =
      Array.isArray(bbox) &&
      bbox.length === 4 &&
      bbox.every((value) => Number.isFinite(value));

    if (!isLoaded || !hasValidBbox) {
      return [] as Array<
        ClusterFeature<ClusterProps> | PointFeature<PointProps>
      >;
    }
    const normalizedBbox = bbox as BoundingBox;
    const normalizedZoom = Number.isFinite(zoom)
      ? Math.max(0, Math.round(zoom))
      : 0;
    const clampedZoom = Math.min(normalizedZoom, maxClusterZoom);
    const clusteringDisabled =
      typeof disableClusteringAtZoom === "number" &&
      normalizedZoom >= disableClusteringAtZoom;
    if (clusteringDisabled) {
      const visiblePoints = geojson.features.filter((feature) =>
        isPointWithinBounds(feature.geometry.coordinates, normalizedBbox),
      );
      return visiblePoints as Array<
        ClusterFeature<ClusterProps> | PointFeature<PointProps>
      >;
    }
    return clusterer.getClusters(normalizedBbox, clampedZoom);
  }, [
    clusterer,
    bbox,
    zoom,
    maxClusterZoom,
    disableClusteringAtZoom,
    geojson,
    clustererKey,
    loadedKey,
  ]);

  const getLeaves = useCallback(
    (clusterId: number, limit?: number) => {
      if (loadedKey !== clustererKey) {
        return [] as Array<PointFeature<PointProps>>;
      }

      return clusterer.getLeaves(clusterId, limit ?? Infinity);
    },
    [clusterer, clustererKey, loadedKey],
  );

  const getClusterExpansionZoom = useCallback(
    (clusterId: number) => {
      if (loadedKey !== clustererKey) {
        const fallbackZoom =
          typeof disableClusteringAtZoom === "number"
            ? Math.min(disableClusteringAtZoom, maxClusterZoom)
            : maxClusterZoom;

        return fallbackZoom;
      }

      return clusterer.getClusterExpansionZoom(clusterId);
    },
    [
      clusterer,
      clustererKey,
      loadedKey,
      disableClusteringAtZoom,
      maxClusterZoom,
    ],
  );

  return { clusters, getLeaves, getClusterExpansionZoom };
};

const isPointWithinBounds = (
  coordinates: GeoJSON.Position,
  bbox: BoundingBox,
) => {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return false;
  const [lng, lat] = coordinates;
  const [west, south, east, north] = bbox;
  const withinLat = lat >= south && lat <= north;
  const withinLng =
    west <= east ? lng >= west && lng <= east : lng >= west || lng <= east;
  return withinLat && withinLng;
};
