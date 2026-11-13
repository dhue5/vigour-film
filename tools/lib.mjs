/* ============================================================
   公共模块：路径、默认站点信息、数据生成
   数据源：data/works.json  →  生成：data/works-data.js
   （浏览器不读 JSON，因此双击 index.html 也能正常打开）
   ============================================================ */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const DATA_JSON = path.join(ROOT, 'data', 'works.json');
export const DATA_JS = path.join(ROOT, 'data', 'works-data.js');
export const INBOX = path.join(ROOT, '待导入');
export const MEDIA = {
  video: path.join(ROOT, 'media', 'video'),
  preview: path.join(ROOT, 'media', 'preview'),
  poster: path.join(ROOT, 'media', 'poster'),
  thumb: path.join(ROOT, 'media', 'thumb'),
  image: path.join(ROOT, 'media', 'image'),
};

export const DEFAULT_SITE = {
  name: '王歌词',
  nameEn: 'WANG GECI',
  title: 'VIGOUR FILM',
  role: '独立导演 / 影像作者',
  intro:
    '以「时间 × 情绪」为母题，在有限的片长里完成一次完整的情绪转弯。这里收录近年完成的广告、短片与实验影像作品。',
  email: 'vigourfilm@163.com',
  location: '中国 · 杭州',
};

export async function readWorks() {
  try {
    const raw = await fsp.readFile(DATA_JSON, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.works)) data.works = [];
    if (!data.site) data.site = { ...DEFAULT_SITE };
    return data;
  } catch {
    return { site: { ...DEFAULT_SITE }, works: [] };
  }
}

/* 作品按名称排序（自然数序：广告片 2 排在 广告片 10 之前；
   同名称按创建时间，再按 id，保持稳定） */
export function sortWorks(data) {
  data.works.sort((a, b) => {
    const ta = String((a && a.title) || '');
    const tb = String((b && b.title) || '');
    if (ta !== tb) {
      try {
        return ta.localeCompare(tb, 'zh-CN', { numeric: true, sensitivity: 'base' });
      } catch {
        return ta < tb ? -1 : 1;
      }
    }
    return (a.created || '').localeCompare(b.created || '') || a.id.localeCompare(b.id);
  });
  return data;
}

export async function writeWorks(data) {
  await fsp.mkdir(path.dirname(DATA_JSON), { recursive: true });
  sortWorks(data);
  await fsp.writeFile(DATA_JSON, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/* 生成浏览器可直接加载的经典脚本（避免 file:// 下 fetch/CORS 限制） */
export async function buildData() {
  const data = sortWorks(await readWorks());
  const banner = '/* 自动生成，请勿直接修改本文件。数据源：data/works.json */\n';
  const js = banner + 'window.PORTFOLIO = ' + JSON.stringify(data, null, 2) + ';\n';
  await fsp.mkdir(path.dirname(DATA_JS), { recursive: true });
  await fsp.writeFile(DATA_JS, js, 'utf8');
  return data;
}

export function ensureDirs() {
  for (const dir of Object.values(MEDIA)) fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(INBOX, { recursive: true });
}

export const fmtSize = (n) =>
  n >= 1e9 ? (n / 1e9).toFixed(2) + ' GB' : n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB' : (n / 1e3).toFixed(0) + ' KB';

export const fmtDur = (s) => {
  const sec = Math.round(s);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};
