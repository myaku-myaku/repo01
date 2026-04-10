import {
  BarChartOutlined,
  CloudServerOutlined,
  LogoutOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { Layout, Menu, Typography } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";

const { Header, Content } = Layout;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  const menuItems = [
    { key: "/", icon: <CloudServerOutlined />, label: "装置管理" },
    { key: "/statistics", icon: <BarChartOutlined />, label: "統計" },
    { key: "/import", icon: <UploadOutlined />, label: "インポート" },
  ];

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header
        style={{
          display: "flex",
          alignItems: "center",
          background: "#001529",
          padding: "0 24px",
        }}
      >
        <Typography.Text
          strong
          style={{ color: "#fff", fontSize: 18, marginRight: 40, whiteSpace: "nowrap" }}
        >
          NW Device Manager
        </Typography.Text>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ flex: 1 }}
        />
        <Typography.Text style={{ color: "#aaa", marginRight: 16 }}>
          {user?.display_name || user?.username}
        </Typography.Text>
        <LogoutOutlined
          style={{ color: "#aaa", fontSize: 18, cursor: "pointer" }}
          onClick={() => {
            logout();
            navigate("/login");
          }}
        />
      </Header>
      <Content style={{ padding: 16, background: "#f0f2f5" }}>{children}</Content>
    </Layout>
  );
}
