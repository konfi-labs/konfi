import { DragItem, Order, OrderStatus } from "@konfi/types";
import { useCallback, useEffect, useRef, useState } from "react";

const useColumnDrop = (
  column: keyof typeof OrderStatus,
  handleDrop: (
    fromColumn: keyof typeof OrderStatus,
    orderId: Order["id"],
  ) => void,
) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isOver, setIsOver] = useState(false);

  const onDragOver = useCallback((e: DragEvent) => {
    // Allow dropping by preventing default
    e.preventDefault();
    const dt = e.dataTransfer;
    if (!dt) return;
    dt.dropEffect = "move";
  }, []);

  const onDragEnter = useCallback(() => setIsOver(true), []);
  const onDragLeave = useCallback((e: DragEvent) => {
    // Only set false when leaving the container entirely
    if (ref.current && !ref.current.contains(e.relatedTarget as Node)) {
      setIsOver(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsOver(false);
      try {
        const dt = e.dataTransfer;
        if (!dt) return;
        const data = dt.getData("application/x-konfi-order");
        if (!data) return;
        const dragItem = JSON.parse(data) as DragItem;
        if (!dragItem || (dragItem as any).from === column) return;
        handleDrop((dragItem as any).from, (dragItem as any).id as Order["id"]);
      } catch {
        // ignore
      }
    },
    [column, handleDrop],
  );

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    node.addEventListener("dragover", onDragOver as unknown as EventListener);
    node.addEventListener("dragenter", onDragEnter as unknown as EventListener);
    node.addEventListener("dragleave", onDragLeave as unknown as EventListener);
    node.addEventListener("drop", onDrop as unknown as EventListener);

    return () => {
      node.removeEventListener(
        "dragover",
        onDragOver as unknown as EventListener,
      );
      node.removeEventListener(
        "dragenter",
        onDragEnter as unknown as EventListener,
      );
      node.removeEventListener(
        "dragleave",
        onDragLeave as unknown as EventListener,
      );
      node.removeEventListener("drop", onDrop as unknown as EventListener);
    };
  }, [onDragOver, onDragEnter, onDragLeave, onDrop]);

  return {
    isOver,
    dropRef: ref,
  } as const;
};

export default useColumnDrop;
