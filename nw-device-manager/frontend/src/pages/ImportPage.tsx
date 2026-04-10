import { InboxOutlined } from "@ant-design/icons";
import { Card, message, Result, Upload } from "antd";
import { useState } from "react";
import { useImportFile } from "@/api/hooks";

export default function ImportPage() {
  const importFile = useImportFile();
  const [result, setResult] = useState<{
    message: string;
    created_hosts: number;
    created_slots: number;
    created_ports: number;
    total_records: number;
  } | null>(null);

  return (
    <Card title="データインポート" style={{ maxWidth: 800, margin: "0 auto" }}>
      <Upload.Dragger
        accept=".csv,.xlsx,.xls"
        showUploadList={false}
        customRequest={async ({ file, onSuccess, onError }) => {
          try {
            const data = await importFile.mutateAsync(file as File);
            setResult(data);
            message.success("インポートが完了しました");
            onSuccess?.(data);
          } catch (err: unknown) {
            const errorMsg =
              err instanceof Error ? err.message : "インポートに失敗しました";
            message.error(errorMsg);
            onError?.(err as Error);
          }
        }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">
          CSV または XLSX ファイルをドラッグ＆ドロップ、またはクリックして選択
        </p>
        <p className="ant-upload-hint">
          Huawei (LTP/NE Report), ZTE (CTNSDH Port Status), RBBN (Managed Elements/Ports) に対応
        </p>
      </Upload.Dragger>

      {result && (
        <Result
          status="success"
          title={result.message}
          subTitle={`装置: ${result.created_hosts}件, スロット: ${result.created_slots}件, ポート: ${result.created_ports}件 (全${result.total_records}レコード)`}
          style={{ marginTop: 24 }}
        />
      )}
    </Card>
  );
}
