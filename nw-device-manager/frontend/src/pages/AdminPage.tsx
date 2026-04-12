import { useState } from "react";
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  message,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  PlusOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import apiClient from "@/api/client";
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
} from "@/api/hooks";
import { useAuthStore } from "@/stores/authStore";
import type { User } from "@/types";

export default function AdminPage() {
  const currentUser = useAuthStore((s) => s.user);
  const { data: users, isLoading } = useUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();

  // --- データ削除 ---
  const deleteAll = useMutation({
    mutationFn: () => apiClient.delete("/admin/data"),
    onSuccess: () => message.success("全データを削除しました"),
    onError: () => message.error("削除に失敗しました"),
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

  // --- ユーザー作成 ---
  const handleCreate = async (values: {
    username: string;
    email?: string;
    display_name?: string;
    password: string;
    role: "admin" | "user";
  }) => {
    try {
      await createUser.mutateAsync(values);
      message.success("ユーザーを作成しました");
      setCreateOpen(false);
      createForm.resetFields();
    } catch (e: any) {
      message.error(
        e?.response?.data?.detail || "作成に失敗しました"
      );
    }
  };

  // --- ユーザー編集 ---
  const openEdit = (user: User) => {
    setEditTarget(user);
    editForm.setFieldsValue({
      email: user.email || "",
      display_name: user.display_name || "",
      role: user.role,
      is_active: user.is_active,
      password: "",
    });
  };

  const handleEdit = async (values: {
    email?: string;
    display_name?: string;
    password?: string;
    role: "admin" | "user";
    is_active: boolean;
  }) => {
    if (!editTarget) return;
    const data: Record<string, unknown> = {
      email: values.email || null,
      display_name: values.display_name || null,
      role: values.role,
      is_active: values.is_active,
    };
    if (values.password) {
      data.password = values.password;
    }
    try {
      await updateUser.mutateAsync({ userId: editTarget.id, data });
      message.success("ユーザーを更新しました");
      setEditTarget(null);
    } catch (e: any) {
      message.error(
        e?.response?.data?.detail || "更新に失敗しました"
      );
    }
  };

  // --- ユーザー削除 ---
  const handleDelete = (user: User) => {
    Modal.confirm({
      title: "ユーザー削除",
      icon: <ExclamationCircleOutlined />,
      content: `「${user.username}」を削除しますか？この操作は取り消せません。`,
      okText: "削除する",
      okType: "danger",
      cancelText: "キャンセル",
      onOk: async () => {
        try {
          await deleteUser.mutateAsync(user.id);
          message.success("ユーザーを削除しました");
        } catch (e: any) {
          message.error(
            e?.response?.data?.detail || "削除に失敗しました"
          );
        }
      },
    });
  };

  const columns = [
    {
      title: "ユーザー名",
      dataIndex: "username",
      key: "username",
    },
    {
      title: "メールアドレス",
      dataIndex: "email",
      key: "email",
      render: (v: string | null) => v || "-",
    },
    {
      title: "表示名",
      dataIndex: "display_name",
      key: "display_name",
      render: (v: string | null) => v || "-",
    },
    {
      title: "ロール",
      dataIndex: "role",
      key: "role",
      render: (role: string) =>
        role === "admin" ? (
          <Tag color="red">管理者</Tag>
        ) : (
          <Tag color="blue">一般</Tag>
        ),
    },
    {
      title: "状態",
      dataIndex: "is_active",
      key: "is_active",
      render: (active: boolean) =>
        active ? (
          <Tag color="green">有効</Tag>
        ) : (
          <Tag color="default">無効</Tag>
        ),
    },
    {
      title: "操作",
      key: "actions",
      render: (_: unknown, record: User) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(record)}
          >
            編集
          </Button>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record)}
            disabled={record.id === currentUser?.id}
          >
            削除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ユーザー管理 */}
      <Card
        title={
          <Space>
            <UserOutlined />
            ユーザー管理
          </Space>
        }
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            ユーザー追加
          </Button>
        }
      >
        <Table
          dataSource={users}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          size="middle"
          pagination={false}
        />
      </Card>

      {/* データ管理 */}
      <Card title="データ管理">
        <p>
          全ての装置データ（地域・都道府県・局舎・装置・スロット・ポート・予約）を削除します。ユーザー情報は保持されます。
        </p>
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

      {/* 作成モーダル */}
      <Modal
        title="ユーザー追加"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          createForm.resetFields();
        }}
        footer={null}
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={{ role: "user" }}
        >
          <Form.Item
            name="username"
            label="アカウント名"
            rules={[{ required: true, message: "アカウント名を入力してください" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="email"
            label="メールアドレス"
            rules={[{ type: "email", message: "正しいメールアドレスを入力してください" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="display_name" label="表示名">
            <Input />
          </Form.Item>
          <Form.Item
            name="password"
            label="パスワード"
            rules={[{ required: true, message: "パスワードを入力してください" }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label="ロール">
            <Select>
              <Select.Option value="user">一般</Select.Option>
              <Select.Option value="admin">管理者</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={createUser.isPending}
              block
            >
              作成
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* 編集モーダル */}
      <Modal
        title={`ユーザー編集: ${editTarget?.username}`}
        open={!!editTarget}
        onCancel={() => setEditTarget(null)}
        footer={null}
      >
        <Form form={editForm} layout="vertical" onFinish={handleEdit}>
          <Form.Item
            name="email"
            label="メールアドレス"
            rules={[{ type: "email", message: "正しいメールアドレスを入力してください" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="display_name" label="表示名">
            <Input />
          </Form.Item>
          <Form.Item
            name="password"
            label="パスワード"
            extra="変更する場合のみ入力"
          >
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label="ロール">
            <Select>
              <Select.Option value="user">一般</Select.Option>
              <Select.Option value="admin">管理者</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="is_active"
            label="有効"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={updateUser.isPending}
              block
            >
              更新
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
