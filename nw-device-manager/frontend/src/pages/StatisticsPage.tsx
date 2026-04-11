import { Card, Col, Progress, Row, Select, Statistic, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useBoardStats, useModelStats, useRateStats, useRegionStats, useSummaryStats } from "@/api/hooks";
import type { BoardStatsData } from "@/api/hooks";
import type { ModelStats, RateStatsData, RegionStatsData } from "@/types";
import ResizableTable from "@/components/ResizableTable";

export default function StatisticsPage() {
  const { data: summary, isLoading: summaryLoading } = useSummaryStats();
  const { data: rateStats } = useRateStats();
  const { data: boardStats } = useBoardStats();
  const [selectedRate, setSelectedRate] = useState<string | null>(null);
  const { data: modelStats } = useModelStats(selectedRate);
  const { data: regionStats } = useRegionStats(selectedRate);

  const rateOptions = [
    { label: "すべて", value: "" },
    ...(rateStats?.map((r) => ({ label: r.rate_category, value: r.rate_category })) ?? []),
  ];

  const modelColumns: ColumnsType<ModelStats> = [
    { title: "機種", dataIndex: "model", width: 180, sorter: (a, b) => (a.model || "").localeCompare(b.model || ""), render: (v: string | null) => v || "-" },
    { title: "ベンダー", dataIndex: "vendor", width: 100, sorter: (a, b) => (a.vendor || "").localeCompare(b.vendor || ""), render: (v: string | null) => v || "-" },
    { title: "装置数", dataIndex: "host_count", width: 80, sorter: (a, b) => a.host_count - b.host_count },
    { title: "総ポート数", dataIndex: "total_ports", width: 90, sorter: (a, b) => a.total_ports - b.total_ports },
    { title: "空きポート", dataIndex: "available_ports", width: 90, sorter: (a, b) => a.available_ports - b.available_ports },
    {
      title: "利用率",
      dataIndex: "utilization_pct",
      width: 140,
      sorter: (a, b) => a.utilization_pct - b.utilization_pct,
      render: (v: number) => <Progress percent={v} size="small" />,
    },
  ];

  const regionColumns: ColumnsType<RegionStatsData> = [
    { title: "地域", dataIndex: "region_name", width: 100, sorter: (a, b) => a.region_name.localeCompare(b.region_name) },
    { title: "装置数", dataIndex: "host_count", width: 80, sorter: (a, b) => a.host_count - b.host_count },
    { title: "総ポート数", dataIndex: "total_ports", width: 90, sorter: (a, b) => a.total_ports - b.total_ports },
    { title: "空きポート", dataIndex: "available_ports", width: 90, sorter: (a, b) => a.available_ports - b.available_ports },
    {
      title: "利用率",
      dataIndex: "utilization_pct",
      width: 140,
      sorter: (a, b) => a.utilization_pct - b.utilization_pct,
      render: (v: number) => <Progress percent={v} size="small" />,
    },
  ];

  const rateColumns: ColumnsType<RateStatsData> = [
    {
      title: "速度",
      dataIndex: "rate_category",
      width: 100,
      render: (v: string) => <Tag color="blue">{v}</Tag>,
    },
    { title: "総ポート数", dataIndex: "total_ports", width: 100, sorter: (a, b) => a.total_ports - b.total_ports },
    { title: "空き", dataIndex: "available_ports", width: 80, sorter: (a, b) => a.available_ports - b.available_ports },
    { title: "使用中", dataIndex: "in_use_ports", width: 80, sorter: (a, b) => a.in_use_ports - b.in_use_ports },
    { title: "予約済", dataIndex: "reserved_ports", width: 80, sorter: (a, b) => a.reserved_ports - b.reserved_ports },
    {
      title: "利用率",
      dataIndex: "utilization_pct",
      width: 140,
      sorter: (a, b) => a.utilization_pct - b.utilization_pct,
      render: (v: number) => <Progress percent={v} size="small" />,
    },
  ];

  const boardColumns: ColumnsType<BoardStatsData> = [
    { title: "ボード名", dataIndex: "board_name", width: 180, sorter: (a, b) => (a.board_name || "").localeCompare(b.board_name || ""), render: (v: string | null) => v || "-" },
    { title: "搭載数", dataIndex: "slot_count", width: 80, sorter: (a, b) => a.slot_count - b.slot_count, defaultSortOrder: "descend" },
    { title: "総ポート数", dataIndex: "total_ports", width: 90, sorter: (a, b) => a.total_ports - b.total_ports },
    { title: "空き", dataIndex: "available_ports", width: 80, sorter: (a, b) => a.available_ports - b.available_ports },
    { title: "使用中", dataIndex: "in_use_ports", width: 80, sorter: (a, b) => a.in_use_ports - b.in_use_ports },
    {
      title: "利用率",
      dataIndex: "utilization_pct",
      width: 140,
      sorter: (a, b) => a.utilization_pct - b.utilization_pct,
      render: (v: number) => <Progress percent={v} size="small" />,
    },
  ];

  const rateLabel = selectedRate ? ` (${selectedRate})` : "";

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card>
            <Statistic title="総装置数" value={summary?.total_hosts || 0} loading={summaryLoading} />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic title="総スロット数" value={summary?.total_slots || 0} loading={summaryLoading} />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic title="総ポート数" value={summary?.total_ports || 0} loading={summaryLoading} />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic title="空きポート" value={summary?.available_ports || 0} loading={summaryLoading} valueStyle={{ color: "#3f8600" }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic title="使用中" value={summary?.in_use_ports || 0} loading={summaryLoading} valueStyle={{ color: "#cf1322" }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic title="予約済" value={summary?.reserved_ports || 0} loading={summaryLoading} valueStyle={{ color: "#fa8c16" }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={24}>
          <Card title="速度別統計">
            <ResizableTable
              columns={rateColumns}
              dataSource={rateStats}
              rowKey="rate_category"
              size="small"
              pagination={false}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={24}>
          <span style={{ marginRight: 8 }}>帯域フィルタ:</span>
          <Select
            style={{ width: 160 }}
            value={selectedRate ?? ""}
            onChange={(v) => setSelectedRate(v || null)}
            options={rateOptions}
          />
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={14}>
          <Card title={`機種別統計${rateLabel}`}>
            <ResizableTable
              columns={modelColumns}
              dataSource={modelStats}
              rowKey={(r) => `${r.vendor}-${r.model}`}
              size="small"
              pagination={{ pageSize: 20 }}
            />
          </Card>
        </Col>
        <Col span={10}>
          <Card title={`地域別統計${rateLabel}`}>
            <ResizableTable
              columns={regionColumns}
              dataSource={regionStats}
              rowKey="region_name"
              size="small"
              pagination={false}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={24}>
          <Card title="ボード別統計">
            <ResizableTable
              columns={boardColumns}
              dataSource={boardStats}
              rowKey={(r) => r.board_name || "_none"}
              size="small"
              pagination={{ pageSize: 20, showSizeChanger: true }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
