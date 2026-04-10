import { Card, Col, Row } from "antd";
import { useState } from "react";
import DeviceTree from "@/components/DeviceTree/DeviceTree";
import HostDetailView from "@/components/HostDetail/HostDetailView";

export default function DevicePage() {
  const [selectedHostId, setSelectedHostId] = useState<number | null>(null);

  return (
    <Row gutter={16} style={{ height: "calc(100vh - 96px)" }}>
      <Col span={6}>
        <Card
          title="装置ツリー"
          size="small"
          style={{ height: "100%", overflow: "auto" }}
          styles={{ body: { padding: 0 } }}
        >
          <DeviceTree onSelectHost={setSelectedHostId} />
        </Card>
      </Col>
      <Col span={18} style={{ overflow: "auto", height: "100%" }}>
        <HostDetailView hostId={selectedHostId} />
      </Col>
    </Row>
  );
}
