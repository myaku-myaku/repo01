import {
  Badge,
  Button,
  Card,
  Descriptions,
  Input,
  message,
  Modal,
  Table,
  Tabs,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import {
  useHostDetail,
  useReleaseReservation,
  useReservePort,
  useUpdatePort,
} from "@/api/hooks";
import type { PortData, SlotData } from "@/types";

const usageStatusColors: Record<string, string> = {
  available: "green",
  in_use: "red",
  reserved: "orange",
  faulty: "default",
};

const usageStatusLabels: Record<string, string> = {
  available: "空き",
  in_use: "使用中",
  reserved: "予約済",
  faulty: "故障",
};

const slotStatusLabels: Record<string, string> = {
  empty: "空",
  installed: "実装済",
  faulty: "故障",
};

interface Props {
  hostId: number | null;
}

export default function HostDetailView({ hostId }: Props) {
  const { data: host, isLoading } = useHostDetail(hostId);
  const updatePort = useUpdatePort();
  const reservePort = useReservePort();
  const releaseReservation = useReleaseReservation();
  const [editingPort, setEditingPort] = useState<PortData | null>(null);
  const [descValue, setDescValue] = useState("");
  const [reserveModal, setReserveModal] = useState<number | null>(null);
  const [reservePurpose, setReservePurpose] = useState("");

  if (!hostId) {
    return (
      <Card>
        <p style={{ color: "#999", textAlign: "center", padding: 80 }}>
          左のツリーからホストを選択してください
        </p>
      </Card>
    );
  }

  if (isLoading || !host) {
    return <Card loading />;
  }

  const slotColumns: ColumnsType<SlotData> = [
    { title: "スロット番号", dataIndex: "slot_number", width: 120 },
    { title: "ボード名", dataIndex: "board_name" },
    { title: "ボードタイプ", dataIndex: "board_type" },
    {
      title: "ステータス",
      dataIndex: "status",
      width: 100,
      render: (s: string) => slotStatusLabels[s] || s,
    },
    {
      title: "ポート数",
      width: 80,
      render: (_: unknown, record: SlotData) => record.ports.length,
    },
  ];

  const portColumns: ColumnsType<PortData> = [
    { title: "ポート番号", dataIndex: "port_number", width: 100 },
    { title: "ポート名", dataIndex: "port_name", ellipsis: true },
    { title: "タイプ", dataIndex: "port_type", width: 100 },
    { title: "レート", dataIndex: "port_rate", width: 100 },
    {
      title: "ステータス",
      dataIndex: "usage_status",
      width: 100,
      render: (s: string) => (
        <Tag color={usageStatusColors[s]}>{usageStatusLabels[s] || s}</Tag>
      ),
    },
    {
      title: "ディスクリプション",
      dataIndex: "description",
      ellipsis: true,
      render: (text: string | null, record: PortData) => (
        <span
          style={{ cursor: "pointer", color: text ? undefined : "#ccc" }}
          onClick={() => {
            setEditingPort(record);
            setDescValue(text || "");
          }}
        >
          {text || "クリックして入力"}
        </span>
      ),
    },
    {
      title: "操作",
      width: 120,
      render: (_: unknown, record: PortData) => {
        if (record.usage_status === "available") {
          return (
            <Button
              size="small"
              type="link"
              onClick={() => {
                setReserveModal(record.id);
                setReservePurpose("");
              }}
            >
              予約
            </Button>
          );
        }
        if (record.usage_status === "reserved") {
          return (
            <Button
              size="small"
              type="link"
              danger
              onClick={async () => {
                await releaseReservation.mutateAsync(record.id);
                message.success("予約を解除しました");
              }}
            >
              解除
            </Button>
          );
        }
        return null;
      },
    },
  ];

  const allPorts = host.slots.flatMap((s) =>
    s.ports.map((p) => ({ ...p, _slotNumber: s.slot_number }))
  );

  return (
    <>
      <Card title={host.hostname} style={{ marginBottom: 16 }}>
        <Descriptions column={3} size="small">
          <Descriptions.Item label="機種">{host.model || "-"}</Descriptions.Item>
          <Descriptions.Item label="ベンダー">{host.vendor || "-"}</Descriptions.Item>
          <Descriptions.Item label="IPアドレス">{host.ip_address || "-"}</Descriptions.Item>
          <Descriptions.Item label="ソフトウェア">{host.software_version || "-"}</Descriptions.Item>
          <Descriptions.Item label="NEタイプ">{host.ne_type || "-"}</Descriptions.Item>
          <Descriptions.Item label="ステータス">
            <Badge status={host.status === "active" ? "success" : "default"} text={host.status} />
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card>
        <Tabs
          items={[
            {
              key: "slots",
              label: `スロット一覧 (${host.slots.length})`,
              children: (
                <Table
                  columns={slotColumns}
                  dataSource={host.slots}
                  rowKey="id"
                  size="small"
                  pagination={false}
                />
              ),
            },
            {
              key: "ports",
              label: `ポート一覧 (${allPorts.length})`,
              children: (
                <Table
                  columns={portColumns}
                  dataSource={allPorts}
                  rowKey="id"
                  size="small"
                  pagination={{ pageSize: 50 }}
                />
              ),
            },
          ]}
        />
      </Card>

      {/* Description edit modal */}
      <Modal
        title="ディスクリプション編集"
        open={editingPort !== null}
        onOk={async () => {
          if (!editingPort) return;
          await updatePort.mutateAsync({
            portId: editingPort.id,
            data: { description: descValue },
          });
          message.success("更新しました");
          setEditingPort(null);
        }}
        onCancel={() => setEditingPort(null)}
        confirmLoading={updatePort.isPending}
      >
        <Input.TextArea
          value={descValue}
          onChange={(e) => setDescValue(e.target.value)}
          rows={3}
          placeholder="ディスクリプションを入力"
        />
      </Modal>

      {/* Reserve modal */}
      <Modal
        title="ポート予約"
        open={reserveModal !== null}
        onOk={async () => {
          if (reserveModal === null) return;
          await reservePort.mutateAsync({
            portId: reserveModal,
            data: { purpose: reservePurpose || undefined },
          });
          message.success("予約しました");
          setReserveModal(null);
        }}
        onCancel={() => setReserveModal(null)}
        confirmLoading={reservePort.isPending}
      >
        <Input.TextArea
          value={reservePurpose}
          onChange={(e) => setReservePurpose(e.target.value)}
          rows={3}
          placeholder="予約目的（任意）"
        />
      </Modal>
    </>
  );
}
