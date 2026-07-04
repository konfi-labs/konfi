import { DragItem, Order } from "@konfi/types";
import { useEffect, useRef, useState } from "react";

const useTaskDragAndDrop = <T>({
  order,
  index,
}: {
  order: Order;
  index: number;
}) => {
  const ref = useRef<T>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const node = ref.current as unknown as HTMLElement | null;
    if (!node) return;

    // Ensure element is draggable
    node.setAttribute("draggable", "true");

    const handleDragStart = (e: DragEvent) => {
      try {
        const dt = e.dataTransfer;
        if (!dt) return;
        const payload: DragItem = {
          from: order.status,
          id: order.id,
          index,
        } as DragItem;
        dt.setData("application/x-konfi-order", JSON.stringify(payload));
        dt.effectAllowed = "move";
        setIsDragging(true);
      } catch {
        // noop
      }
    };

    const handleDragEnd = () => {
      setIsDragging(false);
    };

    // Attach listeners
    node.addEventListener(
      "dragstart",
      handleDragStart as unknown as EventListener,
    );
    node.addEventListener("dragend", handleDragEnd as unknown as EventListener);

    return () => {
      node.removeEventListener(
        "dragstart",
        handleDragStart as unknown as EventListener,
      );
      node.removeEventListener(
        "dragend",
        handleDragEnd as unknown as EventListener,
      );
    };
  }, [order.id, order.status, index]);

  return {
    ref,
    isDragging,
  };
};

export default useTaskDragAndDrop;
