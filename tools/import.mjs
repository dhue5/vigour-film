#!/usr/bin/env node
/* ============================================================
   作品导入工具
   ------------------------------------------------------------
   用法：把视频 / 图片放进「待导入」文件夹，双击「导入新作品.bat」
   自动完成：转码为网页可播放的 MP4 → 截取封面 → 生成悬停预览
           → 更新 data/works.json 与 data/works-data.js
   支持：mp4 / mov / m4v / mkv / webm / avi / mts …
        图片（同名图片会作为该视频的自定义封面）
   依赖：本机 ffmpeg / ffprobe（PATH 中可用）
   ============================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  ROOT, INBOX, DATA_JSON, MEDIA, ensureDirs, readWorks, writeWorks, buildData, fmtSize, fmtDur,
} from './lib.mjs';

const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi', '.mts', '.m2ts', '.wmv', '.flv', '.ts']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.bmp']);
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || 'ffprobe';

const log = (...a) => console.log(...a);
const line = (s = '') => process.stdout.write(s + '\n');
const clearLine = () => process.stdout.write('\r' + ' '.repeat(72) + '\r');

/* ---------------- 进程工具 ---------------- */
function run(cmd, args, { onLine } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => {
      out += d;
      if (onLine) onLine(d.toString());
    });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) =>
      code === 0 ? resolve({ out, err }) : reject(new Error(`${path.basename(cmd)} 退出码 ${code}\n${err.slice(-3000)}`))
    );
  });
}

async function probe(file) {
  const { out } = await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
  const j = JSON.parse(out);
  const v = (j.streams || []).find((s) => s.codec_type === 'video');
  if (!v) throw new Error('找不到视频流');
  return {
    duration: parseFloat(j.format?.duration || v.duration || 0) || 0,
    width: Number(v.width) || 0,
    height: Number(v.height) || 0,
  };
}

async function probeImage(file) {
  const { out } = await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
  const j = JSON.parse(out);
  const v = (j.streams || []).find((s) => s.codec_type === 'video');
  return { width: Number(v?.width) || 0, height: Number(v?.height) || 0 };
}

/* ---------------- 处理步骤 ---------------- */
async function transcode(input, output, duration, label) {
  let lastPct = -1;
  let lastTick = 0;
  const onLine = (chunk) => {
    let m;
    const re = /out_time_us=(\d+)/g;
    while ((m = re.exec(chunk))) {
      const t = Number(m[1]) / 1e6;
      const pct = duration > 0 ? Math.min(99, Math.floor((t / duration) * 100)) : 0;
      const now = t;
      if (pct >= lastPct + 4 || (pct > 0 && now - lastTick > 12)) {
        lastPct = pct;
        lastTick = now;
        process.stdout.write(`\r  ${label}  转码 ${String(pct).padStart(3)}%   `);
      }
    }
  };
  await run(
    FFMPEG,
    [
      '-hide_banner', '-loglevel', 'error', '-nostats', '-progress', 'pipe:1',
      '-i', input,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', "scale='min(1920,iw)':-2",
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '160k', '-ac', '2',
      '-movflags', '+faststart', '-map_metadata', '-1',
      '-y', output,
    ],
    { onLine }
  );
  clearLine();
}

async function grabPoster(input, t, out, width = 1600) {
  await run(FFMPEG, [
    '-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', input,
    '-frames:v', '1', '-vf', `scale='min(${width},iw)':-2`, '-q:v', '3', '-y', out,
  ]);
}

async function makeThumb(fromImage, out, width = 720) {
  await run(FFMPEG, [
    '-hide_banner', '-loglevel', 'error', '-i', fromImage,
    '-vf', `scale='min(${width},iw)':-2`, '-q:v', '4', '-y', out,
  ]);
}

async function makePreview(input, start, duration, out) {
  const t = Math.max(0, Math.min(start, Math.max(0, duration - 7)));
  const len = Math.min(6, Math.max(2, duration - t));
  await run(FFMPEG, [
    '-hide_banner', '-loglevel', 'error',
    '-ss', String(t), '-t', String(len), '-i', input,
    '-vf', "scale='min(960,iw)':-2",
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27', '-pix_fmt', 'yuv420p',
    '-an', '-movflags', '+faststart', '-y', out,
  ]);
}

/* ---------------- 元信息推导 ---------------- */
const sanitize = (s) => String(s || '').replace(/[\\/:*?"<>|]/g, ' ').trim();

function baseName(file) {
  return path.basename(file, path.extname(file));
}

function defaultTitle(name) {
  // 「广告片1」→「广告片 1」；保留中文原名，仅规整空格
  return sanitize(name).replace(/([一-龥])(\d+)/g, '$1 $2').replace(/\s+/g, ' ');
}

function guessCategory(name) {
  const n = name.toLowerCase();
  if (/广告|商业|tv ?c|commercial|\bad\b|tvc/.test(n)) return '广告片';
  if (/纪录|documentary|docu/.test(n)) return '纪录片';
  if (/短片|short|film/.test(n)) return '短片';
  if (/\bmv\b|音乐|music ?video/.test(n)) return 'MV';
  if (/实验|experimental/.test(n)) return '实验影像';
  return '作品';
}

const idFor = (name, size) => 'w' + crypto.createHash('sha1').update(name + '|' + size).digest('hex').slice(0, 9);

function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join('/');
}

/* ---------------- 主流程 ---------------- */
async function main() {
  ensureDirs();
  if (!fs.existsSync(path.join(INBOX, '放这里.txt'))) {
    fs.writeFileSync(
      path.join(INBOX, '放这里.txt'),
      '把要展示的视频或图片放进这个文件夹，然后回到上一级，双击「导入新作品.bat」。\n' +
        '导入完成后原文件会保留在本文件夹中，重复导入会自动跳过。\n',
      'utf8'
    );
  }

  const data = await readWorks();
  const existing = new Map(); // source.name|size -> work
  for (const w of data.works) {
    if (w.source?.name) existing.set(w.source.name + '|' + w.source.size, w);
  }

  const files = (await fsp.readdir(INBOX, { withFileTypes: true }))
    .filter((d) => d.isFile())
    .map((d) => path.join(INBOX, d.name))
    .filter((f) => !/放这里\.txt$/i.test(f));

  const videos = files.filter((f) => VIDEO_EXT.has(path.extname(f).toLowerCase()));
  const images = files.filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()));
  const others = files.filter((f) => !videos.includes(f) && !images.includes(f));

  log('');
  log('════════════════════════════════════════════');
  log('  VIGOUR FILM · 作品导入');
  log('════════════════════════════════════════════');
  log(`  待导入：视频 ${videos.length} 个，图片 ${images.length} 个`);
  if (others.length) log(`  其他文件 ${others.length} 个（未支持，已忽略）`);
  log('');

  let added = 0;
  let skipped = 0;

  for (const file of videos) {
    const name = path.basename(file);
    const st = await fsp.stat(file);
    const key = name + '|' + st.size;
    if (existing.has(key)) {
      log(`  ↷ 跳过（已导入）：${name}`);
      skipped++;
      continue;
    }

    const base = baseName(file);
    const id = idFor(name, st.size);
    const videoOut = path.join(MEDIA.video, id + '.mp4');
    const [meta] = await Promise.all([probe(file)]);
    log(`  ▶ ${name}  (${fmtSize(st.size)} · ${meta.width}×${meta.height} · ${fmtDur(meta.duration)})`);

    try {
      await transcode(file, videoOut, meta.duration, name);

      const posterAt = Math.max(1.2, Math.min(8, (meta.duration || 10) * 0.32));
      const posterOut = path.join(MEDIA.poster, id + '.jpg');
      const thumbOut = path.join(MEDIA.thumb, id + '.jpg');
      await grabPoster(file, posterAt, posterOut);
      await makeThumb(posterOut, thumbOut);

      const previewOut = path.join(MEDIA.preview, id + '.mp4');
      await makePreview(file, posterAt + 1.5, meta.duration, previewOut);

      const year = String(st.mtime.getFullYear());
      const work = {
        id,
        title: defaultTitle(base),
        titleEn: '',
        category: guessCategory(name),
        year,
        client: '',
        description: '',
        duration: Math.round(meta.duration * 10) / 10,
        width: meta.width,
        height: meta.height,
        video: rel(videoOut),
        preview: rel(previewOut),
        poster: rel(posterOut),
        thumb: rel(thumbOut),
        source: { name, size: st.size },
        created: new Date(st.mtime.getTime() - st.mtime.getTimezoneOffset() * 60000).toISOString().slice(0, 19),
      };
      data.works.push(work);
      existing.set(key, work);
      await writeWorks(data);
      added++;
      log(`    ✓ 完成 → ${id}.mp4`);
    } catch (e) {
      log(`    ✗ 失败：${e.message.split('\n')[0]}`);
    }
  }

  // 图片：同名图片（如 广告片1.png）作为对应视频的自定义封面；否则作为独立图片作品
  for (const file of images) {
    const name = path.basename(file);
    const base = baseName(file).toLowerCase();
    const target = data.works.find(
      (w) => w.video && baseName(w.source?.name || '').toLowerCase() === base
    );
    try {
      if (target) {
        const posterOut = path.join(MEDIA.poster, target.id + '.jpg');
        const thumbOut = path.join(MEDIA.thumb, target.id + '.jpg');
        // 统一转成 jpg 并覆盖自动截取的封面
        await grabPoster(file, 0, posterOut);
        await makeThumb(posterOut, thumbOut);
        target.customPoster = true;
        await writeWorks(data);
        log(`  ✔ 自定义封面：${name} → ${target.title}`);
      } else {
        const st = await fsp.stat(file);
        const id = idFor(name, st.size);
        if (data.works.some((w) => w.id === id)) {
          log(`  ↷ 跳过（已导入）：${name}`);
          skipped++;
          continue;
        }
        const ext = path.extname(file).toLowerCase();
        const imgOut = path.join(MEDIA.image, id + ext);
        await fsp.copyFile(file, imgOut);
        const dim = await probeImage(imgOut);
        const posterOut = path.join(MEDIA.poster, id + '.jpg');
        const thumbOut = path.join(MEDIA.thumb, id + '.jpg');
        await grabPoster(imgOut, 0, posterOut);
        await makeThumb(posterOut, thumbOut);
        const work = {
          id,
          title: defaultTitle(baseName(file)),
          titleEn: '',
          category: '影像',
          year: String(st.mtime.getFullYear()),
          client: '',
          description: '',
          duration: 0,
          width: dim.width,
          height: dim.height,
          video: '',
          preview: '',
          poster: rel(posterOut),
          thumb: rel(thumbOut),
          image: rel(imgOut),
          source: { name, size: st.size },
          created: new Date(st.mtime.getTime() - st.mtime.getTimezoneOffset() * 60000).toISOString().slice(0, 19),
        };
        data.works.push(work);
        await writeWorks(data);
        added++;
        log(`  ✓ 图片作品：${name}`);
      }
    } catch (e) {
      log(`  ✗ 图片处理失败 ${name}：${e.message.split('\n')[0]}`);
    }
  }

  const built = await buildData();
  log('');
  log('────────────────────────────────────────────');
  log(`  完成：新增 ${added} 个，跳过 ${skipped} 个，共 ${built.works.length} 个作品`);
  log(`  数据：${path.relative(ROOT, DATA_JSON)}`);
  log('  现在刷新浏览器即可看到新作品（双击 index.html 或本地预览地址）。');
  log('  想改标题 / 分类：编辑 data/works.json 后双击「重建数据.bat」。');
  log('────────────────────────────────────────────');
  log('');
}

main().catch((e) => {
  console.error('\n导入失败：', e.message);
  process.exitCode = 1;
});
