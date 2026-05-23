"use client";

import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  AreaChart, Area,
  PieChart, Pie, Cell,
  ScatterChart, Scatter,
  ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

const palette = [
  "#58a6ff",
  "#3fb950",
  "#f78166",
  "#bc8cff",
  "#ffa657",
  "#ff7b72",
  "#39c5cf",
  "#d2a8ff",
];

const tooltipContentStyle = {
  backgroundColor: "#161b22",
  border: "1px solid #30363d",
  borderRadius: "6px",
  color: "#e6edf3",
};

type SeriesGeom = "line" | "bar" | "area";

type SeriesItem = {
  key: string;
  name?: string;
  color?: string;
  geom?: SeriesGeom; // for composed
};

type ChartType =
  | "line"
  | "bar"
  | "area"
  | "pie"
  | "scatter"
  | "stacked-bar"
  | "stacked-area"
  | "composed";

interface ChartSpec {
  type: ChartType;
  title?: string;
  data: Array<Record<string, unknown>>;
  xKey?: string;
  yKey?: string; // for scatter
  series?: SeriesItem[];
  nameKey?: string;
  valueKey?: string;
}

function Fallback({
  message,
  spec,
}: {
  message: string;
  spec: string;
}) {
  return (
    <div className="my-4 p-4 rounded-lg border border-light-border dark:border-dark-border bg-light-input dark:bg-dark-input">
      <div className="text-xs font-semibold mb-2 text-red-500">{message}</div>
      <pre className="text-xs whitespace-pre-wrap break-all text-light-muted dark:text-dark-muted">
        {spec}
      </pre>
    </div>
  );
}

function useTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof document === "undefined") return "light";
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    const update = () => {
      setTheme(
        document.documentElement.classList.contains("dark") ? "dark" : "light"
      );
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}

export default function ChartBlock({ spec }: { spec: string }) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(spec);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  let parsed: ChartSpec;
  try {
    parsed = JSON.parse(spec);
  } catch {
    return <Fallback message="Invalid chart JSON" spec={spec} />;
  }

  const type = parsed?.type;
  const supportedTypes: ChartType[] = [
    "line",
    "bar",
    "area",
    "pie",
    "scatter",
    "stacked-bar",
    "stacked-area",
    "composed",
  ];
  if (!supportedTypes.includes(type)) {
    return (
      <Fallback
        message={`Unsupported chart type: ${String(type)}`}
        spec={spec}
      />
    );
  }

  const data = parsed?.data;
  if (!Array.isArray(data) || data.length === 0) {
    return <Fallback message="Chart data is empty" spec={spec} />;
  }

  // Theme-aware axis & grid colors
  const axisTickFill = theme === "dark" ? "#8b949e" : "#57606a";
  const axisStroke = theme === "dark" ? "#30363d" : "#d0d7de";
  const gridStroke = theme === "dark" ? "#30363d" : "#d8dee4";
  const legendColor = theme === "dark" ? "#e6edf3" : "#1f2328";

  const axisProps = {
    tick: { fill: axisTickFill, fontSize: 12 },
    stroke: axisStroke,
  };

  try {
    const title = parsed.title;
    const series = parsed.series || [];
    const xKey = parsed.xKey || "";

    let chart: React.ReactElement | null = null;

    if (type === "line") {
      chart = (
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis dataKey={xKey} {...axisProps} />
          <YAxis {...axisProps} />
          <Tooltip contentStyle={tooltipContentStyle} />
          <Legend wrapperStyle={{ color: legendColor }} />
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name || s.key}
              stroke={s.color || palette[i % palette.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          ))}
        </LineChart>
      );
    } else if (type === "bar" || type === "stacked-bar") {
      const stackId = type === "stacked-bar" ? "a" : undefined;
      chart = (
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis dataKey={xKey} {...axisProps} />
          <YAxis {...axisProps} />
          <Tooltip contentStyle={tooltipContentStyle} />
          <Legend wrapperStyle={{ color: legendColor }} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name || s.key}
              fill={s.color || palette[i % palette.length]}
              radius={[4, 4, 0, 0]}
              stackId={stackId}
            />
          ))}
        </BarChart>
      );
    } else if (type === "area" || type === "stacked-area") {
      const stackId = type === "stacked-area" ? "a" : undefined;
      chart = (
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis dataKey={xKey} {...axisProps} />
          <YAxis {...axisProps} />
          <Tooltip contentStyle={tooltipContentStyle} />
          <Legend wrapperStyle={{ color: legendColor }} />
          {series.map((s, i) => {
            const color = s.color || palette[i % palette.length];
            return (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name || s.key}
                stroke={color}
                fill={color}
                fillOpacity={0.3}
                stackId={stackId}
              />
            );
          })}
        </AreaChart>
      );
    } else if (type === "scatter") {
      const sxKey = parsed.xKey;
      const syKey = parsed.yKey;
      if (!sxKey || !syKey) {
        return (
          <Fallback
            message="Scatter chart requires xKey and yKey"
            spec={spec}
          />
        );
      }

      // Build groups: if series provided, use each series.key as group label,
      // otherwise treat all data points as a single group.
      const groups: Array<{ name: string; color: string; points: typeof data }> = [];
      if (series.length > 0) {
        series.forEach((s, i) => {
          const groupPoints = data.filter(
            (d) => String(d[s.key] ?? d["group"] ?? "") === s.key
          );
          groups.push({
            name: s.name || s.key,
            color: s.color || palette[i % palette.length],
            points: groupPoints.length > 0 ? groupPoints : data,
          });
        });
      } else {
        groups.push({
          name: parsed.title || "Series",
          color: palette[0],
          points: data,
        });
      }

      // Validate at least one valid numeric pair exists across all groups
      const hasValid = groups.some((g) =>
        g.points.some(
          (d) =>
            typeof d[sxKey] === "number" &&
            typeof d[syKey] === "number" &&
            Number.isFinite(d[sxKey] as number) &&
            Number.isFinite(d[syKey] as number)
        )
      );
      if (!hasValid) {
        return (
          <Fallback
            message="Scatter chart has no valid numeric x/y pairs"
            spec={spec}
          />
        );
      }

      chart = (
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis type="number" dataKey={sxKey} name={sxKey} {...axisProps} />
          <YAxis type="number" dataKey={syKey} name={syKey} {...axisProps} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            contentStyle={tooltipContentStyle}
          />
          <Legend wrapperStyle={{ color: legendColor }} />
          {groups.map((g) => (
            <Scatter
              key={g.name}
              name={g.name}
              data={g.points}
              fill={g.color}
            />
          ))}
        </ScatterChart>
      );
    } else if (type === "composed") {
      if (series.length === 0) {
        return (
          <Fallback
            message="Composed chart requires non-empty series"
            spec={spec}
          />
        );
      }
      chart = (
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis dataKey={xKey} {...axisProps} />
          <YAxis {...axisProps} />
          <Tooltip contentStyle={tooltipContentStyle} />
          <Legend wrapperStyle={{ color: legendColor }} />
          {series.map((s, i) => {
            const color = s.color || palette[i % palette.length];
            const geom: SeriesGeom = s.geom || "line";
            if (geom === "bar") {
              return (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.name || s.key}
                  fill={color}
                  radius={[4, 4, 0, 0]}
                />
              );
            }
            if (geom === "area") {
              return (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name || s.key}
                  stroke={color}
                  fill={color}
                  fillOpacity={0.3}
                />
              );
            }
            return (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name || s.key}
                stroke={color}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            );
          })}
        </ComposedChart>
      );
    } else {
      // pie
      const nameKey = parsed.nameKey || "name";
      const valueKey = parsed.valueKey || "value";
      chart = (
        <PieChart>
          <Pie
            data={data}
            dataKey={valueKey}
            nameKey={nameKey}
            cx="50%"
            cy="50%"
            outerRadius={100}
            label
          >
            {data.map((_, i) => (
              <Cell key={i} fill={palette[i % palette.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipContentStyle} />
          <Legend wrapperStyle={{ color: legendColor }} />
        </PieChart>
      );
    }

    return (
      <div className="relative my-4 p-4 rounded-lg border border-light-border dark:border-dark-border bg-light-input dark:bg-dark-input">
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text bg-light-bg/60 dark:bg-dark-bg/60 border border-light-border dark:border-dark-border transition-colors"
          aria-label="Salin spec"
          title="Salin spec"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3" />
              Tersalin
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              Salin spec
            </>
          )}
        </button>
        {title ? (
          <h4 className="text-sm font-semibold mb-3 pr-20 text-light-text dark:text-dark-text">
            {title}
          </h4>
        ) : null}
        <ResponsiveContainer width="100%" height={300}>
          {chart}
        </ResponsiveContainer>
      </div>
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to render chart";
    return <Fallback message={message} spec={spec} />;
  }
}
