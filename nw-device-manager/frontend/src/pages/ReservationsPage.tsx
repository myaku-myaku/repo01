import { useMemo, useState } from "react";
import { Button, Card, Checkbox, Modal, Select, Space, Table, Tag, message } from "antd";
import { ExclamationCircleOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import {
  useReservations,
  useRegionTree,
  useOffices,
  useHostsByOffice,
  useReleaseReservation,
  type ReservationListItem,
} from "@/api/hooks";
import { useAuthStore } from "@/stores/authStore";

const statusLabels: Record<string, { label: string; color: string }> = {
  active: { label: "有効", color: "green" },
  released: { label: "解除済", color: "default" },
  expired: { label: "期限切れ", color: "red" },
};

function formatDt(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function ReservationsPage() {
  const currentUser = useAuthStore((s) => s.user);
  const [statusFilter, setStatusFilter] = useState<string | undefined>("active");
  const [regionId, setRegionId] = useState<number | undefined>();
  const [prefectureId, setPrefectureId] = useState<number | undefined>();
  const [officeId, setOfficeId] = useState<number | undefined>();
  const [hostId, setHostId] = useState<number | undefined>();
  const [myOnly, setMyOnly] = useState(false);

  const { data: regions } = useRegionTree();
  const { data: offices } = useOffices(prefectureId ?? null);
  const { data: hosts } = useHostsByOffice(officeId ?? null);
  const releaseReservation = useReleaseReservation();

  const params = useMemo(() => {
    const p: Record<string, unknown> = {};
    if (statusFilter) p.status = statusFilter;
    if (myOnly) p.my_only = true;
    if (hostId) p.host_id = hostId;
    else if (officeId) p.office_id = officeId;
    else if (prefectureId) p.prefecture_id = prefectureId;
    else if (regionId) p.region_id = regionId;
    return p;
  }, [statusFilter, myOnly, regionId, prefectureId, officeId, hostId]);

  const { data: reservations, isLoading } = useReservations(params);

  const prefectures = useMemo(() => {
    if (!regionId || !regions) return [];
    const region = regions.find((r) => r.id === regionId);
    return region?.prefectures ?? [];
  }, [regionId, regions]);

  const canRelease = (record: ReservationListItem) => {
    if (record.status !== "active") return false;
    if (currentUser?.role === "admin") return true;
    if (currentUser?.id === record.reserved_by) return true;
    return false;
  };

  const handleRelease = (record: ReservationListItem) => {
    Modal.confirm({
      title: "予約解除",
      icon: <ExclamationCircleOutlined />,
      content: `${record.hostname} Slot${record.slot_number}-Port${record.port_number} の予約を解除しますか？`,
      okText: "解除する",
      okType: "danger",
      cancelText: "キャンセル",
      onOk: async () => {
        try {
          await releaseReservation.mutateAsync(record.port_id);
          message.success("予約を解除しました");
        } catch (e: any) {
          message.error(e?.response?.data?.detail || "解除に失敗しました");
        }
      },
    });
  };

  const columns: ColumnsType<ReservationListItem> = [
    {
      title: "ステータス",
      dataIndex: "status",
      width: 90,
      render: (s: string) => {
        const info = statusLabels[s] || { label: s, color: "default" };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    { title: "局舎", dataIndex: "office_name", width: 120 },
    { title: "県域", dataIndex: "prefecture_name", width: 80 },
    { title: "装置", dataIndex: "hostname", width: 200 },
    { title: "スロット", dataIndex: "slot_number", width: 80 },
    { title: "ポート", dataIndex: "port_number", width: 80 },
    { title: "タイプ", dataIndex: "port_type", width: 80 },
    { title: "レート", dataIndex: "port_rate", width: 100 },
    { title: "目的", dataIndex: "purpose", width: 200, ellipsis: true },
    { title: "予約者", dataIndex: "reserved_by_name", width: 120 },
    {
      title: "予約日時",
      dataIndex: "reserved_at",
      width: 150,
      render: (v: string) => formatDt(v),
    },
    {
      title: "有効期限",
      dataIndex: "expires_at",
      width: 140,
      render: (v: string | null) => formatDt(v),
    },
    {
      title: "操作",
      width: 90,
      fixed: "right",
      render: (_: unknown, record: ReservationListItem) => {
        if (!canRelease(record)) return null;
        return (
          <Button
            size="small"
            type="link"
            danger
            onClick={() => handleRelease(record)}
          >
            解除
          </Button>
        );
      },
    },
  ];

  return (
    <Card
      title={`予約一覧 (${reservations?.length ?? 0}件)`}
      extra={
        <Space wrap>
          <Checkbox
            checked={myOnly}
            onChange={(e) => setMyOnly(e.target.checked)}
          >
            自分の予約のみ
          </Checkbox>
          <Select
            allowClear
            placeholder="ステータス"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
            style={{ width: 120 }}
            options={[
              { value: "active", label: "有効" },
              { value: "released", label: "解除済" },
              { value: "expired", label: "期限切れ" },
            ]}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="地域"
            value={regionId}
            onChange={(v) => {
              setRegionId(v);
              setPrefectureId(undefined);
              setOfficeId(undefined);
              setHostId(undefined);
            }}
            style={{ width: 140 }}
            options={regions?.map((r) => ({ value: r.id, label: r.name }))}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="県域"
            value={prefectureId}
            onChange={(v) => {
              setPrefectureId(v);
              setOfficeId(undefined);
              setHostId(undefined);
            }}
            style={{ width: 140 }}
            disabled={!regionId}
            options={prefectures.map((p) => ({
              value: p.id,
              label: p.name,
            }))}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="局舎"
            value={officeId}
            onChange={(v) => {
              setOfficeId(v);
              setHostId(undefined);
            }}
            style={{ width: 160 }}
            disabled={!prefectureId}
            options={offices?.map((o) => ({
              value: o.id,
              label: `${o.code} ${o.name}`,
            }))}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="装置"
            value={hostId}
            onChange={setHostId}
            style={{ width: 200 }}
            disabled={!officeId}
            options={hosts?.map((h) => ({
              value: h.id,
              label: h.hostname,
            }))}
          />
        </Space>
      }
    >
      <Table
        dataSource={reservations}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        size="middle"
        pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ["20", "50", "100"] }}
        scroll={{ x: 1500 }}
      />
    </Card>
  );
}
