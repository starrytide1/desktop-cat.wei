#!/usr/bin/env node
/**
 * PawPal MCP Server（合规版）
 *
 * 传输：stdio JSON-RPC 2.0（MCP 标准，2025-06-18）。
 * 通信：**零网络、零端口**。工具调用只写入单一配置文件
 *   %APPDATA%/PawPal/config.json
 * 桌宠进程通过「单文件时间戳轮询 + 进程内事件」感知变化并热更新。
 *
 * 合规约束：
 *  - 无 http/https/socket/fetch 等网络请求，无本地监听端口
 *  - 无剪贴板、无截图录屏、无目录遍历（只读写一个固定文件，只读取用户显式给出的单张图片）
 *  - 无埋点 SDK；依赖均为固定版本
 *
 * 工具：
 *   generate_coat_from_photo / generate_cat_from_photo  按照片生成配色+造型并应用
 *   set_appearance  组合式修改部件
 *   set_coat        用预设或颜色设置配色
 *   list_coats      列出内置毛色
 *   get_status      查询配置文件状态（桌面是否在运行由其进程内事件体现）
 *
 * CLI：
 *   node mcp-server.mjs --probe
 *   node mcp-server.mjs --apply <图片路径> [名称]
 */

import { createInterface } from "node:readline";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";

const VERSION = "0.1.0";

/** 唯一持久化文件，与 Rust 端 config_path() 完全一致 */
const CONFIG_PATH = path.join(
  process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
  "PawPal",
  "config.json"
);

/* ---------------- 内置预设（与前端保持同步） ---------------- */
const PRESETS = {
  orange: { name: "橘猫", fur: "#F4A34C", shade: "#D9822E", light: "#FFD9A0", belly: "#FFF1DC", ear: "#F3A0A4", eye: "#4E8E5B", line: "#C4732B" },
  tabby: { name: "狸花", fur: "#9E8873", shade: "#6E5C4B", light: "#C9B7A1", belly: "#F3EADC", ear: "#E3A6A6", eye: "#8FBF6A", line: "#5C4B3C", stripes: true },
  tuxedo: { name: "奶牛", fur: "#3A3740", shade: "#222027", light: "#5C5863", belly: "#FFFDF8", ear: "#D99098", eye: "#F2C14E", line: "#17151A" },
  calico: { name: "三花", fur: "#FBF3E6", shade: "#E4D3BC", light: "#FFFFFF", belly: "#FFFDF8", ear: "#EDA6A6", eye: "#E0A23C", line: "#CBB79E" },
  siamese: { name: "暹罗", fur: "#F3E4CD", shade: "#D8C4A6", light: "#FFF7E9", belly: "#FFFDF6", ear: "#6B4A42", eye: "#4FA9D6", line: "#8A6A58" },
  black: { name: "黑猫", fur: "#37343D", shade: "#22202A", light: "#56515F", belly: "#4A464F", ear: "#C98E96", eye: "#E8C24E", line: "#16141B" },
  white: { name: "白猫", fur: "#FBF8F4", shade: "#E2DCD6", light: "#FFFFFF", belly: "#FFFFFF", ear: "#F0B6B9", eye: "#5FA9C7", line: "#D3CCC4" },
  blue: { name: "蓝猫", fur: "#A9B7C6", shade: "#8494A6", light: "#CBD6E1", belly: "#EBF0F5", ear: "#E0AEB2", eye: "#E8B24A", line: "#6F7F91" },
  graywhite: { name: "灰白", fur: "#B9BDC2", shade: "#91979E", light: "#DBDEE2", belly: "#FFFFFF", ear: "#E8B4B6", eye: "#D8A23E", line: "#7C828A" },
  orangewhite: { name: "橘白", fur: "#F0A85A", shade: "#D2832F", light: "#FFDCA8", belly: "#FFF7EA", ear: "#F2A2A6", eye: "#5E9A5A", line: "#C0742C" },
  tortie: { name: "玳瑁", fur: "#4A3E3A", shade: "#2E2623", light: "#6E5A50", belly: "#EDE0CC", ear: "#D79A9B", eye: "#D8A83E", line: "#241D1A" },
  cream: { name: "奶油", fur: "#F6E6C8", shade: "#DFCAA6", light: "#FFF6E4", belly: "#FFFDF6", ear: "#EFC0BE", eye: "#6FAE86", line: "#C9B18C" },
  silver: { name: "银渐层", fur: "#D8DADD", shade: "#AFB3B8", light: "#F0F1F2", belly: "#FAFAFA", ear: "#E6B6B9", eye: "#63B0C9", line: "#92979D", stripes: true },
};

/* ---------------- 颜色工具 ---------------- */
const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
const toHex = c => "#" + [c.r, c.g, c.b].map(v => clamp(v).toString(16).padStart(2, "0")).join("").toUpperCase();
const hexToNum = s => {
  if (typeof s === "number") return s;
  const h = String(s ?? "").trim().replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(h) ? parseInt(h, 16) : null;
};
const mix = (a, b, t) => ({ r: a.r * (1 - t) + b.r * t, g: a.g * (1 - t) + b.g * t, b: a.b * (1 - t) + b.b * t });
const darken = (c, t) => mix(c, { r: 0, g: 0, b: 0 }, t);
const lighten = (c, t) => mix(c, { r: 255, g: 255, b: 255 }, t);
const distance = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

function hue(c) {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return 0;
  let h;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/* ---------------- 图片解码与取色（单文件，不遍历目录） ---------------- */
function checkImageBudget(file) {
  const stat = fs.statSync(file);
  if (stat.size > 24 * 1024 * 1024) throw new Error("图片过大（上限 24MB）");
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const head = Buffer.alloc(24);
    const n = fs.readSync(fd, head, 0, head.length, 0);
    let width = 0, height = 0;
    if (n >= 24 && head[0] === 0x89 && head.toString("ascii", 1, 4) === "PNG") {
      width = head.readUInt32BE(16);
      height = head.readUInt32BE(20);
    } else if (n >= 24 && head[0] === 0xff && head[1] === 0xd8) {
      const buf = fs.readFileSync(file);
      for (let i = 2; i < buf.length - 9; i++) {
        if (buf[i] !== 0xff) continue;
        const marker = buf[i + 1];
        if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2 || marker === 0xc3) {
          height = buf.readUInt16BE(i + 5);
          width = buf.readUInt16BE(i + 7);
          break;
        }
        if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) continue;
        const len = buf.readUInt16BE(i + 2);
        if (len < 2) break;
        i += len + 1;
      }
    }
    if (width > 16384 || height > 16384 || (width && height && width * height > 64_000_000)) {
      throw new Error(`图片像素过大（${width}x${height}，上限 6400 万像素）`);
    }
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function decodeImage(file) {
  checkImageBudget(file);
  const buf = fs.readFileSync(file);
  if (buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") {
    const png = PNG.sync.read(buf);
    return { data: png.data, width: png.width, height: png.height };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    const img = jpeg.decode(buf, { useTArray: true });
    return { data: img.data, width: img.width, height: img.height };
  }
  throw new Error("不支持的图片格式，请使用 PNG 或 JPEG");
}

function dominantColors({ data, width, height }) {
  const total = width * height;
  const step = Math.max(1, Math.floor(Math.sqrt(total / 60000)));
  const collect = (allowLowSat) => {
    const buckets = new Map();
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const i = (y * width + x) * 4;
        if (data[i + 3] < 128) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const lum = (r * 299 + g * 587 + b * 114) / 1000;
        const sat = Math.max(r, g, b) === 0 ? 0 : (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b);
        if (lum < 24 || lum > 246) continue;
        if (!allowLowSat && sat < 0.12) continue;
        const key = `${r >> 4},${g >> 4},${b >> 4}`;
        let e = buckets.get(key);
        if (!e) buckets.set(key, (e = { r: 0, g: 0, b: 0, n: 0 }));
        e.r += r; e.g += g; e.b += b; e.n++;
      }
    }
    return [...buckets.values()]
      .map(e => ({ r: e.r / e.n, g: e.g / e.n, b: e.b / e.n, n: e.n }))
      .sort((a, b) => b.n - a.n);
  };

  let sorted = collect(false);
  if (sorted.length < 2) sorted = collect(true);
  if (!sorted.length) throw new Error("图片中没有可用于取色的像素");
  const picked = [];
  for (const c of sorted) {
    if (picked.every(p => distance(p, c) > 58)) picked.push(c);
    if (picked.length >= 4) break;
  }
  return { picked, sampleCount: sorted.reduce((s, c) => s + c.n, 0) };
}

function generateCoat(imagePath, name) {
  const abs = path.resolve(imagePath);
  if (!fs.existsSync(abs)) throw new Error(`图片不存在：${abs}`);
  const { picked, sampleCount } = dominantColors(decodeImage(abs));
  const fur = lighten(picked[0], 0.06);
  const second = picked[1];
  let eye;
  const secondHue = second ? hue(second) : -1;
  if (second && secondHue >= 35 && secondHue <= 190 && Math.max(second.r, second.g, second.b) > 90) {
    eye = lighten(second, 0.12);
  } else {
    const h = hue(fur);
    eye = (h < 70 || h > 320) ? { r: 0x4e, g: 0x8e, b: 0x5b } : { r: 0xf2, g: 0xc1, b: 0x4e };
  }
  const variation = second ? distance(picked[0], second) : 0;
  const palette = {
    name: String(name || path.basename(abs).replace(/\.[^.]+$/, "") + " 同款").slice(0, 24),
    fur: toHex(fur),
    shade: toHex(darken(fur, 0.22)),
    light: toHex(lighten(fur, 0.24)),
    belly: toHex(lighten(fur, 0.72)),
    ear: toHex(mix(fur, { r: 0xf0, g: 0xa0, b: 0xaa }, 0.78)),
    eye: toHex(eye),
    eye2: picked[2] ? toHex(lighten(picked[2], 0.12)) : undefined,
    line: toHex(darken(fur, 0.48)),
    patches: picked.slice(1, 3).map(toHex),
    stripes: variation > 72,
  };
  const brightness = (fur.r * 299 + fur.g * 587 + fur.b * 114) / 1000;
  const look = inferAppearance(picked, brightness, variation);
  return { palette, look, sampleCount, dominant: picked.slice(0, 3).map(toHex), file: abs };
}

function inferAppearance(picked, brightness, variation) {
  const second = picked[1];
  let pattern = "none";
  if (picked.length >= 3 && distance(picked[0], picked[2]) > 95) pattern = "calico";
  else if (variation > 72) pattern = "tabby";
  return {
    ear: brightness > 195 ? "round" : "pointy",
    eye: picked.length >= 3 ? "hetero" : "round",
    tail: brightness < 100 ? "fluffy" : "curved",
    body: "normal",
    headScale: brightness > 210 ? 1.06 : 1,
    accessory: "none",
    accColor: second ? toHex(second) : "#E86E82",
    pattern,
    patternSeed: Math.floor(brightness * 17 + hue(picked[0]) * 3) % 9999,
  };
}

/* ---------------- 与桌宠通信：单一配置文件，无网络 ---------------- */
function readConfig() {
  try {
    const text = fs.readFileSync(CONFIG_PATH, "utf8");
    const obj = JSON.parse(text);
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

function writeConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  const text = JSON.stringify(cfg);
  if (text.length > 256 * 1024) throw new Error("配置过大");
  fs.writeFileSync(CONFIG_PATH, text, "utf8");
}

/** 把 MCP 的配色（#RRGGBB 字符串）转成前端 CFG 使用的数值格式 */
function normalizePaletteForConfig(palette) {
  const out = { ...palette, name: String(palette.name || "照片定制").slice(0, 24) };
  for (const k of ["fur", "shade", "light", "belly", "ear", "eye", "eye2", "line"]) {
    if (out[k] === undefined) continue;
    const n = hexToNum(out[k]);
    if (n === null || n < 0 || n > 0xffffff) delete out[k];
    else out[k] = n;
  }
  if (Array.isArray(out.patches)) {
    out.patches = out.patches.map(hexToNum).filter(n => n !== null && n >= 0 && n <= 0xffffff);
    if (!out.patches.length) delete out.patches;
  }
  return out;
}

/** 原子地合并写入：读现配置 → 改字段 → 写回；桌宠进程内 watcher 会感知 mtime 变化 */
function applyToConfig({ coat, look }) {
  const cfg = readConfig();
  if (coat) {
    cfg.customCoat = normalizePaletteForConfig(coat);
    cfg.coat = "custom";
  }
  if (look && typeof look === "object") {
    cfg.look = { ...(cfg.look && typeof cfg.look === "object" ? cfg.look : {}), ...look };
  }
  writeConfig(cfg);
  return cfg;
}

/* ---------------- MCP 工具定义 ---------------- */
const TOOLS = [
  {
    name: "generate_coat_from_photo",
    description: "读取一张用户指定的本地图片（PNG/JPEG），提取主色调，生成猫咪配色和造型，写入 PawPal 唯一配置文件；桌宠通过进程内事件立即热更新。图片只在本机处理，不上传、不遍历目录。",
    inputSchema: {
      type: "object",
      properties: {
        image_path: { type: "string", description: "图片文件路径，例如 C:\\Users\\me\\Pictures\\cat.jpg（只读这一个文件）" },
        name: { type: "string", description: "可选，配色名称" },
      },
      required: ["image_path"],
    },
  },
  {
    name: "generate_cat_from_photo",
    description: "与 generate_coat_from_photo 相同：按照片生成配色和造型并热更新。这是更直观的别名。",
    inputSchema: {
      type: "object",
      properties: {
        image_path: { type: "string", description: "图片文件路径" },
        name: { type: "string", description: "可选，小猫名字/配色名称" },
      },
      required: ["image_path"],
    },
  },
  {
    name: "set_appearance",
    description: "组合式修改 PawPal 桌宠的造型部件：耳型、眼型、尾巴、体态、花纹、配饰、配饰颜色、头身比。未给出的部件保持不变。",
    inputSchema: {
      type: "object",
      properties: {
        ear: { type: "string", enum: ["pointy", "round", "fold", "tufted"] },
        eye: { type: "string", enum: ["round", "wide", "sleepy", "hetero"] },
        tail: { type: "string", enum: ["curved", "short", "fluffy", "curled"] },
        body: { type: "string", enum: ["slim", "normal", "chubby"] },
        headScale: { type: "number", minimum: 0.8, maximum: 1.3 },
        pattern: { type: "string", enum: ["none", "tabby", "tuxedo", "calico", "patches"] },
        accessory: { type: "string", enum: ["none", "bowtie", "scarf", "hat", "collar"] },
        accColor: { type: "string", description: "配饰颜色 #RRGGBB" },
        patternSeed: { type: "number" },
      },
    },
  },
  {
    name: "set_coat",
    description: "直接给 PawPal 桌宠设置配色。可以用内置预设名，也可以直接给出各部位颜色（#RRGGBB）。未给出的部位沿用当前配色。",
    inputSchema: {
      type: "object",
      properties: {
        preset: { type: "string", description: "内置预设：orange/tabby/tuxedo/calico/siamese/black/white/blue/graywhite/orangewhite/tortie/cream/silver" },
        name: { type: "string" },
        fur: { type: "string" }, shade: { type: "string" }, light: { type: "string" },
        belly: { type: "string" }, ear: { type: "string" }, eye: { type: "string" }, line: { type: "string" },
        stripes: { type: "boolean" },
      },
    },
  },
  {
    name: "list_coats",
    description: "列出 PawPal 内置的 13 种毛色预设及其十六进制颜色。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_status",
    description: "查询 PawPal 唯一配置文件的状态（路径、是否存在、配置概要）。不探测端口、不发起网络请求。",
    inputSchema: { type: "object", properties: {} },
  },
];

async function callTool(params) {
  const name = params?.name;
  const args = params?.arguments || {};
  if (name === "generate_coat_from_photo" || name === "generate_cat_from_photo") {
    if (!args.image_path) throw new Error("缺少必要参数 image_path");
    const { palette, look, sampleCount, dominant, file } = generateCoat(args.image_path, args.name);
    applyToConfig({ coat: palette, look });
    return {
      content: [{
        type: "text",
        text: [
          `已按照片生成小猫并写入 PawPal 配置文件（桌宠通过进程内事件热更新）。`,
          `配置文件：${CONFIG_PATH}`,
          `图片：${file}`,
          `采样像素：${sampleCount} 个；主色：${dominant.join("、")}`,
          `配色名称：${palette.name}`,
          `造型：耳型 ${look.ear} / 眼型 ${look.eye} / 尾巴 ${look.tail} / 体态 ${look.body} / 花纹 ${look.pattern} / 配饰 ${look.accessory}`,
        ].join("\n"),
      }],
    };
  }
  if (name === "set_appearance") {
    const allowed = ["ear", "eye", "tail", "body", "headScale", "pattern", "accessory", "accColor", "patternSeed"];
    const look = {};
    for (const key of allowed) if (args[key] !== undefined) look[key] = args[key];
    if (!Object.keys(look).length) throw new Error("请提供至少一个造型参数（如 ear、tail、accessory）");
    applyToConfig({ look });
    return { content: [{ type: "text", text: `已更新 PawPal 造型（配置文件 ${CONFIG_PATH}）：\n${JSON.stringify(look, null, 2)}` }] };
  }
  if (name === "set_coat") {
    let palette = {};
    if (args.preset) {
      const p = PRESETS[args.preset];
      if (!p) throw new Error(`未知预设 ${args.preset}，可用：${Object.keys(PRESETS).join(", ")}`);
      palette = Object.assign({}, p);
    }
    for (const key of ["name", "fur", "shade", "light", "belly", "ear", "eye", "line", "stripes"]) {
      if (args[key] !== undefined) palette[key] = args[key];
    }
    if (!Object.keys(palette).length) throw new Error("请提供 preset 或至少一个颜色参数");
    applyToConfig({ coat: palette });
    return { content: [{ type: "text", text: `已将配色写入 PawPal 配置文件：\n${JSON.stringify(palette, null, 2)}` }] };
  }
  if (name === "list_coats") {
    const lines = Object.entries(PRESETS).map(([id, c]) => `${id.padEnd(12)} ${c.name.padEnd(5)} 主色 ${c.fur} 眼色 ${c.eye}`);
    return { content: [{ type: "text", text: "PawPal 内置毛色：\n" + lines.join("\n") }] };
  }
  if (name === "get_status") {
    let exists = false, size = 0, summary = {};
    try {
      const st = fs.statSync(CONFIG_PATH);
      exists = true; size = st.size;
      const cfg = readConfig();
      summary = { coat: cfg.coat ?? null, hasLook: !!cfg.look, hasCustomCoat: !!cfg.customCoat };
    } catch {}
    return {
      content: [{
        type: "text",
        text: [
          "PawPal MCP（配置文件通道，无端口/无网络）",
          `配置文件：${CONFIG_PATH}`,
          `存在：${exists}  大小：${size} 字节`,
          `概要：${JSON.stringify(summary)}`,
          "桌宠运行时通过进程内事件感知配置文件变化并热更新。",
        ].join("\n"),
      }],
    };
  }
  throw new Error(`未知工具：${name}`);
}

/* ---------------- stdio JSON-RPC ---------------- */
function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

async function handleMessage(line) {
  let msg;
  try { msg = JSON.parse(line); }
  catch { send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); return; }
  if (msg.id === undefined) return;
  try {
    let result;
    switch (msg.method) {
      case "initialize":
        result = {
          protocolVersion: "2025-06-18",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "pawpal-mcp", version: VERSION },
          instructions: "工具通过写入单一配置文件驱动 PawPal 桌宠；桌宠用进程内事件热更新。全程无网络、无端口。",
        };
        break;
      case "ping": result = {}; break;
      case "tools/list": result = { tools: TOOLS }; break;
      case "tools/call": result = await callTool(msg.params); break;
      default:
        send({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } });
        return;
    }
    send({ jsonrpc: "2.0", id: msg.id, result });
  } catch (e) {
    send({
      jsonrpc: "2.0", id: msg.id,
      result: { content: [{ type: "text", text: `执行失败：${e.message}` }], isError: true },
    });
  }
}

/* ---------------- CLI ---------------- */
async function cli() {
  const args = process.argv.slice(2);
  if (args[0] === "--probe") {
    console.log(JSON.stringify({ configPath: CONFIG_PATH, exists: fs.existsSync(CONFIG_PATH) }, null, 2));
    return;
  }
  if (args[0] === "--apply") {
    if (!args[1]) throw new Error("用法：node mcp-server.mjs --apply <图片路径> [名称]");
    const generated = generateCoat(args[1], args[2]);
    applyToConfig({ coat: generated.palette, look: generated.look });
    console.log(JSON.stringify({ configPath: CONFIG_PATH, palette: generated.palette, look: generated.look, dominant: generated.dominant }, null, 2));
    return;
  }
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", line => { if (line.trim()) handleMessage(line); });
}

cli().catch(e => {
  if (process.argv[2]) {
    console.error("错误：" + e.message);
    process.exitCode = 1;
  } else {
    send({ jsonrpc: "2.0", id: null, error: { code: -32000, message: e.message } });
  }
});
