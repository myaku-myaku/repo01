import { ApartmentOutlined, BankOutlined, CloudServerOutlined, GlobalOutlined } from "@ant-design/icons";
import { Spin, Tree } from "antd";
import type { DataNode, EventDataNode } from "antd/es/tree";
import { useCallback, useState } from "react";
import { useRegionTree } from "@/api/hooks";
import apiClient from "@/api/client";

interface Props {
  onSelectHost: (hostId: number) => void;
}

export default function DeviceTree({ onSelectHost }: Props) {
  const { data: regions, isLoading } = useRegionTree();
  const [officeData, setOfficeData] = useState<Record<number, DataNode[]>>({});
  const [hostData, setHostData] = useState<Record<number, DataNode[]>>({});
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);

  const buildTreeData = useCallback((): DataNode[] => {
    if (!regions) return [];
    return regions.map((region) => ({
      key: `r-${region.id}`,
      title: region.name,
      icon: <GlobalOutlined />,
      children: region.prefectures.map((pref) => ({
        key: `p-${pref.id}`,
        title: pref.name,
        icon: <ApartmentOutlined />,
        children: officeData[pref.id],
        isLeaf: false,
      })),
    }));
  }, [regions, officeData, hostData]);

  const onLoadData = async (node: EventDataNode<DataNode>) => {
    const key = String(node.key);

    if (key.startsWith("p-")) {
      const prefId = Number(key.split("-")[1]);
      if (officeData[prefId]) return;
      const { data } = await apiClient.get("/regions/offices", {
        params: { prefecture_id: prefId },
      });
      const nodes: DataNode[] = data.map(
        (office: { id: number; name: string; code: string; host_count: number }) => ({
          key: `o-${office.id}`,
          title: `${office.name}`,
          icon: <BankOutlined />,
          children: hostData[office.id],
          isLeaf: false,
        })
      );
      setOfficeData((prev) => ({ ...prev, [prefId]: nodes }));
    } else if (key.startsWith("o-")) {
      const officeId = Number(key.split("-")[1]);
      if (hostData[officeId]) return;
      const { data } = await apiClient.get("/regions/hosts", {
        params: { office_id: officeId },
      });
      const nodes: DataNode[] = data.map(
        (host: { id: number; hostname: string; model: string | null; vendor: string | null }) => ({
          key: `h-${host.id}`,
          title: (
            <span>
              <span style={{ whiteSpace: "nowrap" }}>{host.hostname}</span>
              {host.model && (
                <span style={{ display: "block", color: "#888", fontSize: 11, lineHeight: "16px", whiteSpace: "nowrap", paddingLeft: "4ch" }}>
                  {host.model}
                </span>
              )}
            </span>
          ),
          icon: <CloudServerOutlined />,
          isLeaf: true,
        })
      );
      setHostData((prev) => ({ ...prev, [officeId]: nodes }));
      setOfficeData((prev) => {
        const updated = { ...prev };
        for (const prefId of Object.keys(updated)) {
          updated[Number(prefId)] = updated[Number(prefId)].map((officeNode) =>
            officeNode.key === `o-${officeId}`
              ? { ...officeNode, children: nodes }
              : officeNode
          );
        }
        return updated;
      });
    }
  };

  const onSelect = (keys: React.Key[]) => {
    if (keys.length === 0) return;
    const key = String(keys[0]);
    if (key.startsWith("h-")) {
      onSelectHost(Number(key.split("-")[1]));
    } else {
      // Toggle expand/collapse for non-leaf nodes
      setExpandedKeys((prev) =>
        prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      );
    }
  };

  if (isLoading) return <Spin />;

  return (
    <Tree
      showIcon
      treeData={buildTreeData()}
      loadData={onLoadData}
      expandedKeys={expandedKeys}
      onExpand={(keys) => setExpandedKeys(keys)}
      onSelect={onSelect}
      style={{ background: "#fff", padding: 8 }}
    />
  );
}
