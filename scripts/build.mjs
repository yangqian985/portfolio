// 网站内容.json is the only source for editable portfolio content.
// Node core modules only: no package installation or browser JavaScript needed.
import { readFile, writeFile, mkdir, cp, stat, rm } from 'node:fs/promises';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'dist');
const data = JSON.parse(await readFile(resolve(root, '网站内容.json'), 'utf8'));
const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const text = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) throw Error(`${label} 必须填写文字`);
  return value;
};
const list = (value, label) => {
  if (!Array.isArray(value) || !value.length) throw Error(`${label} 至少需要一项`);
  return value;
};
const local = value => {
  text(value, '文件路径');
  if (/^[a-z]+:|[?#\\]/i.test(value) || value.startsWith('/')) throw Error(`请使用仓库内的相对文件路径：${value}`);
  const path = resolve(root, value);
  const rel = relative(root, path);
  if (rel.startsWith('..' + sep) || rel === '..' || !rel) throw Error(`文件超出网站目录：${value}`);
  return path;
};
const assets = new Set();
async function asset(value) {
  const path = local(value);
  if (!(await stat(path)).isFile()) throw Error(`文件不存在：${value}`);
  assets.add(path);
  return path;
}
async function image(src, alt, priority = false) {
  const path = await asset(src);
  const buf = await readFile(path);
  let width, height;
  if (buf.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    width = buf.readUInt32BE(16); height = buf.readUInt32BE(20);
  } else if (buf[0] === 255 && buf[1] === 216) {
    let offset = 2;
    while (offset < buf.length - 8) {
      if (buf[offset++] !== 255) continue;
      let marker = buf[offset++];
      while (marker === 255) marker = buf[offset++];
      if ([0xd8,0xd9,0x01].includes(marker) || marker >= 0xd0 && marker <= 0xd7) continue;
      if (marker === 0xda) break;
      const size = buf.readUInt16BE(offset);
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
        height = buf.readUInt16BE(offset + 3); width = buf.readUInt16BE(offset + 5); break;
      }
      if (size < 2) break;
      offset += size;
    }
  }
  if (!width || !height) throw Error(`图片请使用有效的 JPG 或 PNG：${src}`);
  return `<img src="${esc(src)}" alt="${esc(text(alt, '图片说明'))}" width="${width}" height="${height}" decoding="async" ${priority ? 'fetchpriority="high"' : 'loading="lazy"'}>`;
}
function render(template, context, sections) {
  return template.replace(/\{\{\{([^{}]+)\}\}\}|\{\{([^{}]+)\}\}/g, (_, raw, key) => {
    if (raw) {
      if (!Object.hasOwn(sections, raw)) throw Error(`缺少模板区块：${raw}`);
      return sections[raw];
    }
    const value = key.split('.').reduce((obj, part) => obj?.[part], context);
    if (value === undefined || value === null) throw Error(`内容文件缺少：${key}`);
    return esc(value);
  });
}

const profile = data.个人资料;
for (const key of ['姓名','英文名','品牌署名','职业','首页标题','简介','项目区说明','侧栏专业','关于我','专业','在校时间','课程','求职意向']) text(profile?.[key], `个人资料.${key}`);
text(data.年份, '年份');
text(data.联系?.标题, '联系.标题');
if (!/^\+?[\d ()-]{5,25}$/.test(data.联系?.电话)) throw Error('联系.电话 格式不正确');
for (const email of list(data.联系?.邮箱, '联系.邮箱')) {
  if (typeof email !== 'string' || !/^[^\s@<>"'?#]+@[^\s@<>"'?#]+\.[^\s@<>"'?#]+$/.test(email)) throw Error('邮箱格式不正确');
}
const projects = list(data.项目, '项目');
const pages = new Set();
for (const project of projects) {
  for (const key of ['页面','名称','英文副标题','首页名称','首页说明','年份','分类短名','项目标签','类别','服务范围','封面','封面说明','PDF','PDF说明']) text(project[key], `项目.${key}`);
  if (!/^[\p{L}\p{N}_-]+\.html$/u.test(project.页面) || project.页面 === 'index.html' || pages.has(project.页面)) throw Error(`项目页面名称重复或无效：${project.页面}`);
  pages.add(project.页面);
  for (const paragraph of list(project.概述, '项目.概述')) text(paragraph, '项目概述');
  for (const item of list(project.交付内容, '项目.交付内容')) { text(item.名称, '交付名称'); text(item.说明, '交付说明'); }
  if (!project.PDF.toLowerCase().endsWith('.pdf')) throw Error('项目 PDF 路径必须以 .pdf 结尾');
  const pdf = await asset(project.PDF);
  if ((await readFile(pdf)).subarray(0,5).toString() !== '%PDF-') throw Error(`不是有效的 PDF：${project.PDF}`);
}
const homeSections = {
  项目卡片: (await Promise.all(projects.map(async (p, i) => `<a class="project" href="./${esc(p.页面)}"><div class="project-visual">${await image(p.封面, p.封面说明, i === 0)}</div><div class="project-data"><div><h3>${esc(p.首页名称)}</h3><p>${esc(p.首页说明)}</p></div><span class="project-type">${esc(p.年份)} · ${esc(p.分类短名)}</span></div></a>`))).join('\n'),
  实验卡片: (await Promise.all(list(data.视觉实验, '视觉实验').map(async p => `<button class="lab-tile" type="button" data-lightbox aria-controls="lab-lightbox" aria-haspopup="dialog" aria-label="放大查看：${esc(text(p.名称, '实验名称'))}"><figure>${await image(p.图片,p.名称)}<figcaption><span>${esc(p.名称)}</span><span aria-hidden="true">↗</span></figcaption></figure></button>`))).join('\n'),
  实验说明: data.视觉实验.map(p => esc(p.名称)).join(' · '),
  流程卡片: list(data.设计流程, '设计流程').map((p,i) => `<article class="step"><span class="step-number">STEP ${String(i+1).padStart(2,'0')}</span><h3>${esc(text(p.英文标题, '流程英文标题'))}</h3><h4>${esc(text(p.中文标题, '流程中文标题'))}</h4><p>${esc(text(p.说明, '流程说明'))}</p></article>`).join('\n'),
  核心能力: list(profile.核心能力, '核心能力').map(p => `<li>${esc(text(p,'核心能力'))}</li>`).join(''),
  软件工具: list(profile.软件工具, '软件工具').map(p => `<li>${esc(text(p,'软件工具'))}</li>`).join(''),
  联系方式: `<a href="tel:${esc(data.联系.电话)}">电话：${esc(data.联系.电话)}</a>` + data.联系.邮箱.map(p => `<a href="mailto:${esc(p)}">${esc(p)}</a>`).join(''),
};
const homeTemplate = await readFile(resolve(root, 'templates/index.html'), 'utf8');
const caseTemplate = await readFile(resolve(root, 'templates/project.html'), 'utf8');
const html = new Map([['index.html', render(homeTemplate, {...data, 项目数量:String(projects.length).padStart(2,'0')}, homeSections)]]);
for (let i=0; i<projects.length; i++) {
  const p = projects[i];
  const next = projects[(i+1)%projects.length];
  html.set(p.页面, render(caseTemplate, {...data, 当前项目:p, 项目摘要:p.概述[0], PDF大小:((await stat(local(p.PDF))).size / 1024 / 1024).toFixed(1)}, {
    项目封面: await image(p.封面, p.名称, true),
    项目概述: p.概述.map(s => `<p>${esc(s)}</p>`).join('\n'),
    交付清单: p.交付内容.map((s,i) => `<li><span class="eyebrow">${String(i+1).padStart(2,'0')}</span><h3>${esc(s.名称)}</h3><p>${esc(s.说明)}</p></li>`).join('\n'),
    项目切换: '<a href="./index.html#works">← 全部项目</a>' + (projects.length>1 ? `<a href="./${esc(next.页面)}">${esc(next.名称)} →</a>` : ''),
  }));
}
// Clean only the fixed generated output directory after all content has validated.
if (out !== resolve(root, 'dist') || relative(root,out) !== 'dist') throw Error('输出目录不安全');
await rm(out, {recursive:true, force:true});
await mkdir(out, {recursive:true});
await cp(resolve(root,'assets'), resolve(out,'assets'), {recursive:true});
for (const path of assets) {
  const target = resolve(out,relative(root,path));
  await mkdir(dirname(target), {recursive:true});
  await cp(path,target);
}
for (const [name, content] of html) {
  await writeFile(resolve(out,name),content+'\n');
  // Root snapshots remain convenient for an ordinary static preview.
  await writeFile(resolve(root,name),content+'\n');
}
console.log(`已生成首页和 ${projects.length} 个项目，输出目录 dist/`);
