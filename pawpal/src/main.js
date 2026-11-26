import * as THREE from "three";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/* ============ 配置 ============ */
const DEFAULT = {
  coat: "orange", layout: 65, sleep: 8000, size: 100,
  purr: true, sleeppurr: true, idle: true, privacy: false, top: true, globalKeys: true,
  remind: false, rmMin: 45, rmText: "该起来活动一下啦",
  lookVersion: 2, // 造型体系升级标记：旧配置首次启动会切换到新版圆润奶猫造型
};
const DEFAULT_LOOK = {
  ear: "pointy", eye: "round", tail: "curved", body: "normal",
  headScale: 1.04, accessory: "none", accColor: 0xE86E82,
  pattern: "none", patternSeed: 7,
};
// 合规：唯一持久化位置是 %APPDATA%/PawPal/config.json（由 Rust 端 read_config/write_config 管理）。
// 不再使用 localStorage，也不读取剪贴板/目录。
let CFG = Object.assign({}, DEFAULT, { look: Object.assign({}, DEFAULT_LOOK) });
let applyingRemote = false; // 应用配置文件变更时阻止回写，避免循环

function mergeConfig(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const cfg = Object.assign({}, DEFAULT, raw);
  // 旧版本配置里可能残留 pass:true；穿透功能已移除，读入时统一清掉，
  // 避免旧配置导致窗口忽略鼠标（设置按钮点不开）。
  delete cfg.pass;
  // 造型体系升级：旧配置（无 lookVersion 或低于 2）强制切到新版圆润奶猫造型，
  // 老用户的“圆耳+眯眼”等旧造型不会再让新 exe 看起来很难看。其余设置保留。
  if (Number(cfg.lookVersion || 0) < 2) {
    cfg.look = Object.assign({}, DEFAULT_LOOK);
    cfg.lookVersion = 2;
  } else {
    cfg.look = Object.assign({}, DEFAULT_LOOK, raw.look || {});
  }
  CFG = cfg;
}

function saveCfg() {
  if (applyingRemote) return;
  invoke("write_config", { content: JSON.stringify(CFG) }).catch(() => {});
}

// 启动时读取唯一配置文件；读取失败则保持默认配置
async function initConfig() {
  try {
    const text = await invoke("read_config");
    if (text) mergeConfig(JSON.parse(text));
  } catch (e) {
    // 文件不存在或格式错误：使用默认配置
  }
}

const COATS = {
  orange:   { name:"橘猫", fur:0xF4A34C, shade:0xD9822E, light:0xFFD9A0, belly:0xFFF1DC, ear:0xF3A0A4, eye:0x4E8E5B, line:0xC4732B },
  tabby:    { name:"狸花", fur:0x9E8873, shade:0x6E5C4B, light:0xC9B7A1, belly:0xF3EADC, ear:0xE3A6A6, eye:0x8FBF6A, line:0x5C4B3C, stripes:true },
  tuxedo:   { name:"奶牛", fur:0x3A3740, shade:0x222027, light:0x5C5863, belly:0xFFFDF8, ear:0xD99098, eye:0xF2C14E, line:0x17151A, tuxedo:true },
  calico:   { name:"三花", fur:0xFBF3E6, shade:0xE4D3BC, light:0xFFFFFF, belly:0xFFFDF8, ear:0xEDA6A6, eye:0xE0A23C, line:0xCBB79E, patches:[0xE69A3C,0x3A3740] },
  siamese:  { name:"暹罗", fur:0xF3E4CD, shade:0xD8C4A6, light:0xFFF7E9, belly:0xFFFDF6, ear:0x6B4A42, eye:0x4FA9D6, line:0x8A6A58, points:0x5B4038 },
  black:    { name:"黑猫", fur:0x37343D, shade:0x22202A, light:0x56515F, belly:0x4A464F, ear:0xC98E96, eye:0xE8C24E, line:0x16141B },
  white:    { name:"白猫", fur:0xFBF8F4, shade:0xE2DCD6, light:0xFFFFFF, belly:0xFFFFFF, ear:0xF0B6B9, eye:0x5FA9C7, line:0xD3CCC4 },
  blue:     { name:"蓝猫", fur:0xA9B7C6, shade:0x8494A6, light:0xCBD6E1, belly:0xEBF0F5, ear:0xE0AEB2, eye:0xE8B24A, line:0x6F7F91 },
  graywhite:{ name:"灰白", fur:0xB9BDC2, shade:0x91979E, light:0xDBDEE2, belly:0xFFFFFF, ear:0xE8B4B6, eye:0xD8A23E, line:0x7C828A },
  orangewhite:{name:"橘白",fur:0xF0A85A, shade:0xD2832F, light:0xFFDCA8, belly:0xFFF7EA, ear:0xF2A2A6, eye:0x5E9A5A, line:0xC0742C},
  tortie:   { name:"玳瑁", fur:0x4A3E3A, shade:0x2E2623, light:0x6E5A50, belly:0xEDE0CC, ear:0xD79A9B, eye:0xD8A83E, line:0x241D1A, patches:[0xC97A38,0x7A5A3E] },
  cream:    { name:"奶油", fur:0xF6E6C8, shade:0xDFCAA6, light:0xFFF6E4, belly:0xFFFDF6, ear:0xEFC0BE, eye:0x6FAE86, line:0xC9B18C },
  silver:   { name:"银渐层", fur:0xD8DADD, shade:0xAFB3B8, light:0xF0F1F2, belly:0xFAFAFA, ear:0xE6B6B9, eye:0x63B0C9, line:0x92979D, stripes:true },
};

/* ============ three.js 场景 ============ */
const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth/innerHeight, 0.1, 100);
camera.position.set(0, 2.6, 11.5);
camera.lookAt(0, 1.5, 0);

scene.add(new THREE.AmbientLight(0xffffff, 2.0));
const keyLight = new THREE.DirectionalLight(0xfff2e6, 2.6);
keyLight.position.set(4, 8, 6);
scene.add(keyLight);
const rim = new THREE.DirectionalLight(0xd6e4ff, 1.1);
rim.position.set(-5, 4, -3);
scene.add(rim);

const root = new THREE.Group();
scene.add(root);

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness:0.72, metalness:0.02, ...opts });
}

/* ---- 材质引用，便于换色 ---- */
const M = {
  fur: mat(0xF4A34C), shade: mat(0xD9822E), light: mat(0xFFD9A0),
  belly: mat(0xFFF1DC), ear: mat(0xF3A0A4), eye: mat(0x4E8E5B),
  line: mat(0xC4732B), black: mat(0x1d1a20), white: mat(0xffffff),
  // 蓝白萌眼：眼线/虹膜/瞳孔全部蓝色系，去掉棕色与黑色
  eyeSocket: mat(0x9CCBEC), pupil: mat(0x3E86C4),
  sclera: mat(0xFFFDF7, { roughness:0.34 }), limbal: mat(0x5599D0),
  irisBlue: mat(0xCAE8FA), irisIce: mat(0xE4F4FF),
  nose: mat(0xE88b92), face: mat(0x6d4a42), keycap: mat(0x6b6573), keybody: mat(0x38353f),
  mouseBody: mat(0xf4f2f6), mouseWheel: mat(0xb9b4c2),
  eye2: mat(0x4FA9D6), patch1: mat(0xE69A3C), patch2: mat(0x3A3740), acc: mat(0xE86E82), bell: mat(0xF2C14E),
};

function sphere(r, material, seg = 32) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), material);
}
function roundedBox(w, h, d, r, material) {
  const g = new THREE.BoxGeometry(w, h, d, 4, 4, 4);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ix = THREE.MathUtils.clamp(x, -w/2+r, w/2-r);
    const iy = THREE.MathUtils.clamp(y, -h/2+r, h/2-r);
    const iz = THREE.MathUtils.clamp(z, -d/2+r, d/2-r);
    const dx = x-ix, dy = y-iy, dz = z-iz;
    const len = Math.hypot(dx,dy,dz) || 1;
    pos.setXYZ(i, ix+dx/len*r, iy+dy/len*r, iz+dz/len*r);
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}
function cone(r, h, material, seg = 16) {
  return new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), material);
}

// 变半径管：用来画从根部到尖端逐渐变细的猫尾，避免默认 TubeGeometry 的“等粗香肠”观感
function taperedTube(curve, tubularSegments, radialSegments, radiusStart, radiusEnd) {
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const positions = [], normals = [], uvs = [], indices = [];
  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    const p = curve.getPointAt(t);
    const r = THREE.MathUtils.lerp(radiusStart, radiusEnd, Math.pow(t, 0.75));
    const N = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j <= radialSegments; j++) {
      const v = j / radialSegments * Math.PI * 2;
      const n = N.clone().multiplyScalar(-Math.cos(v)).add(B.clone().multiplyScalar(Math.sin(v))).normalize();
      positions.push(p.x + r*n.x, p.y + r*n.y, p.z + r*n.z);
      normals.push(n.x, n.y, n.z);
      uvs.push(t, j / radialSegments);
    }
  }
  for (let i = 1; i <= tubularSegments; i++) {
    for (let j = 1; j <= radialSegments; j++) {
      const a = (radialSegments+1)*(i-1) + (j-1);
      const b = (radialSegments+1)*i + (j-1);
      const c = (radialSegments+1)*i + j;
      const d = (radialSegments+1)*(i-1) + j;
      indices.push(a,b,d, b,c,d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  return g;
}

/* ---- 猫：可组合部件系统 ---- */
const cat = new THREE.Group();
root.add(cat);

// KuroCat 风格的坐姿梨形身体：肩窄、下摆圆，侧面略扁
const bodyProfile = [
  [0,-1.16], [0.48,-1.13], [0.82,-0.98], [1.02,-0.62],
  [1.06,-0.18], [0.96,0.34], [0.76,0.78], [0.5,1.0], [0,1.06],
].map(([x,y]) => new THREE.Vector2(x,y));
const body = new THREE.Mesh(new THREE.LatheGeometry(bodyProfile, 36), M.fur);
body.geometry.scale(1, 1, 0.82);
body.position.y = 0.06;
cat.add(body);

const belly = sphere(0.9, M.belly);
belly.scale.set(0.86, 0.92, 0.3);
belly.position.set(0, -0.34, 0.74);
cat.add(belly);

const patternBodyHolder = new THREE.Group();
body.add(patternBodyHolder);
const accBodyHolder = new THREE.Group();
cat.add(accBodyHolder);
const tailHolder = new THREE.Group();
cat.add(tailHolder);

const headGroup = new THREE.Group();
headGroup.position.set(0, 1.8, 0.12);
cat.add(headGroup);

// 圆润奶猫头：更大更饱满的圆脸，纵向略压、横向略宽，正面接近心形
const head = sphere(1.16, M.fur);
head.scale.set(1.02, 1.0, 0.92);
headGroup.add(head);

// 贴合脸颊：与头同色的圆润下颊，融进轮廓而不是独立贴在脸上的球
for (const s of [-1,1]) {
  const cheek = sphere(0.5, M.fur, 24);
  cheek.scale.set(0.98, 0.72, 0.6);
  cheek.position.set(s*0.6, -0.34, 0.32);
  headGroup.add(cheek);
}

// 柔和口鼻垫：一整块浅色椭圆取代原来的两团白球，更干净；配一个小下巴
const muzzle = sphere(0.5, M.belly, 24);
muzzle.scale.set(1.05, 0.62, 0.5); muzzle.position.set(0, -0.33, 0.86); headGroup.add(muzzle);
const chin = sphere(0.26, M.belly, 20);
chin.scale.set(1.0, 0.52, 0.46); chin.position.set(0, -0.58, 0.82); headGroup.add(chin);

const patternHeadHolder = new THREE.Group();
const earHolder = new THREE.Group();
const eyeHolder = new THREE.Group();
const accHeadHolder = new THREE.Group();
headGroup.add(patternHeadHolder, earHolder, eyeHolder, accHeadHolder);

// 淡粉腮红（摸头时加深，动画循环里会调整透明度）
const blushL = sphere(0.17, mat(0xF08C96,{transparent:true,opacity:0.42}));
blushL.scale.set(1.2,0.66,0.28); blushL.position.set(-0.72,-0.3,0.78); headGroup.add(blushL);
const blushR = blushL.clone(); blushR.position.x = 0.72; headGroup.add(blushR);

// 粉嫩倒三角小鼻：用扁球+微旋转得到圆润三角感，比硬锥更可爱
const nose = sphere(0.13, M.nose, 16);
nose.scale.set(1.0, 0.72, 0.62);
nose.rotation.z = Math.PI; nose.position.set(0, -0.27, 1.09); headGroup.add(nose);

// 柔和猫嘴：两段上扬弧线组成的 ω 形，贴合口鼻垫
const mouthMat = new THREE.LineBasicMaterial({ color:0x8a625c, transparent:true, opacity:0.85 });
for (const s of [-1,1]) {
  const pts=[];
  for (let i=0;i<=10;i++){ const t=i/10; pts.push(new THREE.Vector3(s*(0.015+t*0.17), -0.31 - Math.sin(t*Math.PI)*0.075, 1.135)); }
  headGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mouthMat));
}

// 白色弯胡须：每侧三根，带自然下垂弧度的曲线，不再是一根硬直线
const whiskerMat = new THREE.LineBasicMaterial({ color:0xfaf3ec, transparent:true, opacity:0.85 });
for (const s of [-1,1]) for (let i=0;i<3;i++){
  const y0 = -0.2 + i*0.12;
  const pts=[];
  for (let k=0;k<=8;k++){
    const t=k/8;
    pts.push(new THREE.Vector3(s*(0.3+t*0.72), y0 + t*0.16 - t*t*0.2, 0.98 - t*0.26));
  }
  headGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), whiskerMat));
}

// 享受表情：闭眼弧线由眼睛系统统一显示，这里只放小舌头
const happyFace = new THREE.Group();
headGroup.add(happyFace);
const tongue = sphere(0.075, M.nose, 16);
tongue.scale.set(1.1, 0.7, 0.5);
tongue.position.set(0, -0.42, 1.06);
happyFace.add(tongue);
happyFace.visible = false;

// 前爪（固定部件，位置随体态调整）
const paws = [];
function makePaw(sign) {
  const g = new THREE.Group();
  g.position.set(sign*0.56, -0.74, 0.8);
  const pad = sphere(0.3, M.fur);
  pad.scale.set(0.95, 0.7, 1.1);
  g.add(pad);
  // 白色小爪尖（白袜爪）+ 两颗小趾，肉感更足
  const toe = sphere(0.2, M.belly);
  toe.scale.set(1.05, 0.62, 0.6); toe.position.set(0, -0.06, 0.24); g.add(toe);
  for (const d of [-1,1]) {
    const digit = sphere(0.085, M.belly, 12);
    digit.position.set(d*0.13, -0.02, 0.3); digit.scale.set(1, 0.8, 0.9); g.add(digit);
  }
  cat.add(g);
  paws.push({ group:g, sign, baseX:g.position.x, baseY:g.position.y, baseZ:g.position.z });
}
makePaw(-1); makePaw(1);

let eyes = [];
let tailGroup = null;
let tailMesh = null;

function clearGroup(group) {
  for (const child of [...group.children]) {
    child.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    group.remove(child);
  }
}

// 圆润耳片：用扁球裁出柔和三角轮廓，再叠一层粉色内耳，避免生硬的三棱锥
function earLeaf(r, material, sx, sy, sz) {
  const m = sphere(r, material, 20);
  m.scale.set(sx, sy, sz);
  return m;
}
function buildEars(style) {
  clearGroup(earHolder);
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    if (style === "round") {
      // 圆耳：半圆小耳，最柔和
      const outer = earLeaf(0.4, M.fur, 1.0, 0.9, 0.5); outer.position.set(s*0.7, 0.8, -0.04); g.add(outer);
      const inner = earLeaf(0.24, M.ear, 1.0, 0.85, 0.3); inner.position.set(s*0.7, 0.78, 0.18); g.add(inner);
    } else if (style === "fold") {
      // 折耳：耳尖向前下方折下，贴在头顶
      const outer = earLeaf(0.42, M.fur, 1.05, 0.52, 0.42);
      outer.rotation.z = -s*0.5; outer.position.set(s*0.66, 0.82, -0.02); g.add(outer);
      const inner = earLeaf(0.26, M.ear, 1.0, 0.5, 0.28);
      inner.rotation.z = -s*0.5; inner.position.set(s*0.66, 0.76, 0.18); g.add(inner);
      const foldTip = earLeaf(0.16, M.fur, 1.0, 0.7, 0.4);
      foldTip.rotation.z = s*0.35; foldTip.position.set(s*0.86, 0.6, 0.12); g.add(foldTip);
    } else if (style === "tufted") {
      // 簇耳：高而圆润的耳 + 顶部两撮小绒
      const outer = earLeaf(0.44, M.fur, 0.95, 1.25, 0.42);
      outer.rotation.z = -s*0.1; outer.position.set(s*0.68, 1.0, -0.04); g.add(outer);
      const inner = earLeaf(0.26, M.ear, 0.95, 1.15, 0.26);
      inner.rotation.z = -s*0.1; inner.position.set(s*0.68, 0.98, 0.18); g.add(inner);
      for (let i=0;i<2;i++) {
        const tuft = earLeaf(0.1, M.fur, 0.8, 1.6, 0.5);
        tuft.position.set(s*(0.56+i*0.16), 1.42, 0.02); tuft.rotation.z = s*0.26; g.add(tuft);
      }
    } else {
      // 尖耳（默认）：圆耳根 + 明确三角尖端，兼顾可爱与“猫耳”辨识度
      const outer = cone(0.5, 1.12, M.fur, 4);
      outer.rotation.set(0, Math.PI/4, -s*0.12);
      outer.scale.z = 0.42; outer.position.set(s*0.7, 1.02, -0.04); g.add(outer);
      const base = earLeaf(0.36, M.fur, 1.0, 0.62, 0.4);
      base.position.set(s*0.7, 0.76, -0.03); g.add(base);
      const inner = cone(0.29, 0.72, M.ear, 4);
      inner.rotation.set(0, Math.PI/4, -s*0.12);
      inner.scale.z = 0.35; inner.position.set(s*0.7, 0.96, 0.15); g.add(inner);
    }
    earHolder.add(g);
  }
}

// 眼睛：造型样式只决定“默认是否闭眼”，实际开合由动画状态统一控制。
// 之前眯眼只是把眼球压扁，animation 里 scale.y 又被重置为 1，所以看起来仍睁眼。
let eyeStyleClosed = false;
function buildEyes(style) {
  clearGroup(eyeHolder);
  eyes = [];
  eyeStyleClosed = style === "sleepy"; // 只剩 圆眼/眯眼/异瞳
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(s*0.45, 0.16, 0.9);
    // 首版经典眼睛：白色眼白 + 随毛色的彩色虹膜 + 深色竖瞳 + 白色高光
    const white = sphere(0.3, M.white, 24);
    white.scale.set(1, 1.12, 0.42); g.add(white);
    const irisMat = style === "hetero" && s > 0 ? M.eye2 : M.eye;
    const iris = sphere(0.19, irisMat, 20);
    iris.scale.set(1, 1, 0.5); iris.position.z = 0.12; g.add(iris);
    const pupil = sphere(0.09, M.black, 16);
    pupil.scale.set(0.8, 1.15, 0.4); pupil.position.z = 0.19; g.add(pupil);
    const spark = sphere(0.055, M.white, 12);
    spark.position.set(-0.07, 0.08, 0.23); g.add(spark);

    // 闭眼弧线：沿用首版描边色，闭眼时显示（保留弯月机制，避免眯眼失效）
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.042, 8, 22, Math.PI), M.line);
    arc.position.set(s*0.45, 0.14, 0.98);
    arc.visible = false;
    eyeHolder.add(arc);

    eyeHolder.add(g);
    eyes.push({ group:g, closedArc:arc, iris, pupil, spark, sign:s });
  }
}

function buildTail(style) {
  clearGroup(tailHolder);
  tailGroup = new THREE.Group();
  // 尾巴从身体右后方贴地伸出，参考图是「躺/坐时粗尾绕在身侧、尾尖轻轻上翘」
  tailGroup.position.set(0.7, -0.96, -0.18);
  tailHolder.add(tailGroup);
  const V = (x,y,z) => new THREE.Vector3(x,y,z);
  let pts, r0, r1;
  if (style === "short") {
    pts = [V(0,0,0), V(0.32,0.02,-0.04), V(0.58,0.16,0.02)];
    r0 = 0.26; r1 = 0.2;
  } else if (style === "curled") {
    pts = [V(0,0,0), V(0.4,0.02,-0.08), V(0.78,0.12,-0.04),
           V(0.92,0.42,0.06), V(0.7,0.6,0.12), V(0.46,0.52,0.16)];
    r0 = 0.25; r1 = 0.11;
  } else if (style === "fluffy") {
    pts = [V(0,0,0), V(0.34,0.0,-0.1), V(0.68,0.08,-0.1),
           V(0.98,0.24,-0.02), V(1.08,0.5,0.08), V(0.88,0.66,0.14)];
    r0 = 0.34; r1 = 0.24;
  } else {
    // 默认“弯尾”：贴着地面绕到身侧，尾尖圆润上翘，整体呈横卧的 C 形
    pts = [V(0,0,0), V(0.36,0.0,-0.06), V(0.72,0.1,-0.04),
           V(1.0,0.3,0.04), V(1.02,0.56,0.12), V(0.82,0.68,0.16)];
    r0 = 0.3; r1 = 0.22;
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  tailMesh = new THREE.Mesh(taperedTube(curve, 48, 12, r0, r1), M.fur);
  tailGroup.add(tailMesh);
  const tip = sphere(r1, M.fur, 16);
  tip.position.copy(pts[pts.length-1]); tailGroup.add(tip);
}

// 花纹贴片：先用一段圆弧算出身体/头部曲面上某经纬度对应的点，
// 再把薄片贴到该点并让法线朝外，避免方块/球体浮在表面或穿模。
function curvedPatch(holder, R, squash, lat, lon, w, h, material) {
  // lat: 竖直方向弧度（0=赤道，正=上）；lon: 水平绕行弧度（0=正前方）
  const x = Math.sin(lon) * Math.cos(lat) * R;
  const y = Math.sin(lat) * R;
  const z = Math.cos(lon) * Math.cos(lat) * R * squash;
  const patch = sphere(1, material, 16);
  patch.scale.set(w, h, 0.045);
  patch.position.set(x, y, z);
  // 让薄片正面朝向曲面外法线
  patch.lookAt(new THREE.Vector3(x*2, y*2, z*2));
  holder.add(patch);
  return patch;
}

function buildPattern(pattern) {
  clearGroup(patternBodyHolder);
  clearGroup(patternHeadHolder);
  // 身体是 LatheGeometry：中段半径约 1.06，z 压扁 0.82；头半径 1.16，z 压 0.92
  const bodyR = 1.04, bodyZ = 0.82, headR = 1.16, headZ = 0.92;
  if (pattern === "tabby") {
    // 身体两侧竖纹：沿曲面错落排布，不再用方块
    for (let i=0;i<5;i++) {
      const lon = (i-2)*0.24;
      curvedPatch(patternBodyHolder, bodyR, bodyZ, 0.18 + (i%2)*0.12, lon, 0.085, 0.26, M.shade);
    }
    // 额头三条短纹：都不遮挡眼睛
    for (let i=-1;i<=1;i++) {
      curvedPatch(patternHeadHolder, headR, headZ, 0.72, i*0.2, 0.07, 0.2, M.shade);
    }
  } else if (pattern === "tuxedo") {
    // 奶牛：脸颊下侧与胸口的白色块，贴曲面且不与默认白口鼻/白肚子冲突
    for (const s of [-1,1]) {
      curvedPatch(patternHeadHolder, headR, headZ, -0.1, s*0.78, 0.3, 0.34, M.belly);
    }
    curvedPatch(patternBodyHolder, bodyR, bodyZ, 0.42, 0, 0.34, 0.42, M.belly);
  } else if (pattern === "calico" || pattern === "patches") {
    const seed = Number(CFG.look?.patternSeed) || 7;
    const rnd = n => { const x = Math.sin(seed*127.1 + n*311.7) * 43758.5453; return x - Math.floor(x); };
    // 身体色斑：限制在脖子以下、肚子两侧的背/侧区域，避免糊在白肚子上
    for (let i=0;i<5;i++) {
      const lon = (rnd(i)-0.5)*1.7;
      const lat = 0.1 + rnd(i+10)*0.55;
      curvedPatch(patternBodyHolder, bodyR, bodyZ, lat, lon,
        0.18+rnd(i+20)*0.1, 0.16+rnd(i+30)*0.1, i%2 ? M.patch2 : M.patch1);
    }
    // 头顶色斑：只在额头较高处，避开双眼
    for (let i=0;i<2;i++) {
      curvedPatch(patternHeadHolder, headR, headZ, 0.62+rnd(i+40)*0.18,
        (i?1:-1)*(0.22+rnd(i+50)*0.2), 0.16, 0.14, i%2 ? M.patch2 : M.patch1);
    }
  }
}

// 配饰统一挂在头部节点、用头局部坐标定位。当前头半径 1.16、头心 y=1.8，
// 脸颊与口鼻把下半张脸整个包住，所以颈部配饰必须放到 z 更靠前的位置才露得出来。
function buildAccessory(kind) {
  clearGroup(accHeadHolder);
  clearGroup(accBodyHolder);
  if (kind === "bowtie") {
    // 领结：下巴正下方、口鼻前缘，不能被白下巴挡住
    for (const s of [-1, 1]) {
      const wing = cone(0.22, 0.4, M.acc, 3);
      wing.rotation.z = s*Math.PI/2; wing.position.set(s*0.26, -0.76, 0.95); accHeadHolder.add(wing);
    }
    const knot = sphere(0.12, M.acc, 12); knot.position.set(0, -0.76, 1.03); accHeadHolder.add(knot);
  } else if (kind === "scarf") {
    // 围巾：环套在脖子（头下方），半径大于该高度头截面；尾巴垂在胸前
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.15, 10, 28), M.acc);
    ring.rotation.x = Math.PI/2; ring.position.set(0, -0.82, 0.12); accHeadHolder.add(ring);
    const tail1 = roundedBox(0.26, 0.62, 0.13, 0.06, M.acc);
    tail1.position.set(0.5, -1.15, 0.82); tail1.rotation.z = -0.12; accHeadHolder.add(tail1);
    const tail2 = roundedBox(0.24, 0.5, 0.13, 0.06, M.acc);
    tail2.position.set(0.68, -1.08, 0.74); tail2.rotation.z = -0.26; accHeadHolder.add(tail2);
  } else if (kind === "hat") {
    // 帽子：帽檐坐在头顶（局部 y≈1.06），整体后移避开眼睛与耳朵根部
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.74, 0.09, 28), M.acc);
    brim.position.set(0, 1.1, -0.12); brim.rotation.x = -0.1; accHeadHolder.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.54, 0.56, 24), M.acc);
    crown.position.set(0, 1.38, -0.12); accHeadHolder.add(crown);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.5, 0.1, 24), M.belly);
    band.position.set(0, 1.18, -0.12); accHeadHolder.add(band);
  } else if (kind === "collar") {
    // 项圈：套在头下方颈部，半径 0.86 大于该高度头截面；铃铛前置到口鼻下方
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.075, 10, 36), M.acc);
    ring.rotation.x = Math.PI/2; ring.position.set(0, -0.82, 0.12); accHeadHolder.add(ring);
    const tab = roundedBox(0.18, 0.1, 0.12, 0.03, M.acc);
    tab.position.set(0, -0.88, 0.92); accHeadHolder.add(tab);
    const bell = sphere(0.15, M.bell, 16);
    bell.position.set(0, -0.93, 1.0); accHeadHolder.add(bell);
  }
}

function applyBody() {
  const b = CFG.look?.body || "normal";
  const s = b === "slim" ? 0.82 : b === "chubby" ? 1.16 : 1;
  body.scale.set(s, 0.96*(b === "chubby" ? 1.05 : 1), s);
  // 白肚与身体等比缩放：z 半径/位置随 s 联动，避免 chubby 时边缘曲率失配戳出尖角
  const by = b === "chubby" ? 1.05 : 1;
  belly.scale.set(0.86*s, 0.92*by, 0.3*s);
  belly.position.z = 0.74*s;
  headGroup.scale.setScalar(CFG.look?.headScale || 1);
  paws.forEach(p => {
    p.group.position.x = p.sign*0.58*s;
    p.group.position.y = -0.72 + (b === "chubby" ? 0.06 : 0);
    p.baseX = p.group.position.x;
    p.baseY = p.group.position.y;
    p.baseZ = p.group.position.z;
  });
}

function normalizeLook(input) {
  const out = {};
  const options = {
    ear: ["pointy","round","fold","tufted"],
    eye: ["round","sleepy","hetero"],
    tail: ["curved","short","fluffy","curled"],
    body: ["slim","normal","chubby"],
    accessory: ["none","bowtie","scarf","hat","collar"],
    pattern: ["none","tabby","tuxedo","calico","patches"],
  };
  for (const [key, list] of Object.entries(options)) {
    if (input?.[key] && list.includes(input[key])) out[key] = input[key];
  }
  if (input?.headScale !== undefined) out.headScale = THREE.MathUtils.clamp(Number(input.headScale) || 1, 0.8, 1.3);
  if (input?.patternSeed !== undefined) out.patternSeed = Math.floor(Number(input.patternSeed) || 7);
  if (input?.accColor !== undefined) {
    const v = input.accColor;
    if (typeof v === "number" && v >= 0 && v <= 0xffffff) out.accColor = v;
    else if (typeof v === "string") {
      const h = v.replace(/^#/, "").replace(/^0x/i, "");
      if (/^[0-9a-f]{6}$/i.test(h)) out.accColor = parseInt(h, 16);
    }
  }
  return out;
}

function applyLook(input, silent = false) {
  CFG.look = Object.assign({}, DEFAULT_LOOK, CFG.look || {}, normalizeLook(input));
  saveCfg();
  M.acc.color.setHex(CFG.look.accColor);
  buildEars(CFG.look.ear);
  buildEyes(CFG.look.eye);
  buildTail(CFG.look.tail);
  buildPattern(CFG.look.pattern);
  buildAccessory(CFG.look.accessory);
  applyBody();
  syncLookUI();
  if (!silent) showToast("造型已更新");
  return CFG.look;
}
window.__pawpalApplyLook = applyLook;

/* ---- 键盘 ---- */
const keyboard = new THREE.Group();
keyboard.position.set(0, -1.32, 1.05);
keyboard.rotation.x = -0.16;
root.add(keyboard);

const kbBody = roundedBox(6.3, 0.24, 2.0, 0.12, M.keybody);
keyboard.add(kbBody);

const keyMeshes = [];
function buildKeys(layout) {
  keyMeshes.forEach(m => keyboard.remove(m));
  keyMeshes.length = 0;
  const rows = layout === 104 ? 6 : 5;
  const cols = layout === 104 ? 16 : 15;
  const kw = 0.34, kh = 0.26, gap = 0.055;
  const totalW = cols*(kw+gap) - gap;
  const totalH = rows*(kh+gap) - gap;
  for (let r=0;r<rows;r++){
    for (let c=0;c<cols;c++){
      const k = roundedBox(kw, 0.12, kh, 0.035, M.keycap.clone());
      k.position.set(-totalW/2 + c*(kw+gap) + kw/2, 0.18, -totalH/2 + r*(kh+gap) + kh/2);
      k.userData.baseY = k.position.y;
      k.userData.press = 0;
      keyboard.add(k);
      keyMeshes.push(k);
    }
  }
}
buildKeys(CFG.layout);

/* ---- 按键键帽弹出：像小键帽一样在猫咪身旁抛物跳跃，隐私模式下只显示圆点 ---- */
// 挂在 root 而非 keyboard，弹字不再局限在键盘上
const popupsGroup = new THREE.Group();
root.add(popupsGroup);
const symbolTextures = new Map();
const keyPopups = [];

function symbolLabel(key) {
  if (!key) return "";
  const special = {
    " ": "␣", Space: "␣", Enter: "↵", NumpadEnter: "↵", Tab: "⇥", Backspace: "⌫",
    Escape: "Esc", Delete: "Del", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
    Shift: "⇧", Control: "Ctrl", Alt: "Alt", Meta: "◆", CapsLock: "⇪",
  };
  if (special[key]) return special[key];
  return key.length === 1 ? key.toUpperCase() : key.slice(0, 2);
}

// 画出带键帽外观的贴图：圆角键帽面 + 底部厚度 + 描边 + 字符
function symbolTexture(text) {
  let tex = symbolTextures.get(text);
  if (tex) return tex;
  const canvas = document.createElement("canvas");
  canvas.width = 160; canvas.height = 140;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const rr = (x,y,w,h,r)=>{
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  };
  // 键帽底部厚度（深色）
  ctx.fillStyle = "rgba(38,30,48,0.92)";
  rr(20, 34, 120, 82, 16); ctx.fill();
  // 键帽顶面（浅色渐变）
  const grad = ctx.createLinearGradient(0, 22, 0, 106);
  grad.addColorStop(0, "#fffaf0"); grad.addColorStop(1, "#e4dac7");
  ctx.fillStyle = grad; rr(20, 22, 120, 82, 16); ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = "rgba(72,56,86,0.9)"; ctx.stroke();
  // 字符
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `bold ${text.length > 1 ? 50 : 70}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = "#4a3a54";
  ctx.fillText(text, 80, 64);
  tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (symbolTextures.size > 80) {
    const first = symbolTextures.keys().next().value;
    symbolTextures.get(first).dispose();
    symbolTextures.delete(first);
  }
  symbolTextures.set(text, tex);
  return tex;
}

// 在猫咪身旁（左键左侧 / 右键右侧）生成一枚向上抛物跳跃的键帽
function spawnSymbol(side, label) {
  if (!label) return;
  const material = new THREE.SpriteMaterial({
    map: symbolTexture(label), transparent: true, depthTest: false, opacity: 1,
  });
  const sprite = new THREE.Sprite(material);
  const dir = side === "L" ? -1 : 1;
  const x0 = dir * (1.55 + Math.random()*0.55);
  const y0 = -0.65 + Math.random()*0.35;
  sprite.position.set(x0, y0, 1.6);
  sprite.scale.set(0.62, 0.54, 1);
  popupsGroup.add(sprite);
  keyPopups.push({
    mesh: sprite, life: 1, x0, y0,
    vx: dir*(0.2 + Math.random()*0.35),
    vy: 3.0 + Math.random()*0.8,
    spin: (Math.random()-0.5)*0.6,
    sec: 0,
  });
  while (keyPopups.length > 20) {
    const old = keyPopups.shift();
    popupsGroup.remove(old.mesh);
    old.mesh.material.dispose();
  }
}

/* ---- 迷你鼠标 ---- */
const miniMouse = new THREE.Group();
miniMouse.position.set(3.95, -1.15, 1.35);
root.add(miniMouse);
const mouseBody = roundedBox(0.72, 0.3, 1.0, 0.28, M.mouseBody);
miniMouse.add(mouseBody);
const wheel = roundedBox(0.1, 0.06, 0.2, 0.04, M.mouseWheel);
wheel.position.set(0, 0.18, -0.1);
miniMouse.add(wheel);
const mEyeL = sphere(0.055, M.eye); mEyeL.position.set(-0.17,0.17,-0.32); miniMouse.add(mEyeL);
const mEyeR = sphere(0.055, M.eye); mEyeR.position.set(0.17,0.17,-0.32); miniMouse.add(mEyeR);

/* ============ 状态机 ============ */
const S = {
  t:0, lastAct:performance.now(), sleeping:false, petting:false,
  pawL:0, pawR:0, flash:{key:"",side:"",t:0},
  lastKey:0, pawTarget:{ L:null, R:null }, typing:0,
  eyeX:0, eyeY:0, headTilt:0, blink:0, nextBlink:1500+Math.random()*2500,
  scroll:0, mouseX:0, mouseY:0, demo:false, demoTimer:0,
  nextIdle:3000+Math.random()*3000, yawn:0, zzz:[], hearts:[],
};

function currentCoat() {
  if (CFG.coat === "custom" && CFG.customCoat) return CFG.customCoat;
  return COATS[CFG.coat] || COATS.orange;
}

function applyCoat() {
  const c = currentCoat();
  M.fur.color.setHex(c.fur); M.shade.color.setHex(c.shade); M.light.color.setHex(c.light);
  M.belly.color.setHex(c.belly); M.ear.color.setHex(c.ear); M.eye.color.setHex(c.eye);
  M.line.color.setHex(c.line);
  M.eye2.color.setHex(c.eye2 ?? 0x4FA9D6);
  M.patch1.color.setHex(c.patches?.[0] ?? 0xE69A3C);
  M.patch2.color.setHex(c.patches?.[1] ?? 0x3A3740);
  nose.visible = true; // 参考图：粉色小鼻
  buildPattern(CFG.look?.pattern || "none");
  [...document.querySelectorAll(".coat")].forEach(el=>{
    el.classList.toggle("sel", el.dataset.coat === CFG.coat);
  });
  keyMeshes.forEach(k => k.material.color.setHex(0x6b6573));
}

/* MCP 传来的配色做归一化，支持 #RRGGBB / RRGGBB / 0xRRGGBB / 数字 */
function normalizeCoat(input) {
  const toHex = v => {
    if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 0xffffff) return v;
    if (typeof v === "string") {
      const s = v.trim().replace(/^#/, "").replace(/^0x/i, "");
      if (/^[0-9a-f]{6}$/i.test(s)) return parseInt(s, 16);
      if (/^[0-9a-f]{3}$/i.test(s)) return parseInt(s.split("").map(x => x + x).join(""), 16);
    }
    return null;
  };
  const out = Object.assign({}, currentCoat());
  for (const k of ["fur","shade","light","belly","ear","eye","line"]) {
    const hex = toHex(input?.[k]);
    if (hex !== null) out[k] = hex;
  }
  if (toHex(input?.eye2) !== null) out.eye2 = toHex(input.eye2);
  if (Array.isArray(input?.patches)) {
    const patches = input.patches.map(toHex).filter(v => v !== null);
    if (patches.length) out.patches = patches;
  }
  out.name = String(input?.name || "照片定制").slice(0, 24);
  if (typeof input?.stripes === "boolean") out.stripes = input.stripes;
  return out;
}

function renderCoats() {
  const host = document.getElementById("coats");
  if (!host) return;
  host.innerHTML = "";
  const entries = Object.entries(COATS);
  if (CFG.customCoat) entries.push(["custom", Object.assign({}, CFG.customCoat, { name: "照片定制" })]);
  const hex = n => "#" + (n >>> 0).toString(16).padStart(6, "0");
  for (const [id, c] of entries) {
    const d = document.createElement("div");
    d.className = "coat"; d.dataset.coat = id; d.title = c.name;
    // Tauri 注入的 CSP nonce 会让 WebView2 忽略运行时内联 style 属性，
    // 因此色块改用 canvas 绘制（DOM API 不受 style-src-attr 限制）。
    const cv = document.createElement("canvas");
    cv.width = 96; cv.height = 64;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = hex(c.fur); ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.beginPath(); ctx.arc(48, 32, 9, 0, Math.PI*2);
    ctx.fillStyle = hex(c.eye); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.stroke();
    d.appendChild(cv);
    d.onclick = () => { CFG.coat = id; saveCfg(); applyCoat(); };
    host.appendChild(d);
  }
}

function applyRemoteCoat(payload) {
  const palette = normalizeCoat(payload);
  CFG.customCoat = palette;
  CFG.coat = "custom";
  saveCfg();
  renderCoats();
  applyCoat();
  chirp();
  S.lastAct = performance.now(); wake();
  showToast(`已换上新配色：${palette.name}`);
  const st = document.getElementById("status");
  if (st) st.textContent = `MCP 配色已应用：${palette.name}`;
  return palette;
}
window.__pawpalApplyCoat = applyRemoteCoat; // 便于自动化验证与调试
// 合规：外部配色/造型统一走「配置文件 → config-changed 进程内事件」通道，
// 不再有 coat-update / look-update / HTTP 控制端点。

/* ============ 按照片生成相似小猫（本机分析） ============ */
function hueOf(c) {
  const r=c.r/255, g=c.g/255, b=c.b/255;
  const mx=Math.max(r,g,b), mn=Math.min(r,g,b), d=mx-mn;
  if (!d) return 0;
  let h = mx===r ? ((g-b)/d)%6 : mx===g ? (b-r)/d+2 : (r-g)/d+4;
  h *= 60;
  return h < 0 ? h+360 : h;
}

function analyzeImageToCat(img, name) {
  const size = 96;
  const tmp = document.createElement("canvas");
  tmp.width = tmp.height = size;
  const ctx = tmp.getContext("2d", { willReadFrequently:true });
  const side = Math.min(img.width, img.height);
  ctx.drawImage(img, (img.width-side)/2, (img.height-side)/2, side, side, 0, 0, size, size);
  const px = ctx.getImageData(0, 0, size, size).data;

  const buckets = new Map();
  for (let i=0;i<px.length;i+=4) {
    if (px[i+3] < 128) continue;
    const r=px[i], g=px[i+1], b=px[i+2];
    const lum=(r*299+g*587+b*114)/1000;
    if (lum < 24 || lum > 246) continue;
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b);
    if (mx && (mx-mn)/mx < 0.10) continue;
    const key = `${r>>4},${g>>4},${b>>4}`;
    const e = buckets.get(key) || { r:0, g:0, b:0, n:0 };
    e.r+=r; e.g+=g; e.b+=b; e.n++; buckets.set(key, e);
  }
  const sorted = [...buckets.values()]
    .map(e => ({ r:e.r/e.n, g:e.g/e.n, b:e.b/e.n, n:e.n }))
    .sort((a,b) => b.n-a.n);
  if (!sorted.length) throw new Error("图片里没有足够的彩色像素，换一张试试");
  const picked = [];
  for (const c of sorted) {
    if (picked.every(p => Math.hypot(p.r-c.r, p.g-c.g, p.b-c.b) > 58)) picked.push(c);
    if (picked.length >= 4) break;
  }

  const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
  const hex = c => "#" + [c.r,c.g,c.b].map(v => clamp(v).toString(16).padStart(2,"0")).join("").toUpperCase();
  const mix = (a,b,t) => ({ r:a.r*(1-t)+b.r*t, g:a.g*(1-t)+b.g*t, b:a.b*(1-t)+b.b*t });
  const dist = (a,b) => Math.hypot(a.r-b.r, a.g-b.g, a.b-b.b);
  const fur = mix(picked[0], {r:255,g:255,b:255}, 0.06);
  const brightness = (fur.r*299+fur.g*587+fur.b*114)/1000;
  const second = picked[1];

  let eye;
  const h2 = second ? hueOf(second) : -1;
  if (second && h2 >= 35 && h2 <= 190 && Math.max(second.r,second.g,second.b) > 90) eye = mix(second,{r:255,g:255,b:255},0.1);
  else eye = hueOf(fur) < 70 || hueOf(fur) > 320 ? {r:0x4e,g:0x8e,b:0x5b} : {r:0xf2,g:0xc1,b:0x4e};

  const variation = second ? dist(picked[0], second) : 0;
  const palette = {
    name: String(name || "图片同款").slice(0,24),
    fur: hex(fur),
    shade: hex(mix(fur,{r:0,g:0,b:0},0.22)),
    light: hex(mix(fur,{r:255,g:255,b:255},0.24)),
    belly: hex(mix(fur,{r:255,g:255,b:255},0.72)),
    ear: hex(mix(fur,{r:240,g:160,b:170},0.78)),
    eye: hex(eye),
    eye2: picked[2] ? hex(mix(picked[2],{r:255,g:255,b:255},0.12)) : undefined,
    line: hex(mix(fur,{r:0,g:0,b:0},0.48)),
    patches: picked.slice(1,3).map(hex),
  };

  let pattern = "none";
  if (picked.length >= 3 && dist(picked[0], picked[2]) > 95) pattern = "calico";
  else if (variation > 72) pattern = "tabby";

  const look = {
    ear: brightness > 195 ? "round" : "pointy",
    eye: picked.length >= 3 ? "hetero" : "round",
    tail: brightness < 100 ? "fluffy" : "curved",
    body: "normal",
    headScale: brightness > 210 ? 1.06 : 1,
    accessory: "none",
    accColor: second ? hex(second) : "#E86E82",
    pattern,
    patternSeed: Math.floor(brightness*17 + hueOf(fur)*3) % 9999,
  };
  return { palette, look, dominant: picked.slice(0,3).map(hex), brightness };
}
window.__pawpalAnalyzeImage = analyzeImageToCat;

const IMAGE_INFO_DEFAULT = "选择一张 PNG/JPEG，或把图片拖到桌宠上。只在本机取色分析。";
let uploadedImageUrl = null;

// 移除已上传图片：撤销预览 URL、清空文件框，并把毛色+造型恢复为默认小猫。
function clearUploadedImage(silent = false) {
  if (uploadedImageUrl) { URL.revokeObjectURL(uploadedImageUrl); uploadedImageUrl = null; }
  const input = document.getElementById("cat-image");
  if (input) input.value = "";
  const preview = document.getElementById("cat-preview");
  if (preview) { preview.removeAttribute("src"); preview.classList.remove("show"); }
  const clearBtn = document.getElementById("btn-image-clear");
  if (clearBtn) clearBtn.disabled = true;
  const info = document.getElementById("image-info");
  if (info) info.textContent = IMAGE_INFO_DEFAULT;
  delete CFG.customCoat;
  CFG.coat = DEFAULT.coat;
  saveCfg();
  renderCoats();
  applyCoat();
  applyLook(DEFAULT_LOOK, true);
  if (!silent) showToast("已移除图片，小猫恢复默认");
}

function handleImageFile(file) {
  if (!file || !file.type.startsWith("image/")) { showToast("请选择 PNG 或 JPEG 图片"); return; }
  const info = document.getElementById("image-info");
  if (info) info.textContent = "正在分析图片…";
  if (uploadedImageUrl) URL.revokeObjectURL(uploadedImageUrl);
  const url = URL.createObjectURL(file);
  uploadedImageUrl = url;
  const img = new Image();
  img.onload = () => {
    try {
      const preview = document.getElementById("cat-preview");
      if (preview) { preview.src = url; preview.classList.add("show"); }
      const clearBtn = document.getElementById("btn-image-clear");
      if (clearBtn) clearBtn.disabled = false;
      const result = analyzeImageToCat(img, file.name.replace(/\.[^.]+$/, "") + " 同款");
      applyRemoteCoat(result.palette);
      applyLook(result.look);
      // 用 DOM 节点构造，避免文件名等外部数据被当成 HTML 解析
      if (info) {
        info.replaceChildren(
          document.createTextNode(`已生成：${result.palette.name}`),
          document.createElement("br"),
          document.createTextNode(`主色 ${result.dominant.join(" ")}`),
        );
      }
      showToast(`已按照片生成小猫：${result.palette.name}`);
    } catch (e) {
      if (info) info.textContent = "生成失败：" + e.message;
      showToast("图片分析失败");
      clearUploadedImage(true);
    }
  };
  img.onerror = () => { if (info) info.textContent = "图片读取失败"; clearUploadedImage(true); };
  img.src = url;
}

// 启动时/外部配置同步后：旧配置里若带照片配色，仍提供“移除图片”入口
function syncImageUIState() {
  const clearBtn = document.getElementById("btn-image-clear");
  if (clearBtn) clearBtn.disabled = !CFG.customCoat;
  const info = document.getElementById("image-info");
  if (!info) return;
  if (CFG.customCoat) info.textContent = `当前使用照片配色「${CFG.customCoat.name || "照片定制"}」（原图不保存），点上方按钮可移除并恢复默认`;
  else info.textContent = IMAGE_INFO_DEFAULT;
}

// 合规：无端口、无网络。MCP 通过单一配置文件 + 进程内事件热更新。
async function refreshMcpStatus() {
  const el = document.getElementById("mcp-status");
  if (!el) return;
  try {
    const p = await invoke("get_config_path");
    el.textContent = p ? `配置文件通道就绪` : "浏览器模式不可用";
  } catch (e) {
    el.textContent = "浏览器模式不可用";
  }
}
setTimeout(refreshMcpStatus, 600);

function showToast(text) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    document.getElementById("ui")?.appendChild(el);
  }
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}

function keyIndex(code, side) {
  if (!keyMeshes.length) return -1;
  const mid = Math.floor(keyMeshes.length/2);
  if (CFG.privacy) {
    return side === "L"
      ? Math.floor(Math.random()*mid)
      : mid + Math.floor(Math.random()*(keyMeshes.length-mid));
  }
  const map = { Q:4,W:5,E:6,R:7,T:8,Y:9,U:10,I:11,O:12,P:13,A:20,S:21,D:22,F:23,G:24,H:25,J:26,K:27,L:28,Z:36,X:37,C:38,V:39,B:40,N:41,M:42 };
  const ch = (code||"").replace("Key","").toUpperCase();
  if (map[ch] !== undefined) return Math.min(map[ch], keyMeshes.length-1);
  let h = 0;
  for (const c of String(code||"")) h = (h*31 + c.charCodeAt(0)) % keyMeshes.length;
  return h;
}

function lightKey(code, side, idx) {
  if (idx < 0) return;
  const k = keyMeshes[idx];
  if (!k) return;
  k.material.emissive = new THREE.Color(currentCoat().eye);
  k.material.emissiveIntensity = 1.1;
  k.material.color.setHex(0xffffff);
  k.userData.press = 1;
  clearTimeout(k.userData.resetTimer);
  k.userData.resetTimer = setTimeout(()=>{
    if (k.material) { k.material.emissiveIntensity = 0; k.material.color.setHex(0x6b6573); }
  }, 320);
}

function pressKey(code, side, label) {
  const now = performance.now();
  if (side === "L") S.pawL = 1; else S.pawR = 1;
  S.flash = { key:code, side, t:now };
  S.lastAct = now;
  S.lastKey = now;
  S.typing = 1; // 打字活跃：眼睛看键盘、身体前倾、暂停鼠标跟随
  wake();
  const idx = keyIndex(code, side);
  lightKey(code, side, idx);
  // 隐私模式下只弹圆点，不显示真实字符
  spawnSymbol(side, CFG.privacy ? "•" : symbolLabel(label));
  const k = keyMeshes[idx];
  if (k) {
    keyboard.updateWorldMatrix(true, false);
    cat.updateWorldMatrix(true, false);
    const target = k.getWorldPosition(new THREE.Vector3());
    cat.worldToLocal(target);
    target.y += 0.1;
    S.pawTarget[side] = target;
  }
}
window.__pawpalPressKey = pressKey;
// 只读调试接口：暴露当前动画状态，便于自动化验证（无副作用）
window.__pawpalDebug = () => ({
  headPitch: headGroup.rotation.x,
  headYaw: headGroup.rotation.y,
  bodyLean: cat.rotation.x,
  eyeX: S.eyeX, eyeY: S.eyeY,
  eyeStyleClosed,
  eyesVisible: eyes.map(e=>e.group.visible),
  arcsVisible: eyes.map(e=>e.closedArc.visible),
  typing: S.typing,
  popups: keyPopups.length,
  popupY: keyPopups.length ? keyPopups[0].mesh.position.y : null,
  sleeping: S.sleeping,
});

function wake() {
  if (S.sleeping) {
    S.sleeping = false;
    stopPurr();
  }
}

/* ---------- 音频 ---------- */
let AC=null, purrNode=null, purrGain=null;
function ensureAudio(){ if(!AC) AC=new (window.AudioContext||window.webkitAudioContext)(); if(AC.state==="suspended") AC.resume(); }
function startPurr(){
  if(!CFG.purr || purrNode) return;
  ensureAudio();
  const osc=AC.createOscillator(); osc.type="sawtooth"; osc.frequency.value=26;
  const lfo=AC.createOscillator(); lfo.type="sine"; lfo.frequency.value=23;
  const lg=AC.createGain(); lg.gain.value=0.055;
  const filt=AC.createBiquadFilter(); filt.type="lowpass"; filt.frequency.value=170;
  const g=AC.createGain(); g.gain.value=0;
  lfo.connect(lg); lg.connect(g.gain);
  osc.connect(filt); filt.connect(g); g.connect(AC.destination);
  osc.start(); lfo.start();
  purrNode={osc,lfo}; purrGain=g;
  g.gain.setTargetAtTime(0.075,AC.currentTime,0.25);
}
function stopPurr(){
  if(!purrNode) return;
  const g=purrGain, n=purrNode; purrNode=null; purrGain=null;
  g.gain.setTargetAtTime(0,AC.currentTime,0.12);
  setTimeout(()=>{try{n.osc.stop();n.lfo.stop();}catch(e){}},600);
}
function chirp(){
  if(!CFG.purr) return;
  ensureAudio();
  const o=AC.createOscillator(), g=AC.createGain();
  o.type="sine"; o.frequency.setValueAtTime(520,AC.currentTime);
  o.frequency.exponentialRampToValueAtTime(880,AC.currentTime+0.08);
  o.frequency.exponentialRampToValueAtTime(430,AC.currentTime+0.2);
  g.gain.setValueAtTime(0.0001,AC.currentTime);
  g.gain.exponentialRampToValueAtTime(0.05,AC.currentTime+0.02);
  g.gain.exponentialRampToValueAtTime(0.0001,AC.currentTime+0.24);
  o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime+0.26);
}

/* ============ 输入：窗口内 DOM 事件 + 全局键盘跟随 ============ */
// 全局跟随由 Rust 端 rdev（WH_KEYBOARD_LL）提供，只传键位标识不记录文本。
// 窗口聚焦时 Rust 端会跳过全局事件；这里再做一次时间去重，双保险避免重复弹字。
const isTauri = !!window.__TAURI_INTERNALS__;
let lastLocalKey = { code:"", t:0 };
window.addEventListener("keydown", e=>{
  if (e.repeat) return;
  const left = "`12345qwertasdfgzxcvb".includes(e.key.toLowerCase());
  lastLocalKey = { code:e.code, t:performance.now() };
  pressKey(e.code, left?"L":"R", e.key);
});
listen("global-key", ({ payload })=>{
  if (!CFG.globalKeys) return;
  const { code, side, label } = payload || {};
  // 120ms 内窗口内已处理过同一键 → 跳过
  if (code && code === lastLocalKey.code && performance.now() - lastLocalKey.t < 120) return;
  pressKey(code, side, label);
}).catch(()=>{});
window.addEventListener("mousemove", e=>{ S.mouseX=e.clientX; S.mouseY=e.clientY; S.lastAct=performance.now(); wake(); });
window.addEventListener("wheel", e=>{
  // Ctrl/⌘ + 滚轮：缩放宠物窗口；普通滚轮仍是唤醒猫
  if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomPet(e.deltaY < 0 ? 10 : -10); return; }
  S.scroll=1; S.lastAct=performance.now(); wake();
}, { passive:false });

// 摸猫：在画布上按下鼠标靠近头部
canvas.addEventListener("mousedown", e=>{
  const nx = (e.clientX/innerWidth - 0.5)*2;
  const ny = (e.clientY/innerHeight - 0.42)*2;
  if (Math.hypot(nx, ny) < 0.42) {
    S.petting = true; startPurr(); chirp(); S.lastAct=performance.now(); wake();
  } else if (isTauri) {
    invoke("start_drag").catch(()=>{});
  }
});
window.addEventListener("mouseup", ()=>{
  if (S.petting){ S.petting=false; stopPurr(); }
});
canvas.addEventListener("contextmenu", e=>{ e.preventDefault(); togglePanel(true); });

/* ============ 动画循环 ============ */
let last = performance.now();
function frame(now){
  const dt = Math.min(now-last, 60); last=now; S.t=now;

  S.pawL = Math.max(0, S.pawL - dt/170);
  S.pawR = Math.max(0, S.pawR - dt/170);
  S.scroll = Math.max(0, S.scroll - dt/450);
  S.yawn = Math.max(0, S.yawn - dt/500);
  S.typing = Math.max(0, S.typing - dt/700); // 停打 0.7s 后恢复鼠标跟随

  // 键帽被按下后下沉，再回弹
  keyMeshes.forEach(k=>{
    const v = k.userData.press || 0;
    if (v > 0) {
      const nv = Math.max(0, v - dt/220);
      k.userData.press = nv;
      k.position.y = k.userData.baseY - 0.09*nv;
    } else if (k.position.y !== k.userData.baseY) {
      k.position.y = k.userData.baseY;
    }
  });
  // 键帽在猫咪身旁做抛物跳跃：横向漂移 + 竖直上抛下落 + 轻微旋转
  keyPopups.forEach(p=>{
    p.life -= dt/1300;
    p.sec += dt/1000;
    const s = p.sec;
    p.mesh.position.x = p.x0 + p.vx*s;
    p.mesh.position.y = p.y0 + p.vy*s - 4.2*s*s; // g≈8.4，约 0.8s 落回
    p.mesh.material.rotation = p.spin*Math.sin(s*5);
    const pop = Math.min(1, (1-p.life)*9);
    p.mesh.scale.set(0.62*pop, 0.54*pop, 1);
    p.mesh.material.opacity = Math.max(0, Math.min(1, p.life*2.4));
  });
  for (let i=keyPopups.length-1;i>=0;i--){
    if (keyPopups[i].life <= 0){
      const p = keyPopups[i];
      popupsGroup.remove(p.mesh);
      p.mesh.material.dispose();
      keyPopups.splice(i,1);
    }
  }

  if (now>S.nextBlink){ S.blink=1; S.nextBlink=now+1800+Math.random()*3000; }
  if (S.blink>0) S.blink=Math.max(0, S.blink-dt/150);

  if (!S.sleeping && now-S.lastAct>CFG.sleep){
    S.sleeping=true;
    if (CFG.sleeppurr && CFG.purr) startPurr();
  }
  if (CFG.idle && !S.sleeping && now>S.nextIdle){
    S.yawn=1; S.nextIdle=now+4000+Math.random()*6000;
  }
  if (S.demo){
    S.demoTimer-=dt;
    if (S.demoTimer<=0){
      S.demoTimer=90+Math.random()*160;
      const demoKey = Math.random()<0.5 ? "KeyA" : "KeyL";
      pressKey(demoKey, Math.random()<0.5?"L":"R", demoKey === "KeyA" ? "a" : "l");
    }
  }

  // 鼠标跟随（屏幕 Y 向下为正）；打字时用键盘目标覆盖，暂停鼠标跟随
  const act = S.typing; // 0=平时跟随鼠标，1=正在打字看键盘
  const mx = THREE.MathUtils.clamp(S.mouseX? (S.mouseX/innerWidth-0.5)*2 : 0, -1, 1);
  const my = THREE.MathUtils.clamp(S.mouseY? (S.mouseY/innerHeight-0.5)*2 : 0, -1, 1);
  const keySide = S.flash.side === "L" ? -1 : 1;
  const targetX = THREE.MathUtils.lerp(mx, keySide*0.12, act);
  const targetY = THREE.MathUtils.lerp(my, 0.95, act); // 向下看向键盘
  S.eyeX += (targetX-S.eyeX)*Math.min(1,dt/120);
  S.eyeY += (targetY-S.eyeY)*Math.min(1,dt/120);

  // 呼吸 / 头部
  cat.scale.y = 1 + Math.sin(now/900)*0.012;
  // 打字时身体前倾向键盘，停打后回正
  const lean = act*0.16;
  cat.rotation.x += (lean - cat.rotation.x)*Math.min(1,dt/200);
  headGroup.rotation.y += (S.eyeX*0.22 - headGroup.rotation.y)*Math.min(1,dt/180);
  // 修正：绕 X 正旋转=低头。鼠标向下(my>0)应低头，故用 +S.eyeY；打字时叠加俯身看键盘
  const pitch = THREE.MathUtils.lerp(S.eyeY*0.14, 0.36, act);
  headGroup.rotation.x += (pitch - headGroup.rotation.x)*Math.min(1,dt/180);
  headGroup.rotation.z = Math.sin(now/2600)*0.02;

  // 眼睛：眯眼造型 / 睡觉 / 眨眼 / 摸头享受时都闭合成弯月弧线（不再压扁眼球）
  const enjoying = S.petting && !S.sleeping;
  const closed = eyeStyleClosed || S.sleeping || S.blink>0 || enjoying;
  eyes.forEach(e=>{
    e.group.visible = !closed;
    e.closedArc.visible = closed;
    e.iris.position.x = S.eyeX*0.06;
    e.iris.position.y = -S.eyeY*0.04;
    e.pupil.position.x = S.eyeX*0.07;
    e.pupil.position.y = -S.eyeY*0.05;
  });
  happyFace.visible = enjoying;
  if (enjoying) tongue.position.y = -0.42 + Math.sin(now/220)*0.012;
  blushL.material.opacity = S.petting ? 0.9 : 0.55;
  blushR.material.opacity = blushL.material.opacity;

  // 爪子：打字时移到被敲的键位上方，停止后回到胸前
  paws.forEach(p=>{
    const side = p.sign<0 ? "L" : "R";
    const lift = p.sign<0 ? S.pawL : S.pawR;
    const target = (!S.sleeping && now - S.lastKey < 1100) ? S.pawTarget[side] : null;
    const k = Math.min(1, dt/90);
    if (target) {
      p.group.position.x += (target.x - p.group.position.x)*k;
      p.group.position.y += (target.y - p.group.position.y)*k;
      p.group.position.z += (target.z - p.group.position.z)*k;
    } else {
      p.group.position.x += (p.baseX - p.group.position.x)*k;
      p.group.position.y += (p.baseY - p.group.position.y)*k;
      p.group.position.z += (p.baseZ - p.group.position.z)*k;
    }
    p.group.rotation.x = -lift*0.3;
  });

  // 尾巴摆动
  tailGroup.rotation.y = Math.sin(now/(CFG.idle?520:1200))*(CFG.idle?0.28:0.1);
  tailGroup.rotation.z = Math.sin(now/780)*0.06;

  // 迷你鼠标眼睛
  mEyeL.position.x = -0.17 + S.eyeX*0.04;
  mEyeR.position.x = 0.17 + S.eyeX*0.04;
  wheel.position.z = -0.1 + Math.sin(now/120)*S.scroll*0.06;

  // Zzz（睡觉冒字用小球代替，避免字体纹理开销）
  if (S.sleeping && Math.floor(now/700)!==Math.floor((now-dt)/700)) {
    const z = sphere(0.07, mat(0x7b6cf6,{transparent:true,opacity:0.8}),12);
    z.position.set(1.2+Math.random()*0.3, 2.8, 0.4);
    root.add(z);
    S.zzz.push({mesh:z,life:1});
  }
  S.zzz.forEach(p=>{ p.mesh.position.y += dt*0.0009; p.life-=dt/2600; p.mesh.material.opacity=Math.max(0,p.life)*0.8; });
  S.zzz = S.zzz.filter(p=>{ if(p.life<=0){root.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();return false;} return true; });

  // 摸猫爱心
  if (S.petting && Math.floor(now/380)!==Math.floor((now-dt)/380)) {
    const h = sphere(0.09, mat(0xE86E82,{transparent:true,opacity:0.9}),12);
    h.position.set((Math.random()-0.5)*1.0, 2.9, 0.6);
    root.add(h);
    S.hearts.push({mesh:h,life:1});
  }
  S.hearts.forEach(p=>{ p.mesh.position.y += dt*0.0007; p.life-=dt/1200; p.mesh.material.opacity=Math.max(0,p.life)*0.9; });
  S.hearts = S.hearts.filter(p=>{ if(p.life<=0){root.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();return false;} return true; });

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.addEventListener("resize", ()=>{
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
});

/* ============ UI ============ */
const $ = id=>document.getElementById(id);
const settings = $("settings"), toolbar = $("toolbar");
function togglePanel(force){ const open = force===undefined ? !settings.classList.contains("open") : force; settings.classList.toggle("open", open); }
toolbar.classList.add("show");

// 设置面板双标签：外观 / 键盘与系统
function switchTab(name){
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active", b.dataset.tab===name));
  document.querySelectorAll(".pane").forEach(p=>p.classList.toggle("active", p.id===`pane-${name}`));
}
document.querySelectorAll(".tab").forEach(b=>{ b.onclick = ()=>switchTab(b.dataset.tab); });

$("btn-set").onclick = ()=>togglePanel();
$("btn-close").onclick = ()=>togglePanel(false);
$("btn-demo").onclick = e=>{
  S.demo=!S.demo; e.target.textContent=S.demo?"停止":"演示";
  e.target.classList.toggle("on", S.demo);
};
// 窗口缩放：以 760x560 为 100%，保持窗口中心不变
const BASE_W = 760, BASE_H = 560;
function applyWindowSize() {
  const w = Math.round(BASE_W * CFG.size / 100);
  const h = Math.round(BASE_H * CFG.size / 100);
  invoke("set_pet_size", { width:w, height:h }).catch(()=>{});
}
function zoomPet(step) {
  const next = THREE.MathUtils.clamp(Math.round(CFG.size + step), 60, 160);
  if (next === CFG.size) return;
  CFG.size = next; saveCfg(); applyWindowSize(); syncUI();
  showToast(`窗口大小 ${next}%`);
}
$("btn-zoom-in").onclick = ()=>zoomPet(10);
$("btn-zoom-out").onclick = ()=>zoomPet(-10);
$("btn-hide").onclick = ()=>{ invoke("hide_cat").catch(()=>{}); };

listen("open-settings", ()=>togglePanel(true)).catch(()=>{});

// 桌面快捷方式（PawPal --appearance）触发：打开面板并定位到外观编辑器
function openAppearanceEditor(){
  switchTab("appearance");
  togglePanel(true);
  requestAnimationFrame(()=>{
    const grp = $("appearance-grp");
    if (!grp) return;
    grp.scrollIntoView({behavior:"smooth", block:"start"});
    grp.classList.add("flash");
    clearTimeout(window.__appearanceFlash);
    window.__appearanceFlash = setTimeout(()=>grp.classList.remove("flash"), 1800);
  });
}
listen("open-appearance", openAppearanceEditor).catch(()=>{});
// 浏览器调试：index.html?appearance=1 也能直接打开
if (new URLSearchParams(location.search).has("appearance")) setTimeout(openAppearanceEditor, 400);

renderCoats();

/* 外观编辑器 UI */
const LOOK_SEG_MAP = {
  "look-ear":"ear", "look-eye":"eye", "look-tail":"tail",
  "look-body":"body", "look-pattern":"pattern", "look-accessory":"accessory",
};
function syncLookUI() {
  for (const [id, key] of Object.entries(LOOK_SEG_MAP)) {
    const el = $(id); if (!el) continue;
    el.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.v === CFG.look[key]));
  }
  const head = $("look-head"); if (head) head.value = Math.round(CFG.look.headScale*100);
  const acc = $("look-acccolor"); if (acc) acc.value = "#" + CFG.look.accColor.toString(16).padStart(6,"0");
}
function setupLookUI() {
  for (const [id, key] of Object.entries(LOOK_SEG_MAP)) {
    const el = $(id); if (!el) continue;
    el.querySelectorAll("button").forEach(b => { b.onclick = () => applyLook({ [key]: b.dataset.v }); });
  }
  const head = $("look-head");
  if (head) head.oninput = e => applyLook({ headScale: Number(e.target.value)/100 }, true);
  const acc = $("look-acccolor");
  if (acc) acc.oninput = e => applyLook({ accColor: e.target.value }, true);
  const file = $("cat-image");
  if (file) file.onchange = () => { if (file.files?.[0]) handleImageFile(file.files[0]); };
  const clearBtn = $("btn-image-clear");
  if (clearBtn) clearBtn.onclick = () => clearUploadedImage();
  const rnd = $("btn-random");
  if (rnd) rnd.onclick = randomLook;
  const reset = $("btn-look-reset");
  if (reset) reset.onclick = () => { applyLook(DEFAULT_LOOK); showToast("造型已恢复默认"); };
  canvas.addEventListener("dragover", e => e.preventDefault());
  canvas.addEventListener("drop", e => {
    e.preventDefault();
    if (e.dataTransfer?.files?.[0]) handleImageFile(e.dataTransfer.files[0]);
  });
}
function randomLook() {
  const pick = a => a[Math.floor(Math.random()*a.length)];
  applyLook({
    ear: pick(["pointy","round","fold","tufted"]),
    eye: pick(["round","sleepy","hetero"]),
    tail: pick(["curved","short","fluffy","curled"]),
    body: pick(["slim","normal","chubby"]),
    pattern: pick(["none","tabby","tuxedo","calico","patches"]),
    accessory: pick(["none","bowtie","scarf","hat","collar"]),
    accColor: pick([0xE86E82,0x7B6CF6,0x4FA9D6,0xF2C14E,0x5EBD8C]),
    headScale: 0.92 + Math.random()*0.22,
    patternSeed: Math.floor(Math.random()*9999),
  });
  showToast("随机生成了一只新小猫");
}

function seg(id, val, key, num){
  const el=$(id);
  el.querySelectorAll("button").forEach(b=>{
    b.classList.toggle("on", String(b.dataset.v)===String(val));
    b.onclick=()=>{ CFG[key]=num?Number(b.dataset.v):b.dataset.v; saveCfg(); seg(id,CFG[key],key,num); if(key==="layout") buildKeys(CFG.layout); };
  });
}
function sw(id, key, cb){
  const el=$(id);
  el.classList.toggle("on", !!CFG[key]);
  el.onclick=()=>{ CFG[key]=!CFG[key]; saveCfg(); sw(id,key,cb); if(cb)cb(CFG[key]); };
}
function syncUI(){
  seg("layout",CFG.layout,"layout",true);
  seg("sleep",CFG.sleep,"sleep",true);
  sw("sw-purr","purr",v=>{if(!v)stopPurr();});
  sw("sw-sleeppurr","sleeppurr");
  sw("sw-idle","idle");
  sw("sw-privacy","privacy");
  sw("sw-globalkeys","globalKeys",v=>invoke("set_global_keys",{enable:v}).catch(()=>{}));
  sw("sw-top","top",v=>invoke("set_topmost",{enable:v}).catch(()=>{}));
  sw("sw-remind","remind",setupReminder);
  $("size").value=CFG.size;
  $("rm-min").value=CFG.rmMin;
  $("rm-text").value=CFG.rmText;
  applyCoat();
}
$("size").oninput=e=>{ CFG.size=Number(e.target.value); saveCfg(); applyWindowSize(); };
$("rm-min").onchange=e=>{ CFG.rmMin=Math.max(1,Number(e.target.value)||45); saveCfg(); setupReminder(); };
$("rm-text").onchange=e=>{ CFG.rmText=e.target.value||"该起来活动一下啦"; saveCfg(); };
$("btn-reset").onclick=()=>{
  if (uploadedImageUrl) { URL.revokeObjectURL(uploadedImageUrl); uploadedImageUrl = null; }
  const preview = $("cat-preview"); if (preview) { preview.removeAttribute("src"); preview.classList.remove("show"); }
  const file = $("cat-image"); if (file) file.value = "";
  const clearBtn = $("btn-image-clear"); if (clearBtn) clearBtn.disabled = true;
  const info = $("image-info"); if (info) info.textContent = IMAGE_INFO_DEFAULT;
  CFG = Object.assign({}, DEFAULT, { look: Object.assign({}, DEFAULT_LOOK) });
  saveCfg(); setupReminder(); renderCoats(); syncUI(); applyLook(DEFAULT_LOOK, true); applyWindowSize();
  showToast("已恢复默认设置");
};

let remindTimer=null;
function setupReminder(){
  if(remindTimer){clearInterval(remindTimer);remindTimer=null;}
  if(CFG.remind && "speechSynthesis" in window){
    remindTimer=setInterval(()=>{
      const u=new SpeechSynthesisUtterance(CFG.rmText);
      u.lang="zh-CN"; u.rate=0.92; speechSynthesis.speak(u);
    }, CFG.rmMin*60*1000);
  }
}

/* ============ 启动与热加载 ============ */
function applyLoadedConfig() {
  applyWindowSize();
  buildKeys(CFG.layout);
  setupLookUI();
  syncUI();
  applyCoat();
  applyLook(CFG.look, true);
  syncImageUIState();
  setupReminder();
}

// 配置文件被外部（MCP 进程）写入 → Rust 进程内事件 → 这里读取并应用
listen("config-changed", async () => {
  try {
    const text = await invoke("read_config");
    if (!text) return;
    // 自己写入配置也会触发 mtime 事件；内容一致时直接跳过，避免误报“外部配置”
    if (text === JSON.stringify(CFG)) return;
    applyingRemote = true;
    mergeConfig(JSON.parse(text));
    applyLoadedConfig();
    showToast("已同步外部配置");
    applyingRemote = false;
  } catch (e) {
    applyingRemote = false;
  }
}).catch(()=>{});

// 先按默认配置完成场景初始化，但此轮禁止写盘——否则会在 initConfig() 读取前
// 把用户已有配置覆盖成默认值（表现为重启后造型/毛色丢失）。
applyingRemote = true;
applyLoadedConfig();
applyingRemote = false;
initConfig().then(() => {
  applyLoadedConfig();
  setupReminder();
  invoke("set_global_keys",{enable:!!CFG.globalKeys}).catch(()=>{});
  if (CFG.top) invoke("set_topmost",{enable:true}).catch(()=>{});
});
