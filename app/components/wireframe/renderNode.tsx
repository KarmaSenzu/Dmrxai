import React from "react";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  Search,
  Bell,
  Home,
  Settings,
  Heart,
  Star,
  Check,
  Plus,
  Menu,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ArrowRight,
  ArrowLeft,
  Calendar,
  Camera,
  Image as ImageIcon,
  Phone,
  MapPin,
  CreditCard,
  ShoppingCart,
  Trash2,
  Pencil,
  Share2,
  Download,
  Upload,
  Filter,
  MoreVertical,
  X,
  LogOut,
  Globe,
  Sun,
  Moon,
  MessageCircle,
  Send,
  Bookmark,
  Clock,
  BarChart3,
  LineChart,
  PieChart,
  Package,
  Users,
  ClipboardList,
  FileText,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";
import {
  MAX_DEPTH,
  asText,
  clampInt,
  KNOWN_TYPES,
  type WNode,
  type WTextSize,
} from "./types";

const ICONS: Record<string, LucideIcon> = {
  mail: Mail,
  email: Mail,
  lock: Lock,
  password: Lock,
  eye: Eye,
  show: Eye,
  eyeoff: EyeOff,
  hide: EyeOff,
  user: User,
  profile: User,
  account: User,
  search: Search,
  bell: Bell,
  notification: Bell,
  home: Home,
  settings: Settings,
  gear: Settings,
  heart: Heart,
  like: Heart,
  star: Star,
  favorite: Star,
  check: Check,
  plus: Plus,
  add: Plus,
  menu: Menu,
  chevronright: ChevronRight,
  chevronleft: ChevronLeft,
  chevrondown: ChevronDown,
  arrowright: ArrowRight,
  arrowleft: ArrowLeft,
  back: ArrowLeft,
  calendar: Calendar,
  date: Calendar,
  camera: Camera,
  image: ImageIcon,
  photo: ImageIcon,
  phone: Phone,
  call: Phone,
  mappin: MapPin,
  location: MapPin,
  creditcard: CreditCard,
  card: CreditCard,
  payment: CreditCard,
  cart: ShoppingCart,
  shoppingcart: ShoppingCart,
  trash: Trash2,
  delete: Trash2,
  edit: Pencil,
  pencil: Pencil,
  share: Share2,
  download: Download,
  upload: Upload,
  filter: Filter,
  more: MoreVertical,
  morevertical: MoreVertical,
  close: X,
  x: X,
  logout: LogOut,
  signout: LogOut,
  globe: Globe,
  web: Globe,
  sun: Sun,
  moon: Moon,
  message: MessageCircle,
  chat: MessageCircle,
  send: Send,
  bookmark: Bookmark,
  save: Bookmark,
  clock: Clock,
  time: Clock,
  barchart: BarChart3,
  bar: BarChart3,
  linechart: LineChart,
  piechart: PieChart,
  chart: BarChart3,
  package: Package,
  box: Package,
  product: Package,
  users: Users,
  people: Users,
  clipboard: ClipboardList,
  clipboardlist: ClipboardList,
  task: ClipboardList,
  file: FileText,
  document: FileText,
  report: FileText,
  dashboard: LayoutDashboard,
  grid: LayoutDashboard,
};

function iconKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function Glyph({
  name,
  className = "w-4 h-4",
}: {
  name: string;
  className?: string;
}) {
  const Cmp = ICONS[iconKey(name)];
  if (Cmp) return <Cmp className={className} strokeWidth={1.75} />;
  return (
    <span
      className={`inline-block rounded-sm bg-light-border dark:bg-dark-border ${className}`}
      aria-hidden="true"
    />
  );
}

const GRID_COLS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

const GAP: Record<string, string> = {
  none: "gap-0",
  sm: "gap-2",
  md: "gap-3",
  lg: "gap-5",
};

const ALIGN: Record<string, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
};

const JUSTIFY: Record<string, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
  around: "justify-around",
};

const TEXT_ALIGN: Record<string, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

const TEXT_SIZE: Record<WTextSize, string> = {
  xs: "text-xs",
  sm: "text-sm",
  base: "text-base",
  lg: "text-lg",
  xl: "text-xl",
  "2xl": "text-2xl",
};

const HEADING_SIZE: Record<number, string> = {
  1: "text-2xl",
  2: "text-lg",
  3: "text-base",
};

const AVATAR_SIZE: Record<string, string> = {
  sm: "w-8 h-8",
  md: "w-12 h-12",
  lg: "w-20 h-20",
};

const LOGO_SIZE: Record<string, string> = {
  sm: "w-12 h-12",
  md: "w-16 h-16",
  lg: "w-20 h-20",
};

const SPACER_SIZE: Record<string, string> = {
  sm: "h-2",
  md: "h-4",
  lg: "h-8",
};

const IMAGE_RATIO: Record<string, string> = {
  square: "aspect-square",
  video: "aspect-video",
  wide: "aspect-[21/9]",
};

const BTN_SIZE: Record<string, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
  lg: "px-5 py-3 text-base",
};

const skeletonBorder = "border border-light-border dark:border-dark-border";
const mutedText = "text-light-muted dark:text-dark-muted";
const surface = "bg-light-bg dark:bg-dark-bg";

function pick<T>(map: Record<string, T>, key: unknown, fallback: T): T {
  if (typeof key === "string" && key in map) return map[key];
  return fallback;
}

function childrenOf(node: WNode, key: React.Key, depth: number): React.ReactNode {
  if (!Array.isArray(node.children)) return null;
  return node.children.map((c, i) => renderNode(c, `${key}-${i}`, depth + 1));
}

export function renderNode(
  node: WNode | undefined,
  key: React.Key,
  depth = 0
): React.ReactNode {
  if (depth > MAX_DEPTH) return null;
  if (!node || typeof node !== "object" || typeof node.type !== "string") {
    return null;
  }
  if (!KNOWN_TYPES.has(node.type)) return null;

  switch (node.type) {
    case "row": {
      const gap = pick(GAP, node.gap, GAP.md);
      const align = pick(ALIGN, node.align, ALIGN.center);
      const justify = pick(JUSTIFY, node.justify, JUSTIFY.start);
      return (
        <div
          key={key}
          className={`flex flex-row flex-wrap ${gap} ${align} ${justify}`}
        >
          {childrenOf(node, key, depth)}
        </div>
      );
    }

    case "col": {
      const gap = pick(GAP, node.gap, GAP.md);
      const align = pick(ALIGN, node.align, ALIGN.stretch);
      return (
        <div key={key} className={`flex flex-col ${gap} ${align}`}>
          {childrenOf(node, key, depth)}
        </div>
      );
    }

    case "card": {
      const title = asText(node.title);
      return (
        <div
          key={key}
          className={`rounded-xl ${skeletonBorder} ${surface} p-4 flex flex-col gap-2 shadow-sm`}
        >
          {title && (
            <div className="text-sm font-semibold text-light-text dark:text-dark-text">
              {title}
            </div>
          )}
          {childrenOf(node, key, depth)}
        </div>
      );
    }

    case "grid": {
      const cols = clampInt(node.columns, 2, 4, 2);
      const gap = pick(GAP, node.gap, GAP.md);
      return (
        <div key={key} className={`grid ${GRID_COLS[cols]} ${gap}`}>
          {childrenOf(node, key, depth)}
        </div>
      );
    }

    case "navbar": {
      const title = asText(node.title);
      const items = Array.isArray(node.items)
        ? (node.items as unknown[]).map(asText).filter(Boolean)
        : [];
      return (
        <div
          key={key}
          className={`flex items-center justify-between px-4 py-3 border-b ${skeletonBorder}`}
        >
          <span className="text-sm font-bold text-light-text dark:text-dark-text">
            {title || "Navbar"}
          </span>
          <div className="flex flex-row items-center gap-4">
            {items.map((it, i) => (
              <span key={i} className={`text-xs ${mutedText}`}>
                {it}
              </span>
            ))}
          </div>
        </div>
      );
    }

    case "list": {
      const items = Array.isArray(node.items)
        ? (node.items as unknown[]).map(asText).filter(Boolean)
        : null;
      return (
        <div
          key={key}
          className={`rounded-xl ${skeletonBorder} ${surface} overflow-hidden`}
        >
          {items
            ? items.map((it, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between px-4 py-3 text-sm text-light-text dark:text-dark-text border-b last:border-b-0 ${skeletonBorder}`}
                >
                  <span>{it}</span>
                  <ChevronRight className={`w-4 h-4 ${mutedText}`} strokeWidth={1.75} />
                </div>
              ))
            : Array.isArray(node.children)
            ? node.children.map((c, i) => (
                <div
                  key={i}
                  className={`px-4 py-3 border-b last:border-b-0 ${skeletonBorder}`}
                >
                  {renderNode(c, `${key}-${i}`, depth + 1)}
                </div>
              ))
            : null}
        </div>
      );
    }

    case "logo": {
      const label = asText(node.label);
      const size = pick(LOGO_SIZE, node.size, LOGO_SIZE.md);
      const iconName = asText(node.icon);
      return (
        <div
          key={key}
          className={`mx-auto ${size} rounded-2xl bg-light-hover dark:bg-dark-hover border border-light-border dark:border-dark-border flex items-center justify-center text-light-text dark:text-dark-text`}
        >
          {iconName ? (
            <Glyph name={iconName} className="w-7 h-7" />
          ) : (
            <span className="text-xs font-bold tracking-wide">
              {label ? label.slice(0, 8) : "LOGO"}
            </span>
          )}
        </div>
      );
    }

    case "heading": {
      const level = clampInt(node.level, 1, 3, 2);
      const value = asText(node.value) || "Heading";
      const align = pick(TEXT_ALIGN, node.align, "");
      return (
        <div
          key={key}
          className={`font-bold text-light-text dark:text-dark-text ${HEADING_SIZE[level]} ${align}`}
        >
          {value}
        </div>
      );
    }

    case "text": {
      const value = asText(node.value);
      const size = pick(TEXT_SIZE, node.size, TEXT_SIZE.sm);
      const weight = node.weight === "bold" ? "font-semibold" : "font-normal";
      const color = node.muted
        ? mutedText
        : "text-light-text dark:text-dark-text";
      const align = pick(TEXT_ALIGN, node.align, "");
      return (
        <p key={key} className={`${size} ${weight} ${color} ${align}`}>
          {value}
        </p>
      );
    }

    case "input": {
      const label = asText(node.label);
      const variant = asText(node.variant);
      const isTextarea = variant === "textarea";
      const isPassword = variant === "password";

      const defaultLeading: Record<string, string> = {
        email: "mail",
        password: "lock",
        search: "search",
      };
      const leadingName = asText(node.icon) || defaultLeading[variant] || "";
      const trailingName =
        asText(node.trailingIcon) || (isPassword ? "eye" : "");
      let placeholder = asText(node.placeholder);
      if (!placeholder && isPassword) placeholder = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";

      return (
        <div key={key} className="flex flex-col gap-1.5">
          {label && (
            <span className="text-xs font-medium text-light-text dark:text-dark-text">
              {label}
            </span>
          )}
          <div
            className={`w-full rounded-lg ${skeletonBorder} ${surface} flex items-center gap-2 px-3 ${
              isTextarea ? "h-20 items-start py-2.5" : "h-11"
            }`}
          >
            {leadingName && !isTextarea && (
              <Glyph name={leadingName} className={`w-4 h-4 shrink-0 ${mutedText}`} />
            )}
            <span className={`flex-1 text-sm ${mutedText} truncate`}>
              {placeholder || (isTextarea ? "..." : "")}
            </span>
            {trailingName && !isTextarea && (
              <Glyph name={trailingName} className={`w-4 h-4 shrink-0 ${mutedText}`} />
            )}
          </div>
        </div>
      );
    }

    case "button": {
      const label = asText(node.label) || "Button";
      const variant = node.variant;
      const full = node.full ? "w-full" : "";
      const sizeCls = pick(BTN_SIZE, node.size, BTN_SIZE.md);
      const iconName = asText(node.icon);
      let cls =
        "bg-light-muted dark:bg-dark-muted text-white border border-transparent shadow-sm";
      if (variant === "secondary") {
        cls = `bg-transparent ${skeletonBorder} text-light-text dark:text-dark-text`;
      } else if (variant === "ghost") {
        cls =
          "bg-transparent border border-transparent text-light-text dark:text-dark-text";
      }
      return (
        <div
          key={key}
          className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold ${sizeCls} ${cls} ${full}`}
        >
          {iconName && <Glyph name={iconName} className="w-4 h-4" />}
          {label}
        </div>
      );
    }

    case "image": {
      const ratio = pick(IMAGE_RATIO, node.ratio, IMAGE_RATIO.video);
      const label = asText(node.label) || "Image";
      return (
        <div
          key={key}
          className={`relative w-full ${ratio} rounded-xl ${skeletonBorder} ${surface} overflow-hidden`}
        >
          <svg
            className="absolute inset-0 w-full h-full text-light-border dark:text-dark-border"
            preserveAspectRatio="none"
            viewBox="0 0 100 100"
            aria-hidden="true"
          >
            <line x1="0" y1="0" x2="100" y2="100" stroke="currentColor" strokeWidth="0.5" />
            <line x1="100" y1="0" x2="0" y2="100" stroke="currentColor" strokeWidth="0.5" />
          </svg>
          <span
            className={`absolute inset-0 flex items-center justify-center gap-1.5 text-xs ${mutedText}`}
          >
            <ImageIcon className="w-4 h-4" strokeWidth={1.75} />
            {label}
          </span>
        </div>
      );
    }

    case "avatar": {
      const size = pick(AVATAR_SIZE, node.size, AVATAR_SIZE.md);
      return (
        <div
          key={key}
          className={`rounded-full bg-light-border dark:bg-dark-border ${size} shrink-0 flex items-center justify-center ${mutedText}`}
        >
          <User className="w-1/2 h-1/2" strokeWidth={1.75} />
        </div>
      );
    }

    case "checkbox": {
      const label = asText(node.label);
      const checked = Boolean(node.checked);
      return (
        <label
          key={key}
          className="inline-flex items-center gap-2 text-sm text-light-text dark:text-dark-text"
        >
          <span
            className={`w-4 h-4 rounded ${skeletonBorder} flex items-center justify-center ${
              checked ? "bg-light-muted dark:bg-dark-muted border-transparent" : surface
            }`}
          >
            {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
          </span>
          {label}
        </label>
      );
    }

    case "radio": {
      const label = asText(node.label);
      const checked = Boolean(node.checked);
      return (
        <label
          key={key}
          className="inline-flex items-center gap-2 text-sm text-light-text dark:text-dark-text"
        >
          <span
            className={`w-4 h-4 rounded-full ${skeletonBorder} flex items-center justify-center ${surface}`}
          >
            {checked && (
              <span className="w-2 h-2 rounded-full bg-light-muted dark:bg-dark-muted" />
            )}
          </span>
          {label}
        </label>
      );
    }

    case "toggle": {
      const label = asText(node.label);
      const checked = Boolean(node.checked);
      return (
        <label
          key={key}
          className="inline-flex items-center justify-between gap-3 text-sm text-light-text dark:text-dark-text"
        >
          {label}
          <span
            className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
              checked
                ? "bg-light-muted dark:bg-dark-muted"
                : "bg-light-border dark:bg-dark-border"
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                checked ? "left-[1.125rem]" : "left-0.5"
              }`}
            />
          </span>
        </label>
      );
    }

    case "link": {
      const label = asText(node.label) || "Link";
      const align = pick(TEXT_ALIGN, node.align, "");
      return (
        <span
          key={key}
          className={`text-sm font-medium underline text-light-text dark:text-dark-text cursor-pointer ${align}`}
        >
          {label}
        </span>
      );
    }

    case "divider": {
      const label = asText(node.label);
      if (label) {
        return (
          <div key={key} className="flex items-center gap-3 my-1">
            <hr className={`flex-1 border-t ${skeletonBorder}`} />
            <span className={`text-xs ${mutedText}`}>{label}</span>
            <hr className={`flex-1 border-t ${skeletonBorder}`} />
          </div>
        );
      }
      return <hr key={key} className={`border-t ${skeletonBorder} my-1`} />;
    }

    case "badge": {
      const label = asText(node.label) || "Badge";
      const variant = node.variant;
      let cls = "bg-light-muted dark:bg-dark-muted text-white";
      if (variant === "secondary") {
        cls = `${surface} ${skeletonBorder} ${mutedText}`;
      }
      return (
        <span
          key={key}
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}
        >
          {label}
        </span>
      );
    }

    case "spacer": {
      const size = pick(SPACER_SIZE, node.size, SPACER_SIZE.md);
      return <div key={key} className={size} aria-hidden="true" />;
    }

    case "icon": {
      const name = asText(node.name);
      return (
        <Glyph
          key={key}
          name={name}
          className="w-5 h-5 text-light-text dark:text-dark-text"
        />
      );
    }

    case "appbar": {
      const title = asText(node.title);
      const back = Boolean(node.back);
      const actions = Array.isArray(node.actions)
        ? (node.actions as unknown[]).map(asText).filter(Boolean)
        : [];
      return (
        <div
          key={key}
          className={`flex items-center gap-3 px-4 py-3 border-b ${skeletonBorder}`}
        >
          {back && (
            <ArrowLeft className="w-5 h-5 text-light-text dark:text-dark-text" strokeWidth={1.75} />
          )}
          <span className="flex-1 text-base font-bold text-light-text dark:text-dark-text truncate">
            {title || "Title"}
          </span>
          {actions.map((a, i) => (
            <Glyph key={i} name={a} className="w-5 h-5 text-light-text dark:text-dark-text" />
          ))}
        </div>
      );
    }

    case "bottomnav": {
      const raw = Array.isArray(node.items) ? (node.items as unknown[]) : [];
      const items = raw
        .map((it) => {
          if (it && typeof it === "object") {
            const o = it as Record<string, unknown>;
            return { label: asText(o.label), icon: asText(o.icon) };
          }
          return { label: asText(it), icon: asText(it) };
        })
        .filter((x) => x.label || x.icon);
      const list = items.length
        ? items
        : [
            { label: "Home", icon: "home" },
            { label: "Search", icon: "search" },
            { label: "Profile", icon: "user" },
          ];
      const activeIdx = clampInt(node.active, 0, list.length - 1, 0);
      return (
        <div
          key={key}
          className={`flex items-stretch justify-around border-t ${skeletonBorder} pt-2`}
        >
          {list.map((it, i) => {
            const on = i === activeIdx;
            const color = on
              ? "text-light-text dark:text-dark-text"
              : mutedText;
            return (
              <div key={i} className={`flex flex-col items-center gap-1 ${color}`}>
                <Glyph name={it.icon || it.label} className="w-5 h-5" />
                <span className="text-[10px]">{it.label}</span>
              </div>
            );
          })}
        </div>
      );
    }

    case "searchbar": {
      const placeholder = asText(node.placeholder) || "Search";
      return (
        <div
          key={key}
          className={`w-full rounded-full ${skeletonBorder} ${surface} flex items-center gap-2 px-4 h-10`}
        >
          <Search className={`w-4 h-4 shrink-0 ${mutedText}`} strokeWidth={1.75} />
          <span className={`flex-1 text-sm ${mutedText} truncate`}>{placeholder}</span>
        </div>
      );
    }

    case "chips": {
      const items = Array.isArray(node.items)
        ? (node.items as unknown[]).map(asText).filter(Boolean)
        : [];
      const activeIdx = typeof node.active === "number" ? node.active : -1;
      return (
        <div key={key} className="flex flex-row flex-wrap gap-2">
          {items.map((it, i) => {
            const on = i === activeIdx;
            const cls = on
              ? "bg-light-muted dark:bg-dark-muted text-white border-transparent"
              : `${surface} ${mutedText} border-light-border dark:border-dark-border`;
            return (
              <span
                key={i}
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border ${cls}`}
              >
                {it}
              </span>
            );
          })}
        </div>
      );
    }

    case "tabs": {
      const items = Array.isArray(node.items)
        ? (node.items as unknown[]).map(asText).filter(Boolean)
        : [];
      const activeIdx = clampInt(node.active, 0, Math.max(items.length - 1, 0), 0);
      return (
        <div
          key={key}
          className="flex flex-row rounded-lg p-1 bg-light-sidebar dark:bg-dark-sidebar"
        >
          {items.map((it, i) => {
            const on = i === activeIdx;
            const cls = on
              ? "bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text shadow-sm"
              : mutedText;
            return (
              <span
                key={i}
                className={`flex-1 text-center rounded-md px-3 py-1.5 text-xs font-medium ${cls}`}
              >
                {it}
              </span>
            );
          })}
        </div>
      );
    }

    case "stat": {
      const value = asText(node.value) || "0";
      const label = asText(node.label);
      const delta = asText(node.delta);
      const trend = asText(node.trend);
      const deltaColor =
        trend === "down"
          ? "text-rose-500"
          : trend === "up"
          ? "text-emerald-500"
          : mutedText;
      const arrow = trend === "down" ? "\u25be" : trend === "up" ? "\u25b4" : "";
      const iconName = asText(node.icon);
      return (
        <div
          key={key}
          className={`rounded-xl ${skeletonBorder} ${surface} p-4 flex flex-col gap-1 shadow-sm border-t-2 border-t-light-muted dark:border-t-dark-muted`}
        >
          <div className="flex items-center justify-between">
            {label && <span className={`text-xs ${mutedText}`}>{label}</span>}
            {iconName && <Glyph name={iconName} className={`w-4 h-4 ${mutedText}`} />}
          </div>
          <span className="text-2xl font-bold text-light-text dark:text-dark-text">
            {value}
          </span>
          {delta && (
            <span className={`text-xs font-medium ${deltaColor}`}>
              {arrow} {delta}
            </span>
          )}
        </div>
      );
    }

    case "listitem": {
      const title = asText(node.title) || asText(node.label);
      const subtitle = asText(node.subtitle);
      const leading = asText(node.icon);
      const showAvatar = Boolean(node.avatar);
      const trailing = asText(node.trailing);
      const trailingIsIcon = ICONS[iconKey(trailing)] != null;
      const badge = asText(node.badge);
      const badgeColor = asText(node.badgeColor) || asText(node.badgeVariant);
      const liBadgeColors: Record<string, string> = {
        green: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30",
        success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30",
        yellow: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30",
        orange: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30",
        warning: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30",
        pending: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30",
        red: "bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/30",
        error: "bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/30",
        blue: "bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/30",
      };
      return (
        <div key={key} className="flex items-center gap-3 px-1 py-2">
          {showAvatar ? (
            <div
              className={`rounded-full bg-light-border dark:bg-dark-border w-10 h-10 shrink-0 flex items-center justify-center ${mutedText}`}
            >
              <User className="w-5 h-5" strokeWidth={1.75} />
            </div>
          ) : leading ? (
            <div
              className={`rounded-lg ${skeletonBorder} ${surface} w-10 h-10 shrink-0 flex items-center justify-center ${mutedText}`}
            >
              <Glyph name={leading} className="w-5 h-5" />
            </div>
          ) : null}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-light-text dark:text-dark-text truncate">
              {title || "Item"}
            </div>
            {subtitle && (
              <div className={`text-xs ${mutedText} truncate`}>{subtitle}</div>
            )}
          </div>
          {badge && (
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium shrink-0 ${
                liBadgeColors[badgeColor.toLowerCase()] || liBadgeColors.green
              }`}
            >
              {badge}
            </span>
          )}
          {trailing &&
            (trailingIsIcon ? (
              <Glyph name={trailing} className={`w-4 h-4 shrink-0 ${mutedText}`} />
            ) : (
              <span className={`text-xs shrink-0 ${mutedText}`}>{trailing}</span>
            ))}
        </div>
      );
    }

    case "progress": {
      const value = clampInt(node.value, 0, 100, 40);
      const label = asText(node.label);
      const showValue = Boolean(node.showValue);
      return (
        <div key={key} className="flex flex-col gap-1">
          {(label || showValue) && (
            <div className="flex items-center justify-between text-xs">
              <span className={mutedText}>{label}</span>
              {showValue && <span className={mutedText}>{value}%</span>}
            </div>
          )}
          <div className="w-full h-2 rounded-full bg-light-border dark:bg-dark-border overflow-hidden">
            <div
              className="h-full rounded-full bg-light-muted dark:bg-dark-muted"
              style={{ width: `${value}%` }}
            />
          </div>
        </div>
      );
    }

    case "rating": {
      const value = clampInt(node.value, 0, 5, 0);
      const max = clampInt(node.max, 1, 5, 5);
      return (
        <div key={key} className="flex flex-row gap-0.5">
          {Array.from({ length: max }).map((_, i) => (
            <Star
              key={i}
              className={i < value ? "w-4 h-4 text-amber-400" : `w-4 h-4 ${mutedText}`}
              fill={i < value ? "currentColor" : "none"}
              strokeWidth={1.75}
            />
          ))}
        </div>
      );
    }

    case "alert": {
      const value =
        asText(node.value) || asText(node.label) || "Pesan informasi";
      const variant = asText(node.variant);
      const styleMap: Record<string, string> = {
        info: "bg-blue-500/10 text-blue-600 dark:text-blue-300 border-blue-500/30",
        success:
          "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/30",
        warning:
          "bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/30",
        error: "bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-500/30",
      };
      const cls = styleMap[variant] || styleMap.info;
      const iconMap: Record<string, string> = {
        info: "message",
        success: "check",
        warning: "bell",
        error: "close",
      };
      return (
        <div
          key={key}
          className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${cls}`}
        >
          <Glyph name={iconMap[variant] || "message"} className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{value}</span>
        </div>
      );
    }

    case "fab": {
      const iconName = asText(node.icon) || "plus";
      return (
        <div key={key} className="flex justify-end">
          <div className="w-14 h-14 rounded-full bg-light-muted dark:bg-dark-muted text-white shadow-lg flex items-center justify-center">
            <Glyph name={iconName} className="w-6 h-6" />
          </div>
        </div>
      );
    }
    case "header": {
      const title = asText(node.title);
      const logoIcon = asText(node.logo) || asText(node.icon);
      const items = Array.isArray(node.items)
        ? (node.items as unknown[]).map(asText).filter(Boolean)
        : [];
      const cta = asText(node.cta);
      const activeIdx =
        typeof node.active === "number" ? node.active : 0;
      return (
        <div
          key={key}
          className={`flex items-center gap-6 px-5 py-3 border-b ${skeletonBorder}`}
        >
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-light-hover dark:bg-dark-hover border border-light-border dark:border-dark-border flex items-center justify-center text-light-text dark:text-dark-text">
              {logoIcon ? <Glyph name={logoIcon} className="w-4 h-4" /> : <span className="text-[9px] font-bold">UI</span>}
            </div>
            <span className="text-sm font-bold text-light-text dark:text-dark-text">
              {title || "Brand"}
            </span>
          </div>
          <div className="flex-1 flex items-center justify-center gap-5">
            {items.map((it, i) => (
              <span
                key={i}
                className={
                  i === activeIdx
                    ? "text-xs font-semibold text-light-text dark:text-dark-text"
                    : `text-xs ${mutedText}`
                }
              >
                {it}
              </span>
            ))}
          </div>
          {cta && (
            <div className="shrink-0 inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-semibold bg-light-muted dark:bg-dark-muted text-white shadow-sm">
              {cta}
            </div>
          )}
        </div>
      );
    }

    case "sidebar": {
      const title = asText(node.title);
      const collapsible = Boolean(node.collapsible);
      let activeMatched = false;

      // An item can be a string, { label, icon, active?, submenu? }, or a
      // group header { group: "DATA MASTER", items: [...] }.
      type SItem = { label: string; icon: string; active: boolean; submenu: boolean };
      const normItem = (it: unknown, fallbackActive = false): SItem => {
        if (it && typeof it === "object") {
          const o = it as Record<string, unknown>;
          const active = Boolean(o.active) || fallbackActive;
          if (active) activeMatched = true;
          return {
            label: asText(o.label),
            icon: asText(o.icon),
            active,
            submenu: Boolean(o.submenu) || Boolean(o.dropdown),
          };
        }
        return { label: asText(it), icon: asText(it), active: false, submenu: false };
      };

      const raw = Array.isArray(node.items) ? (node.items as unknown[]) : [];
      const blocks: Array<{ group?: string; items: SItem[] }> = [];
      let flatIndex = 0;
      const activeIdxNum = typeof node.active === "number" ? node.active : -1;

      for (const entry of raw) {
        if (entry && typeof entry === "object" && "group" in (entry as object)) {
          const o = entry as Record<string, unknown>;
          const sub = Array.isArray(o.items) ? (o.items as unknown[]) : [];
          const items = sub.map((s) => {
            const isActive = flatIndex === activeIdxNum;
            flatIndex += 1;
            return normItem(s, isActive);
          });
          blocks.push({ group: asText(o.group), items });
        } else {
          const isActive = flatIndex === activeIdxNum;
          flatIndex += 1;
          const it = normItem(entry, isActive);
          if (blocks.length > 0 && !blocks[blocks.length - 1].group) {
            blocks[blocks.length - 1].items.push(it);
          } else {
            blocks.push({ items: [it] });
          }
        }
      }
      // Default first item active if none explicitly active.
      if (!activeMatched && blocks.length > 0 && blocks[0].items.length > 0) {
        blocks[0].items[0].active = true;
      }

      const renderItem = (it: SItem, i: number) => {
        const cls = it.active
          ? "bg-light-hover dark:bg-dark-hover text-light-text dark:text-dark-text font-semibold"
          : mutedText;
        return (
          <div
            key={i}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs ${cls}`}
          >
            <Glyph name={it.icon || it.label} className="w-4 h-4 shrink-0" />
            <span className="flex-1 truncate">{it.label}</span>
            {it.submenu && <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-70" strokeWidth={1.75} />}
          </div>
        );
      };

      return (
        <div
          key={key}
          className={`w-48 shrink-0 self-stretch border-r ${skeletonBorder} bg-light-sidebar dark:bg-dark-sidebar p-3 flex flex-col gap-1`}
        >
          {title && (
            <div className="flex items-center gap-2 px-1 pb-3 mb-1 border-b border-light-border dark:border-dark-border">
              <div className="w-6 h-6 rounded-md bg-light-hover dark:bg-dark-hover border border-light-border dark:border-dark-border flex items-center justify-center text-light-text dark:text-dark-text shrink-0">
                <Glyph name={asText(node.logo) || "dashboard"} className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-bold text-light-text dark:text-dark-text truncate">
                {title}
              </span>
            </div>
          )}
          <div className="flex flex-col gap-1 flex-1">
            {blocks.map((b, bi) => (
              <div key={bi} className="flex flex-col gap-0.5">
                {b.group && (
                  <div className={`px-2.5 pt-2 pb-1 text-[9px] font-bold uppercase tracking-wider ${mutedText} opacity-70`}>
                    {b.group}
                  </div>
                )}
                {b.items.map((it, i) => renderItem(it, i))}
              </div>
            ))}
          </div>
          {collapsible && (
            <div className={`mt-2 pt-2 border-t border-light-border dark:border-dark-border flex items-center justify-start px-2.5 ${mutedText}`}>
              <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
            </div>
          )}
        </div>
      );
    }

    case "footer": {
      const items = Array.isArray(node.items)
        ? (node.items as unknown[]).map(asText).filter(Boolean)
        : [];
      const copyright = asText(node.copyright) || asText(node.text);
      return (
        <div
          key={key}
          className={`border-t ${skeletonBorder} bg-light-sidebar dark:bg-dark-sidebar px-5 py-4 flex flex-col gap-3`}
        >
          {items.length > 0 && (
            <div className="flex flex-row flex-wrap items-center justify-center gap-x-5 gap-y-2">
              {items.map((it, i) => (
                <span key={i} className={`text-xs ${mutedText}`}>
                  {it}
                </span>
              ))}
            </div>
          )}
          <div className={`text-center text-[11px] ${mutedText}`}>
            {copyright || "\u00a9 2026 Brand. All rights reserved."}
          </div>
        </div>
      );
    }
    case "chartph": {
      const title = asText(node.title);
      const kind = asText(node.chartType) || asText(node.kind) || "line";
      const note = asText(node.note) || asText(node.value);
      const ChartIcon =
        kind === "bar" ? BarChart3 : kind === "pie" ? PieChart : LineChart;
      return (
        <div
          key={key}
          className={`rounded-xl ${skeletonBorder} ${surface} overflow-hidden`}
        >
          {title && (
            <div className="px-4 py-2.5 text-sm font-bold text-white bg-light-muted dark:bg-dark-muted">
              {title}
            </div>
          )}
          <div className="relative h-44 flex flex-col items-center justify-center gap-2 bg-light-sidebar/40 dark:bg-dark-sidebar/40">
            <ChartIcon className={`w-10 h-10 ${mutedText}`} strokeWidth={1.5} />
            {note && (
              <span className={`px-4 text-center text-[11px] ${mutedText}`}>
                {note}
              </span>
            )}
          </div>
        </div>
      );
    }

    case "table": {
      const cols = Array.isArray(node.columns)
        ? (node.columns as unknown[]).map(asText)
        : [];
      const rawRows = Array.isArray(node.rows) ? (node.rows as unknown[]) : [];
      const title = asText(node.title);
      const ncol = Math.max(cols.length, 1);

      // Content-aware column widths: short labels (date/qty/status) get a
      // smaller share, long text (names) get more. Heuristic by header name
      // and by measured average content length per column. Falls back to
      // equal fractions when nothing matches. Using fr units lets long text
      // wrap instead of getting clipped.
      const shortHeader = /tanggal|tgl|date|jumlah|qty|qty\.|no\.?|status|aksi|action|harga|total/i;
      const colWeights: number[] = cols.map((c, ci) => {
        // measure average content length in this column
        let sum = 0;
        let n = 0;
        for (const row of rawRows) {
          const cells = Array.isArray(row) ? (row as unknown[]) : [row];
          const cell = cells[ci];
          let t = "";
          if (cell && typeof cell === "object") {
            const o = cell as Record<string, unknown>;
            t = asText(o.text) || asText(o.label) || asText(o.value);
          } else {
            t = asText(cell);
          }
          sum += t.length;
          n += 1;
        }
        const avg = n > 0 ? sum / n : c.length;
        let w = Math.max(avg, c.length);
        if (shortHeader.test(c)) w = Math.min(w, 8);
        return Math.max(1, Math.min(w, 28));
      });
      const gridTemplate = {
        gridTemplateColumns:
          colWeights.length > 0
            ? colWeights.map((w) => `minmax(0, ${w.toFixed(1)}fr)`).join(" ")
            : `repeat(${ncol}, minmax(0, 1fr))`,
      };

      // Each cell may be a plain string, or { text, badge } where badge is a
      // color name (green/yellow/red/blue/gray) to render a colored pill.
      const badgeColors: Record<string, string> = {
        green: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30",
        success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30",
        yellow: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30",
        orange: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30",
        warning: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30",
        pending: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30",
        red: "bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/30",
        error: "bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/30",
        blue: "bg-light-border dark:bg-dark-border " + mutedText + " border-transparent",
        gray: "bg-light-border dark:bg-dark-border " + mutedText + " border-transparent",
        grey: "bg-light-border dark:bg-dark-border " + mutedText + " border-transparent",
      };

      const renderCell = (cell: unknown, ci: number) => {
        if (cell && typeof cell === "object") {
          const o = cell as Record<string, unknown>;
          const text = asText(o.text) || asText(o.label) || asText(o.value);
          const badge = asText(o.badge);
          if (badge) {
            const bc = badgeColors[badge.toLowerCase()] || badgeColors.gray;
            return (
              <span
                key={ci}
                className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium leading-tight break-words ${bc}`}
              >
                {text}
              </span>
            );
          }
          return (
            <span key={ci} className="text-[11px] leading-snug text-light-text dark:text-dark-text break-words">
              {text}
            </span>
          );
        }
        return (
          <span key={ci} className="text-[11px] leading-snug text-light-text dark:text-dark-text break-words">
            {asText(cell)}
          </span>
        );
      };

      return (
        <div
          key={key}
          className={`rounded-xl ${skeletonBorder} ${surface} overflow-hidden`}
        >
          {title && (
            <div className="px-3 py-2 text-xs font-bold text-light-text dark:text-dark-text bg-light-sidebar dark:bg-dark-sidebar border-b border-light-border dark:border-dark-border break-words">
              {title}
            </div>
          )}
          {cols.length > 0 && (
            <div
              className={`grid gap-2 px-3 py-2 border-b ${skeletonBorder} bg-light-sidebar/50 dark:bg-dark-sidebar/50`}
              style={gridTemplate}
            >
              {cols.map((c, i) => (
                <span
                  key={i}
                  className={`text-[10px] font-semibold uppercase tracking-wide ${mutedText} break-words leading-tight`}
                >
                  {c}
                </span>
              ))}
            </div>
          )}
          {rawRows.map((row, ri) => {
            const cells = Array.isArray(row) ? (row as unknown[]) : [row];
            return (
              <div
                key={ri}
                className={`grid gap-2 px-3 py-2 items-start border-b last:border-b-0 ${skeletonBorder}`}
                style={gridTemplate}
              >
                {Array.from({ length: ncol }).map((_, ci) => renderCell(cells[ci], ci))}
              </div>
            );
          })}
        </div>
      );
    }
    default:
      return null;
  }
}
