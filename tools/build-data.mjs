#!/usr/bin/env node
/* 手动重建 data/works-data.js（修改 data/works.json 之后运行） */
import { buildData } from './lib.mjs';

const data = await buildData();
console.log(`已生成 data/works-data.js（${data.works.length} 个作品）`);
