import { Button, Card, Input, Select, Space, Table } from "antd";
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
  const [prefectureFilter, setPrefectureFilter] = useState<string>("");

  const regions = useMemo(() => {
    if (!data) return [];
    const set = new Set(data.offices.map((o) => o.region));
    return Array.from(set);
  }, [data]);

  const prefectures = useMemo(() => {
    if (!data) return [];
    let offices = data.offices;
    if (regionFilter) {
      offices = offices.filter((o) => o.region === regionFilter);
    }
    const set = new Set(offices.map((o) => o.prefecture));
    return Array.from(set).sort();
  }, [data, regionFilter]);

  const filteredData = useMemo(() => {
    if (!data) return [];
    let rows = data.offices;
    if (regionFilter) {
      rows = rows.filter((o) => o.region === regionFilter);
    }
    if (prefectureFilter) {
      rows = rows.filter((o) => o.prefecture === prefectureFilter);
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
  }, [data, search, regionFilter, prefectureFilter]);

  const summaryTotals = useMemo(() => {
    if (!data) return { total: 0, models: {} as Record<string, number> };
    let total = 0;
    const models: Record<string, number> = {};
    for (const row of filteredData) {
      total += row.total_hosts;
      for (const m of data.models) {
        models[m] = (models[m] || 0) + (row.models[m] || 0);
      }
    }
    return { total, models };
  }, [data, filteredData]);

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

  const fixedColCount = 5;

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

  const filterLabel = regionFilter
    ? prefectureFilter
      ? `${regionFilter} / ${prefectureFilter}`
      : regionFilter
    : "全国";

  return (
    <Card
      title={`局舎別設置装置一覧（${filterLabel}: ${filteredData.length}局舎）`}
      extra={
        <Space>
          <Select
            style={{ width: 120 }}
            placeholder="地方"
            allowClear
            value={regionFilter || undefined}
            onChange={(v) => {
              setRegionFilter(v || "");
              setPrefectureFilter("");
            }}
            options={regions.map((r) => ({ label: r, value: r }))}
          />
          <Select
            style={{ width: 120 }}
            placeholder="都道府県"
            allowClear
            value={prefectureFilter || undefined}
            onChange={(v) => setPrefectureFilter(v || "")}
            options={prefectures.map((p) => ({ label: p, value: p }))}
          />
          <Input.Search
            placeholder="局舎名・コードで検索"
            allowClear
            style={{ width: 220 }}
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
        scroll={{ x: "max-content", y: "calc(100vh - 280px)" }}
        sticky
        summary={() => (
          <Table.Summary fixed="top">
            <Table.Summary.Row style={{ background: "#fafafa" }}>
              <Table.Summary.Cell index={0} colSpan={4} align="right">
                <strong>合計</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="center">
                <strong>{summaryTotals.total}</strong>
              </Table.Summary.Cell>
              {data?.models.map((m, i) => (
                <Table.Summary.Cell key={m} index={fixedColCount + i} align="center">
                  <strong>{summaryTotals.models[m] || 0}</strong>
                </Table.Summary.Cell>
              ))}
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />
    </Card>
  );
}
