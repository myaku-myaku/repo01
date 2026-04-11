import { Button, Card, Modal, message } from "antd";
import { DeleteOutlined, ExclamationCircleOutlined } from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import apiClient from "@/api/client";

export default function AdminPage() {
  const deleteAll = useMutation({
    mutationFn: () => apiClient.delete("/admin/data"),
    onSuccess: () => {
      message.success("全データを削除しました");
    },
    onError: () => {
      message.error("削除に失敗しました");
    },
  });

  const handleDeleteAll = () => {
    Modal.confirm({
      title: "全データ削除",
      icon: <ExclamationCircleOutlined />,
      content:
        "装置・スロット・ポート・局舎・地域など全てのデータが削除されます。ユーザー情報は保持されます。この操作は取り消せません。",
      okText: "削除する",
      okType: "danger",
      cancelText: "キャンセル",
      onOk: () => deleteAll.mutateAsync(),
    });
  };

  return (
    <Card title="管理">
      <Card type="inner" title="データ管理" style={{ maxWidth: 600 }}>
        <p>全ての装置データ（地域・都道府県・局舎・装置・スロット・ポート・予約）を削除します。ユーザー情報は保持されます。</p>
        <Button
          danger
          type="primary"
          icon={<DeleteOutlined />}
          loading={deleteAll.isPending}
          onClick={handleDeleteAll}
        >
          全データ削除
        </Button>
      </Card>
    </Card>
  );
}
