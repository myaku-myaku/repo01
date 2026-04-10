import { Card, Col, Progress, Row, Statistic, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useModelStats, useRegionStats, useSummaryStats } from "@/api/hooks";
import type { ModelStats, RegionStatsData } from "@/types";

export default function StatisticsPage() {
  const { data: summary, isLoading: summaryLoading } = useSummaryStats();
  const { data: modelStats } = useModelStats();
  const { data: regionStats } = useRegionStats();

  const modelColumns: ColumnsType<ModelStats> = [
    { title: "機種", dataIndex: "model", render: (v: string | null) => v || "-" },
    { title: "ベンダー", dataIndex: "vendor", render: (v: string | null) => v || "-" },
    { title: "装置数", dataIndex: "host_count", width: 80, sorter: (a, b) => a.host_count - b.host_count },
    { title: "総ポート数", dataIndex: "total_ports", width: 100 },
    { title: "空きポート", dataIndex: "available_ports", width: 100 },
    {
      title: "利用率",
      dataIndex: "utilization_pct",
      width: 120,
      sorter: (a, b) => a.utilization_pct - b.utilization_pct,
      render: (v: number) => <Progress percent={v} size="small" />,
    },
  ];

  const regionColumns: ColumnsType<RegionStatsData> = [
    { title: "地域", dataIndex: "region_name" },
    { title: "装置数", dataIndex: "host_count", width: 80 },
    { title: "総ポート数", dataIndex: "total_ports", width: 100 },
    { title: "空きポート", dataIndex: "available_ports", width: 100 },
    {
      title: "利用率",
      dataIndex: "utilization_pct",
      width: 120,
      render: (v: number) => <Progress percent={v} size="small" />,
    },
  ];

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

      <Row gutter={16}>
        <Col span={14}>
          <Card title="機種別統計">
            <Table
              columns={modelColumns}
              dataSource={modelStats}
              rowKey={(r) => `${r.vendor}-${r.model}`}
              size="small"
              pagination={{ pageSize: 20 }}
            />
          </Card>
        </Col>
        <Col span={10}>
          <Card title="地域別統計">
            <Table
              columns={regionColumns}
              dataSource={regionStats}
              rowKey="region_name"
              size="small"
              pagination={false}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
