import {
  BarChartOutlined,
  BankOutlined,
  BookOutlined,
  CloudServerOutlined,
  LogoutOutlined,
  SettingOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { Layout, Menu, Typography } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useLatestImports, type ImportVendorLog } from "@/api/hooks";

const { Header, Content } = Layout;

function formatDt(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

function ImportInfo({ logs }: { logs: ImportVendorLog[] }) {
  if (!logs.length) return null;
  return (
    <div style={{ marginRight: 16, lineHeight: 1.3, textAlign: "right" }}>
      {logs.map((log) => (
        <div key={log.vendor} style={{ color: "#888", fontSize: 11, whiteSpace: "nowrap" }}>
          {log.vendor}: {log.file_exported_at ? `出力 ${formatDt(log.file_exported_at)}` : `取込 ${formatDt(log.imported_at)}`}
        </div>
      ))}
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const { data: importLogs } = useLatestImports();

  const menuItems = [
    { key: "/", icon: <CloudServerOutlined />, label: "装置管理" },
    { key: "/offices", icon: <BankOutlined />, label: "局舎一覧" },
    { key: "/reservations", icon: <BookOutlined />, label: "予約一覧" },
    { key: "/statistics", icon: <BarChartOutlined />, label: "統計" },
    { key: "/import", icon: <UploadOutlined />, label: "インポート" },
    ...(user?.role === "admin"
      ? [{ key: "/admin", icon: <SettingOutlined />, label: "管理" }]
      : []),
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
        <img
          src="/logo.png"
          alt="PRISM"
          style={{ height: 54, marginRight: 24, marginTop: -4, marginBottom: -4, flexShrink: 0, objectFit: "contain" }}
        />
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ flex: 1 }}
        />
        {importLogs && <ImportInfo logs={importLogs} />}
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
      <Content style={{ padding: 16, background: "#f0f2f5", overflow: "hidden" }}>{children}</Content>
    </Layout>
  );
}
