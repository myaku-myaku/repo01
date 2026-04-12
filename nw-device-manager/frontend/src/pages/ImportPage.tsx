import { ApiOutlined, InboxOutlined, SyncOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Descriptions, Divider, message, Progress, Result, Space, Tag, Upload } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import apiClient from "@/api/client";
import { useNCEStatus, useTriggerNCESync } from "@/api/hooks";
import { useAuthStore } from "@/stores/authStore";

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

      <Divider />
      <NCESyncSection
        importing={importing}
        setImporting={setImporting}
        setProgress={setProgress}
        startPolling={startPolling}
      />
    </Card>
  );
}


function NCESyncSection({
  importing,
  setImporting,
  setProgress,
  startPolling,
}: {
  importing: boolean;
  setImporting: (v: boolean) => void;
  setProgress: (v: TaskProgress | null) => void;
  startPolling: (taskId: string) => void;
}) {
  const user = useAuthStore((s) => s.user);
  const { data: nceStatus, isLoading: nceLoading } = useNCEStatus();
  const triggerSync = useTriggerNCESync();

  const isConnected = nceStatus?.status === "ok";

  const handleSync = async () => {
    try {
      setImporting(true);
      setProgress(null);
      const result = await triggerSync.mutateAsync();
      startPolling(result.task_id);
      message.info("NCE同期を開始しました");
    } catch (err: any) {
      message.error(err?.response?.data?.detail || "NCE同期の開始に失敗しました");
      setImporting(false);
    }
  };

  const statusTag = () => {
    if (nceLoading) return <Tag>確認中...</Tag>;
    switch (nceStatus?.status) {
      case "ok":
        return <Tag color="green">接続済</Tag>;
      case "not_configured":
        return <Tag color="default">未設定</Tag>;
      case "auth_failed":
        return <Tag color="red">認証失敗</Tag>;
      case "connect_failed":
        return <Tag color="red">接続不可</Tag>;
      default:
        return <Tag color="orange">{nceStatus?.status}</Tag>;
    }
  };

  return (
    <div>
      <h3 style={{ marginBottom: 16 }}>
        <ApiOutlined style={{ marginRight: 8 }} />
        NCE NBI 自動同期
      </h3>

      <Space direction="vertical" style={{ width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span>NCE接続ステータス:</span>
          {statusTag()}
          {isConnected && nceStatus?.total_ne && (
            <span style={{ color: "#888", fontSize: 12 }}>
              (NE総数: {nceStatus.total_ne})
            </span>
          )}
        </div>

        {nceStatus?.status === "not_configured" && (
          <Alert
            type="info"
            showIcon
            message="NCE NBI未設定"
            description="サーバーの .env ファイルに NCE_BASE_URL, NCE_USERNAME, NCE_PASSWORD を設定してください。"
          />
        )}

        {nceStatus?.status === "auth_failed" && (
          <Alert
            type="warning"
            showIcon
            message="NCE認証エラー"
            description={nceStatus.message}
          />
        )}

        {nceStatus?.status === "connect_failed" && (
          <Alert
            type="error"
            showIcon
            message="NCE接続エラー"
            description={nceStatus.message}
          />
        )}

        {user?.role === "admin" && (
          <Button
            type="primary"
            icon={<SyncOutlined />}
            onClick={handleSync}
            loading={triggerSync.isPending}
            disabled={importing || !isConnected}
          >
            NCEから同期実行
          </Button>
        )}

        {user?.role !== "admin" && (
          <Alert
            type="info"
            showIcon
            message="NCE同期の実行には管理者権限が必要です"
          />
        )}

        <p style={{ color: "#999", fontSize: 12, margin: 0 }}>
          iMaster NCE-T REST NBI経由でNE・ボード・ポート情報を自動取得します。
          CSVインポートと同じ進捗表示・データ更新ロジックを使用します。
        </p>
      </Space>
    </div>
  );
}
