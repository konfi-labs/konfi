"use client";

import { normalizeToLargest } from "@konfi/utils";
import { Bounds, Center, OrbitControls } from "@react-three/drei";
import { Canvas, useLoader } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import {
  type Preview3DAssets,
  normalizePreview3DAssets,
} from "./preview-assets";
import {
  type Preview3DTemplate,
  getPreview3DModelUrl,
  getPreview3DTemplateDefinition,
  resolvePreview3DTemplate,
  resolvePreview3DVariant,
} from "./templates";
import {
  IDENTITY_TEXTURE_ASPECT_TRANSFORM,
  getTextureAspectTransform,
} from "./texture-aspect";

const EMPTY_TEXTURE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

export interface Preview3DProps {
  currentPage?: number;
  fallbackMessage?: string;
  height: number;
  pageCount?: number | null;
  previewURLs: string[];
  template?: Preview3DTemplate | string | null;
  width: number;
}

export function Preview3D({
  currentPage = 1,
  fallbackMessage = "WebGL is not supported on this device.",
  height,
  pageCount,
  previewURLs,
  template,
  width,
}: Preview3DProps) {
  const assets = useMemo(
    () => normalizePreview3DAssets(previewURLs),
    [previewURLs],
  );
  const resolvedTemplate = resolvePreview3DTemplate(template, pageCount);

  return (
    <Canvas
      camera={{ position: [0, 0, 2.4] }}
      dpr={1.5}
      fallback={<div>{fallbackMessage}</div>}
    >
      <ambientLight intensity={1.8} />
      <directionalLight intensity={1.4} position={[2, 4, 4]} />
      <Preview3DScene
        assets={assets}
        currentPage={currentPage}
        height={height}
        pageCount={pageCount}
        template={resolvedTemplate}
        width={width}
      />
      <OrbitControls makeDefault />
    </Canvas>
  );
}

function Preview3DScene({
  assets,
  currentPage,
  height,
  pageCount,
  template,
  width,
}: {
  assets: Preview3DAssets;
  currentPage: number;
  height: number;
  pageCount?: number | null;
  template: Preview3DTemplate;
  width: number;
}) {
  const textureURLs =
    assets.urls.length > 0 ? assets.urls : [EMPTY_TEXTURE_DATA_URL];
  const textures = useLoader(THREE.TextureLoader, textureURLs);
  const textureByUrl = useMemo(() => {
    const nextTextureByUrl = new Map<string, THREE.Texture>();

    textureURLs.forEach((url, index) => {
      const texture = textures[index];
      if (!texture) {
        return;
      }

      texture.colorSpace = THREE.SRGBColorSpace;
      nextTextureByUrl.set(url, texture);
    });

    return nextTextureByUrl;
  }, [textureURLs, textures]);
  const frontTexture = assets.frontUrl
    ? textureByUrl.get(assets.frontUrl)
    : undefined;
  const backTexture = assets.backUrl
    ? textureByUrl.get(assets.backUrl)
    : undefined;
  const fittedFrontTexture = useAspectMatchedTexture(
    frontTexture,
    width,
    height,
  );
  const fittedBackTexture = useAspectMatchedTexture(backTexture, width, height);
  const definition = getPreview3DTemplateDefinition(template, pageCount);
  const modelUrl = getPreview3DModelUrl(definition);

  if (definition.kind === "gltf" && modelUrl) {
    return (
      <GltfPreview
        backTexture={fittedBackTexture}
        definitionTemplate={definition.template}
        frontTexture={fittedFrontTexture}
        height={height}
        modelUrl={modelUrl}
        width={width}
      />
    );
  }

  if (definition.procedural === "BOX") {
    return (
      <BoxPreviewMesh
        backTexture={fittedBackTexture}
        frontTexture={fittedFrontTexture}
        height={height}
        width={width}
      />
    );
  }

  if (definition.procedural === "BOOKLET") {
    return (
      <BookletPreviewMesh
        currentPage={currentPage}
        frontTexture={fittedFrontTexture}
        height={height}
        pageCount={pageCount}
        width={width}
      />
    );
  }

  return (
    <FlatPreviewMesh
      frontTexture={fittedFrontTexture}
      height={height}
      width={width}
    />
  );
}

function useAspectMatchedTexture(
  texture: THREE.Texture | undefined,
  targetWidth: number,
  targetHeight: number,
) {
  const fittedTexture = useMemo(() => {
    if (!texture) {
      return undefined;
    }

    const sourceWidth = getTextureImageDimension(texture.image, "width");
    const sourceHeight = getTextureImageDimension(texture.image, "height");
    const transform = getTextureAspectTransform({
      sourceHeight,
      sourceWidth,
      targetHeight,
      targetWidth,
    });

    if (transform === IDENTITY_TEXTURE_ASPECT_TRANSFORM) {
      return texture;
    }

    const nextTexture = texture.clone();
    nextTexture.offset.set(transform.offset[0], transform.offset[1]);
    nextTexture.repeat.set(transform.repeat[0], transform.repeat[1]);
    nextTexture.wrapS = THREE.ClampToEdgeWrapping;
    nextTexture.wrapT = THREE.ClampToEdgeWrapping;
    nextTexture.needsUpdate = true;

    return nextTexture;
  }, [targetHeight, targetWidth, texture]);

  useEffect(() => {
    return () => {
      if (fittedTexture && fittedTexture !== texture) {
        fittedTexture.dispose();
      }
    };
  }, [fittedTexture, texture]);

  return fittedTexture;
}

function getTextureImageDimension(
  image: unknown,
  dimension: "height" | "width",
) {
  const naturalDimension =
    dimension === "height" ? "naturalHeight" : "naturalWidth";

  return (
    getNumericObjectProperty(image, naturalDimension) ??
    getNumericObjectProperty(image, dimension) ??
    0
  );
}

function getNumericObjectProperty(value: unknown, key: string) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const propertyValue = (value as Record<string, unknown>)[key];

  return typeof propertyValue === "number" ? propertyValue : undefined;
}

function GltfPreview({
  backTexture,
  definitionTemplate,
  frontTexture,
  height,
  modelUrl,
  width,
}: {
  backTexture?: THREE.Texture;
  definitionTemplate: Preview3DTemplate;
  frontTexture?: THREE.Texture;
  height: number;
  modelUrl: string;
  width: number;
}) {
  const gltf = useLoader(GLTFLoader, modelUrl);
  const definition = getPreview3DTemplateDefinition(definitionTemplate);
  const variant = resolvePreview3DVariant({ definition, height, width });
  const scene = useMemo(() => {
    const sceneClone = gltf.scene.clone(true);
    const allVariantNodeNames = new Set(
      (definition.variants ?? []).flatMap((item) => [
        ...item.frontNodeNames,
        ...(item.backNodeNames ?? []),
        ...(item.supportNodeNames ?? []),
      ]),
    );
    const frontNodeNames = new Set(variant?.frontNodeNames ?? []);
    const backNodeNames = new Set(variant?.backNodeNames ?? []);
    const supportNodeNames = new Set([
      ...(definition.supportNodeNames ?? []),
      ...(variant?.supportNodeNames ?? []),
    ]);
    const selectedNodeNames = new Set([
      ...frontNodeNames,
      ...backNodeNames,
      ...supportNodeNames,
    ]);
    const frontMaterial = createTextureMaterial(frontTexture);
    const backMaterial = createTextureMaterial(backTexture);
    const supportMaterial = new THREE.MeshStandardMaterial({
      color: "#d7d3ca",
      metalness: 0.1,
      roughness: 0.65,
    });
    const neutralMaterial = new THREE.MeshStandardMaterial({
      color: "#f4f1eb",
      roughness: 0.8,
    });

    sceneClone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) {
        return;
      }

      const nodeName = object.name;
      const isVariantNode = allVariantNodeNames.has(nodeName);
      object.visible =
        !isVariantNode ||
        selectedNodeNames.size === 0 ||
        selectedNodeNames.has(nodeName);

      if (!object.visible) {
        return;
      }

      if (frontNodeNames.has(nodeName)) {
        object.material = frontMaterial;
        return;
      }

      if (backNodeNames.has(nodeName)) {
        object.material = backTexture ? backMaterial : neutralMaterial;
        return;
      }

      if (supportNodeNames.has(nodeName)) {
        object.material = supportMaterial;
        return;
      }

      object.material = neutralMaterial;
    });

    return sceneClone;
  }, [backTexture, definition, frontTexture, gltf.scene, variant]);

  return (
    <Bounds fit clip observe margin={1.2}>
      <Center>
        <primitive object={scene} />
      </Center>
    </Bounds>
  );
}

function FlatPreviewMesh({
  frontTexture,
  height,
  width,
}: {
  frontTexture?: THREE.Texture;
  height: number;
  width: number;
}) {
  const [normalizedWidth, normalizedHeight] = normalizeToLargest([
    width,
    height,
  ]);

  return (
    <mesh scale={[normalizedWidth, normalizedHeight, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial color="white" map={frontTexture} roughness={0.8} />
    </mesh>
  );
}

function BoxPreviewMesh({
  backTexture,
  frontTexture,
  height,
  width,
}: {
  backTexture?: THREE.Texture;
  frontTexture?: THREE.Texture;
  height: number;
  width: number;
}) {
  const [normalizedWidth, normalizedHeight] = normalizeToLargest([
    width,
    height,
  ]);

  return (
    <mesh scale={[normalizedWidth, normalizedHeight, 0.04]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial attach="material-0" color="#f5f1e9" />
      <meshStandardMaterial attach="material-1" color="#f5f1e9" />
      <meshStandardMaterial attach="material-2" color="#f5f1e9" />
      <meshStandardMaterial attach="material-3" color="#f5f1e9" />
      <meshStandardMaterial
        attach="material-4"
        color="white"
        map={frontTexture}
      />
      <meshStandardMaterial
        attach="material-5"
        color={backTexture ? "white" : "#f5f1e9"}
        map={backTexture}
      />
    </mesh>
  );
}

function BookletPreviewMesh({
  currentPage,
  frontTexture,
  height,
  pageCount,
  width,
}: {
  currentPage: number;
  frontTexture?: THREE.Texture;
  height: number;
  pageCount?: number | null;
  width: number;
}) {
  const normalized = normalizeToLargest([width, height]);
  const normalizedWidth = normalized[0];
  const normalizedHeight = normalized[1];
  const normalizedPageCount = Math.max(1, Math.floor(pageCount ?? 1));
  const visibleNeutralPages = Math.min(
    Math.max(normalizedPageCount - 1, 1),
    12,
  );
  const clampedPage = Math.min(Math.max(currentPage, 1), normalizedPageCount);
  const coverRotation = clampedPage > 1 ? -2.25 : 0;

  return (
    <group>
      {Array.from({ length: visibleNeutralPages }).map((_, index) => (
        <mesh
          key={index}
          position={[
            0.012 * Math.min(index, 8),
            -0.012 * Math.min(index, 8),
            -0.012 * (index + 1),
          ]}
          scale={[normalizedWidth, normalizedHeight, 1]}
        >
          <boxGeometry args={[1, 1, 0.008]} />
          <meshStandardMaterial color="#f4f1e8" roughness={0.9} />
        </mesh>
      ))}
      <group
        position={[-normalizedWidth / 2, 0, 0.035]}
        rotation={[0, coverRotation, 0]}
      >
        <mesh
          position={[normalizedWidth / 2, 0, 0]}
          scale={[normalizedWidth, normalizedHeight, 1]}
        >
          <boxGeometry args={[1, 1, 0.012]} />
          <meshStandardMaterial attach="material-0" color="#ede8dd" />
          <meshStandardMaterial attach="material-1" color="#ede8dd" />
          <meshStandardMaterial attach="material-2" color="#ede8dd" />
          <meshStandardMaterial attach="material-3" color="#ede8dd" />
          <meshStandardMaterial
            attach="material-4"
            color="white"
            map={frontTexture}
          />
          <meshStandardMaterial attach="material-5" color="#f4f1e8" />
        </mesh>
      </group>
    </group>
  );
}

function createTextureMaterial(texture?: THREE.Texture) {
  return new THREE.MeshStandardMaterial({
    color: texture ? "white" : "#f4f1eb",
    map: texture,
    roughness: 0.75,
  });
}
