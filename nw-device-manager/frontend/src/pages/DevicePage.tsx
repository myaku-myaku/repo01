import { Card } from "antd";
import { useCallback, useRef, useState } from "react";
import DeviceTree from "@/components/DeviceTree/DeviceTree";
import HostDetailView from "@/components/HostDetail/HostDetailView";

export default function DevicePage() {
  const [selectedHostId, setSelectedHostId] = useState<number | null>(null);
  const [treeWidth, setTreeWidth] = useState(320);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = treeWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const newWidth = startWidth.current + (ev.clientX - startX.current);
      setTreeWidth(Math.max(200, Math.min(600, newWidth)));
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [treeWidth]);

  return (
    <div style={{ display: "flex", height: "calc(100vh - 96px)" }}>
      <Card
        title="装置ツリー"
        size="small"
        style={{ width: treeWidth, minWidth: 200, display: "flex", flexDirection: "column", flexShrink: 0 }}
        styles={{ body: { padding: 0, flex: 1, overflowY: "auto" } }}
      >
        <DeviceTree onSelectHost={setSelectedHostId} />
      </Card>
      <div
        onMouseDown={onMouseDown}
        style={{
          width: 6,
          flexShrink: 0,
          cursor: "col-resize",
          background: "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ width: 2, height: 32, borderRadius: 1, background: "#d9d9d9" }} />
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <HostDetailView hostId={selectedHostId} />
      </div>
    </div>
  );
}
