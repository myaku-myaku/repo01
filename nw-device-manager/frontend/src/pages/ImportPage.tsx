import { InboxOutlined } from "@ant-design/icons";
import { Card, Descriptions, message, Progress, Result, Tag, Upload } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import apiClient from "@/api/client";

interface TaskProgress {
  id: string;
  status: "pending" | "running" | "complete" | "failed";
  current: number;
  total: number;
  phase: string;
  message: string;
  created_hosts: number;
  created_slots: number;
  created_ports: number;
  skipped_no_office: number;
  total_records: number;
  error: string | null;
}

type UploadPhase = "idle" | "uploading" | "processing";

export default function ImportPage() {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<TaskProgress | null>(null);
  const [importing, setImporting] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");
  const [uploadPercent, setUploadPercent] = useState(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (taskId: string) => {
      stopPolling();
      setUploadPhase("processing");
      pollingRef.current = setInterval(async () => {
        try {
          const res = await apiClient.get(`/import/status/${taskId}`);
          const data: TaskProgress = res.data;
          setProgress(data);

          if (data.status === "complete") {
            stopPolling();
            setImporting(false);
            setUploadPhase("idle");
            message.success("インポートが完了しました");
            qc.invalidateQueries({ queryKey: ["regionTree"] });
            qc.invalidateQueries({ queryKey: ["offices"] });
            qc.invalidateQueries({ queryKey: ["hosts"] });
            qc.invalidateQueries({ queryKey: ["stats"] });
          } else if (data.status === "failed") {
            stopPolling();
            setImporting(false);
            setUploadPhase("idle");
            message.error(data.error || "インポートに失敗しました");
          }
        } catch {
          // Network error during polling - keep trying
        }
      }, 1000);
    },
    [qc, stopPolling]
  );

  // On mount, check if there's a running task
  useEffect(() => {
    const checkExisting = async () => {
      try {
        const res = await apiClient.get("/import/status");
        const data: TaskProgress = res.data;
        if (data.status === "running" || data.status === "pending") {
          setProgress(data);
          setImporting(true);
          setUploadPhase("processing");
          startPolling(data.id);
        } else if (data.status === "complete" || data.status === "failed") {
          setProgress(data);
        }
      } catch {
        // No existing task
      }
    };
    checkExisting();
    return stopPolling;
  }, [startPolling, stopPolling]);

  const uploadFile = useCallback(
    async (file: File) => {
      setImporting(true);
      setProgress(null);
      setUploadPhase("uploading");
      setUploadPercent(0);

      const form = new FormData();
      form.append("file", file);

      try {
        const res = await apiClient.post("/import/upload", form, {
          onUploadProgress: (e) => {
            if (e.total) {
              setUploadPercent(Math.round((e.loaded / e.total) * 100));
            }
          },
        });
        const { task_id } = res.data;
        startPolling(task_id);
      } catch (err: unknown) {
        const errorMsg =
          err instanceof Error ? err.message : "インポートに失敗しました";
        message.error(errorMsg);
        setImporting(false);
        setUploadPhase("idle");
      }
    },
    [startPolling]
  );

  const isRunning = progress?.status === "running" || progress?.status === "pending";
  const isComplete = progress?.status === "complete";
  const isFailed = progress?.status === "failed";

  const processingPercent =
    progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  return (
    <Card title="データインポート" style={{ maxWidth: 800, margin: "0 auto" }}>
      <Upload.Dragger
        accept=".csv,.xlsx,.xls,.zip"
        showUploadList={false}
        disabled={importing}
        customRequest={async ({ file, onSuccess, onError }) => {
          try {
            await uploadFile(file as File);
            onSuccess?.(null);
          } catch (err: unknown) {
            onError?.(err as Error);
          }
        }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">
          CSV / XLSX / ZIP ファイルをドラッグ＆ドロップ、またはクリックして選択
        </p>
        <p className="ant-upload-hint">
          Huawei (LTP/NE Report), ZTE (CTNSDH Port Status), RBBN に対応
        </p>
      </Upload.Dragger>

      {/* Upload progress */}
      {uploadPhase === "uploading" && (
        <div style={{ marginTop: 24 }}>
          <Progress percent={uploadPercent} status="active" />
          <p style={{ color: "#666", marginTop: 8 }}>
            ファイルをアップロード中... {uploadPercent}%
          </p>
        </div>
      )}

      {/* Processing progress */}
      {uploadPhase === "processing" && isRunning && progress && (
        <div style={{ marginTop: 24 }}>
          <Progress
            percent={processingPercent}
            status="active"
            format={() =>
              `${progress.current.toLocaleString()} / ${progress.total.toLocaleString()}`
            }
          />
          <p style={{ color: "#666", marginTop: 8 }}>{progress.message}</p>
          {(progress.created_hosts > 0 || progress.created_ports > 0) && (
            <div style={{ marginTop: 8, display: "flex", gap: 12 }}>
              <Tag color="blue">装置: {progress.created_hosts}</Tag>
              <Tag color="green">スロット: {progress.created_slots}</Tag>
              <Tag color="cyan">ポート: {progress.created_ports}</Tag>
              {progress.skipped_no_office > 0 && (
                <Tag color="orange">スキップ: {progress.skipped_no_office}</Tag>
              )}
            </div>
          )}
          <p style={{ color: "#999", marginTop: 8, fontSize: 12 }}>
            ページを離れてもインポートはバックグラウンドで継続します
          </p>
        </div>
      )}

      {isComplete && progress && (
        <Result
          status="success"
          title={progress.message}
          style={{ marginTop: 24 }}
        >
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="装置">
              {progress.created_hosts}件
            </Descriptions.Item>
            <Descriptions.Item label="スロット">
              {progress.created_slots}件
            </Descriptions.Item>
            <Descriptions.Item label="ポート">
              {progress.created_ports}件
            </Descriptions.Item>
            <Descriptions.Item label="全レコード">
              {progress.total_records}件
            </Descriptions.Item>
            {progress.skipped_no_office > 0 && (
              <Descriptions.Item label="局舎未マッチ" span={2}>
                <Tag color="orange">{progress.skipped_no_office}件スキップ</Tag>
              </Descriptions.Item>
            )}
          </Descriptions>
        </Result>
      )}

      {isFailed && progress && (
        <Result
          status="error"
          title="インポート失敗"
          subTitle={progress.error}
          style={{ marginTop: 24 }}
        />
      )}
    </Card>
  );
}
