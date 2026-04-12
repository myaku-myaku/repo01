import { Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { TableProps } from "antd";
import { useCallback, useState } from "react";
import { Resizable } from "react-resizable";
import "react-resizable/css/styles.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ResizableCell(props: any) {
  const { onResize, width, ...restProps } = props;
  if (!width) return <th {...restProps} />;
  return (
    <Resizable
      width={width}
      height={0}
      handle={
        <span
          className="react-resizable-handle"
          style={{ position: "absolute", right: -5, bottom: 0, top: 0, width: 10, cursor: "col-resize", zIndex: 1 }}
          onClick={(e) => e.stopPropagation()}
        />
      }
      onResize={onResize}
      draggableOpts={{ enableUserSelectHack: false }}
    >
      <th {...restProps} />
    </Resizable>
  );
}

interface ResizableTableProps<T> extends Omit<TableProps<T>, "columns"> {
  columns: ColumnsType<T>;
}

export default function ResizableTable<T extends object>({ columns, ...rest }: ResizableTableProps<T>) {
  const [colWidths, setColWidths] = useState<(number | undefined)[]>(() =>
    columns.map((c) => (c.width ? Number(c.width) : undefined))
  );

  const handleResize = useCallback(
    (index: number) =>
      (_: unknown, { size }: { size: { width: number } }) => {
        setColWidths((prev) => {
          const next = [...prev];
          next[index] = size.width;
          return next;
        });
      },
    []
  );

  const mergedColumns = columns.map((col, i) => ({
    ...col,
    width: colWidths[i] ?? col.width,
    onHeaderCell: () => ({
      width: colWidths[i] ?? (col.width ? Number(col.width) : 0),
      onResize: handleResize(i),
    }),
  }));

  return (
    <Table
      {...rest}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      columns={mergedColumns as any}
      components={{ header: { cell: ResizableCell } }}
    />
  );
}
