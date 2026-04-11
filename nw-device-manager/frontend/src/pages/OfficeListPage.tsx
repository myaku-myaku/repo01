import { Button, Card, Input, Select, Space } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useMemo, useState } from "react";
import { useOfficeDeviceList, type OfficeDeviceRow } from "@/api/hooks";
import ResizableTable from "@/components/ResizableTable";

function downloadCsv(rows: OfficeDeviceRow[], models: string[]) {
  const header = ["地域", "都道府県", "局舎コード", "局舎名", "設置総数", ...models];
  const lines = rows.map((r) => {
    const base = [r.region, r.prefecture, r.office_code, r.office_name, r.total_hosts];
    const modelCounts = models.map((m) => r.models[m] || 0);
    return [...base, ...modelCounts].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
  });
  const bom = "\uFEFF";
  const csv = bom + [header.map((h) => `"${h}"`).join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `局舎別設置装置一覧_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function OfficeListPage() {
  const { data, isLoading } = useOfficeDeviceList();
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState<string>("");

  const regions = useMemo(() => {
    if (!data) return [];
    const set = new Set(data.offices.map((o) => o.region));
    return Array.from(set);
  }, [data]);

  const filteredData = useMemo(() => {
    if (!data) return [];
    let rows = data.offices;
    if (regionFilter) {
      rows = rows.filter((o) => o.region === regionFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (o) =>
          o.office_name.toLowerCase().includes(q) ||
          o.office_code.toLowerCase().includes(q) ||
          o.prefecture.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [data, search, regionFilter]);

  const handleDownload = useCallback(() => {
    if (!data) return;
    downloadCsv(filteredData, data.models);
  }, [data, filteredData]);

  const modelColumns: ColumnsType<OfficeDeviceRow> = useMemo(() => {
    if (!data) return [];
    return data.models.map((model) => ({
      title: model,
      dataIndex: ["models", model],
      key: model,
      width: 80,
      align: "center" as const,
      sorter: (a: OfficeDeviceRow, b: OfficeDeviceRow) =>
        (a.models[model] || 0) - (b.models[model] || 0),
      render: (v: number | undefined) =>
        v ? <span>{v}</span> : <span style={{ color: "#ccc" }}>-</span>,
    }));
  }, [data]);

  const columns: ColumnsType<OfficeDeviceRow> = useMemo(
    () => [
      {
        title: "地域",
        dataIndex: "region",
        width: 80,
        filters: regions.map((r) => ({ text: r, value: r })),
        onFilter: (value, record) => record.region === value,
      },
      {
        title: "都道府県",
        dataIndex: "prefecture",
        width: 90,
        sorter: (a, b) => a.prefecture.localeCompare(b.prefecture),
      },
      {
        title: "局舎コード",
        dataIndex: "office_code",
        width: 90,
        sorter: (a, b) => a.office_code.localeCompare(b.office_code),
      },
      {
        title: "局舎名",
        dataIndex: "office_name",
        width: 150,
        sorter: (a, b) => a.office_name.localeCompare(b.office_name),
      },
      {
        title: "設置総数",
        dataIndex: "total_hosts",
        width: 80,
        align: "center",
        sorter: (a, b) => a.total_hosts - b.total_hosts,
        defaultSortOrder: "descend",
        render: (v: number) => <strong>{v}</strong>,
      },
      ...modelColumns,
    ],
    [modelColumns, regions]
  );

  return (
    <Card
      title="局舎別設置装置一覧"
      extra={
        <Space>
          <Select
            style={{ width: 140 }}
            placeholder="地域"
            allowClear
            value={regionFilter || undefined}
            onChange={(v) => setRegionFilter(v || "")}
            options={regions.map((r) => ({ label: r, value: r }))}
          />
          <Input.Search
            placeholder="局舎名・コードで検索"
            allowClear
            style={{ width: 250 }}
            onSearch={setSearch}
            onChange={(e) => !e.target.value && setSearch("")}
          />
          <Button
            icon={<DownloadOutlined />}
            onClick={handleDownload}
            disabled={!filteredData.length}
          >
            CSV
          </Button>
        </Space>
      }
    >
      <ResizableTable
        columns={columns}
        dataSource={filteredData}
        rowKey="office_id"
        size="small"
        loading={isLoading}
        pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ["50", "100", "200"] }}
        scroll={{ x: "max-content" }}
      />
    </Card>
  );
}
