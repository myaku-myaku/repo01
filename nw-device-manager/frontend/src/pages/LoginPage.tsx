import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Card, Form, Input, message, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { useLogin } from "@/api/hooks";
import { useAuthStore } from "@/stores/authStore";

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useLogin();
  const setAuth = useAuthStore((s) => s.setAuth);

  const onFinish = async (values: { username: string; password: string }) => {
    try {
      const data = await login.mutateAsync(values);
      setAuth(data.access_token, { id: 0, username: values.username, display_name: null, role: "user", is_active: true });
      navigate("/");
    } catch {
      message.error("ログインに失敗しました");
    }
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f0f2f5" }}>
      <Card style={{ width: 400 }}>
        <Typography.Title level={3} style={{ textAlign: "center", marginBottom: 24 }}>
          NW Device Manager
        </Typography.Title>
        <Form onFinish={onFinish} autoComplete="off">
          <Form.Item name="username" rules={[{ required: true, message: "ユーザー名を入力してください" }]}>
            <Input prefix={<UserOutlined />} placeholder="ユーザー名" size="large" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: "パスワードを入力してください" }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="パスワード" size="large" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={login.isPending} block size="large">
              ログイン
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
