import { ConfigProvider, Spin, theme } from "antd";
import jaJP from "antd/locale/ja_JP";
import { Navigate, Route, Routes } from "react-router-dom";
import { useMe } from "@/api/hooks";
import { useAuthStore } from "@/stores/authStore";
import AppLayout from "@/components/Layout/AppLayout";
import LoginPage from "@/pages/LoginPage";
import DevicePage from "@/pages/DevicePage";
import ImportPage from "@/pages/ImportPage";
import OfficeListPage from "@/pages/OfficeListPage";
import AdminPage from "@/pages/AdminPage";
import ReservationsPage from "@/pages/ReservationsPage";
import StatisticsPage from "@/pages/StatisticsPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const setAuth = useAuthStore((s) => s.setAuth);
  const { data: user, isLoading, isError } = useMe();

  if (!token) return <Navigate to="/login" />;
  if (isLoading) return <Spin size="large" style={{ display: "block", margin: "200px auto" }} />;
  if (isError) return <Navigate to="/login" />;
  if (user && !useAuthStore.getState().user) {
    setAuth(token, user);
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <ConfigProvider locale={jaJP} theme={{ algorithm: theme.defaultAlgorithm }}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Routes>
                  <Route path="/" element={<DevicePage />} />
                  <Route path="/offices" element={<OfficeListPage />} />
                  <Route path="/statistics" element={<StatisticsPage />} />
                  <Route path="/reservations" element={<ReservationsPage />} />
                  <Route path="/import" element={<ImportPage />} />
                  <Route path="/admin" element={<AdminPage />} />
                  <Route path="*" element={<Navigate to="/" />} />
                </Routes>
              </AppLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </ConfigProvider>
  );
}
