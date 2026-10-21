// 网站内容.json is the only source for editable portfolio content.
// Node core modules only: no package installation or browser JavaScript needed.
import { readFile, writeFile, mkdir, cp, stat, rm, readdir } from 'node:fs/promises';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'dist');
const data = JSON.parse(await readFile(resolve(root, '网站内容.json'), 'utf8'));
const media = JSON.parse(await readFile(resolve(root, 'images/网页图片.json'), 'utf8').catch(error => {
  if (error.code === 'ENOENT') return '{}';
  throw error;
}));
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
const fullImage = src => media[src]?.fallback || src;
async function image(src, alt, priority = false, sizes = '(max-width: 760px) calc(100vw - 32px), (max-width: 960px) calc(100vw - 248px), (max-width: 1600px) calc((100vw - 374px) / 2), 550px') {
  // Sources remain in the repository; only the selected web derivatives deploy.
  if (media[src]) await stat(local(src));
  const fallback = fullImage(src);
  const path = await asset(fallback);
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
  const img = `<img src="${esc(fallback)}" alt="${esc(text(alt, '图片说明'))}" width="${width}" height="${height}" decoding="async" ${priority ? 'fetchpriority="high"' : 'loading="lazy"'}>`;
  if (!media[src]) return img;
  const variants = [];
  for (const variant of list(media[src].webp, `图片 ${src} 的 WebP 版本`)) {
    if (!Number.isInteger(variant.width) || variant.width < 1 || !variant.path.endsWith('.webp')) throw Error(`网页图片配置无效：${src}`);
    await asset(variant.path);
    variants.push(`${esc(variant.path)} ${variant.width}w`);
  }
  return `<picture><source type="image/webp" srcset="${variants.join(', ')}" sizes="${esc(sizes)}">${img}</picture>`;
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
for (const key of ['姓名','英文名','品牌署名','职业','首页标题','简介','项目区说明','侧栏专业','关于我','学校','学历','专业','在校时间','课程','求职意向','实习类型','到岗安排']) text(profile?.[key], `个人资料.${key}`);
text(data.年份, '年份');
if (!/^\d{4}-\d{2}-\d{2}$/.test(text(data.更新日期, '更新日期')) || !Number.isFinite(Date.parse(data.更新日期)) || data.更新日期.slice(0,4) !== data.年份) throw Error('更新日期请使用与作品集年份一致的 YYYY-MM-DD 日期');
const site = new URL(data.网站地址 || 'https://mywk.asia/');
if (site.protocol !== 'https:' || site.username || site.password || site.search || site.hash || site.pathname !== '/') throw Error('网站地址必须为 HTTPS 根网址');
const absolute = path => new URL(path, site).href;
text(data.联系?.标题, '联系.标题');
text(data.联系?.说明, '联系.说明');
text(data.联系?.补充说明, '联系.补充说明');
for (const email of list(data.联系?.邮箱, '联系.邮箱')) {
  if (typeof email !== 'string' || !/^[^\s@<>"'?#]+@[^\s@<>"'?#]+\.[^\s@<>"'?#]+$/.test(email)) throw Error('邮箱格式不正确');
}
const projects = list(data.项目, '项目');
if (!text(data.联系.简历, '联系.简历').toLowerCase().endsWith('.pdf')) throw Error('简历路径必须以 .pdf 结尾');
const resumePath = await asset(data.联系.简历);
if ((await readFile(resumePath)).subarray(0,5).toString() !== '%PDF-') throw Error('简历不是有效的 PDF');
const contactContext = {
  邮件目标: `mailto:${data.联系.邮箱[0]}?subject=${encodeURIComponent('设计实习与项目交流 - ' + profile.姓名)}`,
  简历大小: String(Math.ceil((await stat(resumePath)).size / 1024)),
  更新月份: data.更新日期.slice(0,7).replace('-', '.'),
};
const assetContext = {
  样式版本: createHash('sha256').update(await readFile(resolve(root,'assets/site.css'))).digest('hex').slice(0,12),
  脚本版本: createHash('sha256').update(await readFile(resolve(root,'assets/site.js'))).digest('hex').slice(0,12),
};
if (!Array.isArray(data.独立作品)) throw Error('独立作品必须是数组');
text(data.独立作品说明, '独立作品说明');
for (const item of data.独立作品) {
  for (const key of ['名称','类别','说明','图片','图片说明']) text(item[key], `独立作品.${key}`);
  if (item.年份 !== undefined && typeof item.年份 !== 'string') throw Error('独立作品.年份 必须为文字或留空');
}
const pages = new Set();
for (const project of projects) {
  for (const key of ['页面','名称','英文副标题','首页名称','首页说明','年份','分类短名','项目标签','类别','服务范围','封面','封面说明','PDF','PDF说明']) text(project[key], `项目.${key}`);
  if (!/^[\p{L}\p{N}_-]+\.html$/u.test(project.页面) || project.页面 === 'index.html' || pages.has(project.页面)) throw Error(`项目页面名称重复或无效：${project.页面}`);
  pages.add(project.页面);
  for (const paragraph of list(project.概述, '项目.概述')) text(paragraph, '项目概述');
  for (const item of list(project.首页交付物, '项目.首页交付物')) text(item, '首页交付物');
  for (const item of list(project.设计思路, '项目.设计思路')) { text(item.标题, '设计思路标题'); text(item.说明, '设计思路说明'); }
  for (const paragraph of list(project.方案回顾, '项目.方案回顾')) text(paragraph, '方案回顾');
  for (const item of list(project.交付内容, '项目.交付内容')) { text(item.名称, '交付名称'); text(item.说明, '交付说明'); }
  if (!project.PDF.toLowerCase().endsWith('.pdf')) throw Error('项目 PDF 路径必须以 .pdf 结尾');
  const pdf = await asset(project.PDF);
  if ((await readFile(pdf)).subarray(0,5).toString() !== '%PDF-') throw Error(`不是有效的 PDF：${project.PDF}`);
  const anchors = new Set(['top','main','overview','thinking','reflection','scope','pdf','lab-lightbox']);
  for (const chapter of project.展示章节 || []) {
    if (!/^[a-z][a-z0-9-]*$/.test(chapter.锚点) || anchors.has(chapter.锚点)) throw Error(`章节锚点重复或无效：${chapter.锚点}`);
    anchors.add(chapter.锚点);
    for (const key of ['导航名','标题','导语']) text(chapter[key], `展示章节.${key}`);
    if (chapter.导航名.length > 6) throw Error('章节导航名请控制在 6 个字以内');
    for (const item of list(chapter.图片, '章节图片')) {
      for (const key of ['图片','名称','说明']) text(item[key], `章节图片.${key}`);
      if (item.宽幅 !== undefined && typeof item.宽幅 !== 'boolean') throw Error('宽幅必须填 true 或 false');
    }
  }
}
text(data.流程标题, '流程标题');
text(data.流程导语, '流程导语');
const processCards = await Promise.all(list(data.设计流程, '设计流程').map(async (step, index) => {
  for (const key of ['英文标题','中文标题','说明','过程图','过程图说明','案例说明','案例页面','案例锚点']) text(step[key], `设计流程.${key}`);
  const project = projects.find(item => item.页面 === step.案例页面);
  if (!project) throw Error(`设计流程的案例页面不存在：${step.案例页面}`);
  const anchors = new Set(['overview','thinking','reflection','scope','pdf', ...(project.展示章节 || []).map(chapter => chapter.锚点)]);
  if (!anchors.has(step.案例锚点)) throw Error(`设计流程的案例锚点不存在：${step.案例页面}#${step.案例锚点}`);
  const number = String(index + 1).padStart(2, '0');
  const outputs = list(step.产出, '设计流程.产出').map(item => `<li>${esc(text(item, '流程产出'))}</li>`).join('');
  return `<li class="step" aria-labelledby="process-step-${number}">
<header><span class="step-number">STEP ${number}</span><h3 id="process-step-${number}">${esc(step.中文标题)}</h3><p class="step-english" lang="en">${esc(step.英文标题)}</p></header>
<p class="step-description">${esc(step.说明)}</p>
<ul class="step-outputs" aria-label="本步产出">${outputs}</ul>
<figure class="step-example"><div class="step-visual">${await image(step.过程图, step.过程图说明, false, '(min-width: 1024px) 40vw, (min-width: 761px) 65vw, calc(100vw - 32px)')}</div><figcaption><span>${esc(step.案例说明)}</span><a class="text-link" href="./${esc(step.案例页面)}#${esc(step.案例锚点)}" aria-label="查看${esc(step.案例说明)}案例">查看案例 ↗</a></figcaption></figure>
</li>`;
}));
text(data.视觉探索说明, '视觉探索说明');
text(data.视觉实验说明, '视觉实验说明');
const labCards = await Promise.all(list(data.视觉实验, '视觉实验').map(async (item, index) => {
  for (const key of ['名称','类别','说明','图片','图片说明']) text(item[key], `视觉实验.${key}`);
  const number = String(index + 1).padStart(2, '0');
  const techniques = list(item.技法, '视觉实验.技法').map(value => `<li>${esc(text(value, '实验技法'))}</li>`).join('');
  return `<article class="lab-card" aria-labelledby="lab-title-${number}">
<header><p class="lab-meta">EXP.${number} · ${esc(item.类别)}</p><h4 id="lab-title-${number}">${esc(item.名称)}</h4></header>
<button class="lab-tile" type="button" data-lightbox data-full-image="${esc(fullImage(item.图片))}" data-lightbox-title="${esc(item.名称)}" data-lightbox-description="${esc(item.说明)}" aria-controls="lab-lightbox" aria-haspopup="dialog" aria-label="查看原图：${esc(item.名称)}"><span class="lab-preview">${await image(item.图片,item.图片说明,false,'(min-width: 1024px) 40vw, (min-width: 761px) 65vw, calc(100vw - 32px)')}</span><span class="lab-action" aria-hidden="true">查看原图 ↗</span></button>
<p class="lab-description">${esc(item.说明)}</p><ul class="lab-techniques" aria-label="视觉手法">${techniques}</ul>
</article>`;
}));
const homeSections = {
  项目卡片: (await Promise.all(projects.map(async (p, i) => `<a class="project" href="./${esc(p.页面)}"><div class="project-visual">${await image(p.封面, p.封面说明, i === 0)}<span class="project-open" aria-hidden="true">查看案例 ↗</span></div><div class="project-data"><div class="project-label"><span>${String(i+1).padStart(2,'0')}</span><span>${esc(p.年份)} · ${esc(p.分类短名)}</span></div><div><h3>${esc(p.首页名称)}</h3><p>${esc(p.首页说明)}</p></div><div class="project-scope"><span class="project-scope-label">核心交付物</span><ul>${p.首页交付物.map(item => `<li>${esc(item)}</li>`).join('')}</ul></div><span class="project-action" aria-hidden="true">品牌案例详情 <span>↗</span></span></div></a>`))).join('\n'),
  独立作品卡片: data.独立作品.length ? (await Promise.all(data.独立作品.map(async item => `<button class="small-project-card" type="button" data-lightbox data-full-image="${esc(fullImage(item.图片))}" aria-controls="lab-lightbox" aria-haspopup="dialog" aria-label="放大查看：${esc(item.名称)}"><span class="small-project-visual">${await image(item.图片,item.图片说明,false,'(max-width: 480px) calc(100vw - 64px), (max-width: 1200px) 40vw, 300px')}</span><span class="small-project-data"><span class="small-project-meta"><span>${esc(item.类别)}</span>${item.年份?.trim() ? `<span>${esc(item.年份.trim())}</span>` : ''}</span><span class="small-project-title">${esc(item.名称)}</span><span class="small-project-description">${esc(item.说明)}</span></span></button>`))).join('\n') : '<div class="small-project-empty"><span class="eyebrow">OPEN INDEX</span><p>独立作品会按主题陆续收录于此。</p><span>海报 · 图形 · 标志 · 包装 · 版式</span></div>',
  实验卡片: labCards.join('\n'),
  流程卡片: processCards.join('\n'),
  核心能力: list(profile.核心能力, '核心能力').map(p => `<li>${esc(text(p,'核心能力'))}</li>`).join(''),
  ...Object.fromEntries(['软件工具','学习工具','辅助工具'].map(key => [key, list(profile[key], key).map(value => {
    const [name, ...description] = text(value, key).split('｜');
    return `<li><strong>${esc(name)}</strong>${description.length ? `<span>${esc(description.join('｜'))}</span>` : ''}</li>`;
  }).join('')])),
  联系方式: data.联系.邮箱.map((email,i) => `<div><dt>${i === 0 ? '首选邮箱' : '备用邮箱'}</dt><dd><a href="mailto:${esc(email)}">${esc(email)}</a>${i === 0 ? `<button class="copy-button" type="button" data-copy-text="${esc(email)}" aria-label="复制首选邮箱" hidden>复制邮箱</button>` : ''}</dd></div>`).join(''),
};
const homeTemplate = await readFile(resolve(root, 'templates/index.html'), 'utf8');
const caseTemplate = await readFile(resolve(root, 'templates/project.html'), 'utf8');
const html = new Map([['index.html', render(homeTemplate, {...data, ...contactContext, ...assetContext, 项目数量:String(projects.length).padStart(2,'0'),规范网址:site.href,分享图片:absolute(fullImage(projects[0].封面))}, homeSections)]]);
for (let i=0; i<projects.length; i++) {
  const p = projects[i];
  const next = projects[(i+1)%projects.length];
  const chapters = p.展示章节 || [];
  const navigation = '<a href="#overview">项目概述</a><a href="#thinking">设计思路</a>' + chapters.map(ch => `<a href="#${esc(ch.锚点)}">${esc(ch.导航名)}</a>`).join('') + '<a href="#reflection">方案回顾</a><a href="#pdf">完整 PDF</a>';
  const gallery = [];
  for (const [index, chapter] of chapters.entries()) {
    const figures = [];
    for (const item of chapter.图片) {
      figures.push(`<figure class="case-figure${item.宽幅 ? ' case-figure-wide' : ''}"><button class="case-zoom" type="button" data-lightbox data-full-image="${esc(fullImage(item.图片))}" aria-controls="lab-lightbox" aria-haspopup="dialog" aria-label="放大查看：${esc(item.名称)}">${await image(item.图片,item.名称,false,item.宽幅 ? '(max-width: 760px) calc(100vw - 32px), (max-width: 1304px) calc(100vw - 64px), 1240px' : '(max-width: 760px) calc(100vw - 32px), (max-width: 1304px) calc((100vw - 96px) / 2), 604px')}<span class="zoom-hint" aria-hidden="true">放大 ↗</span></button><figcaption><h3>${esc(item.名称)}</h3><p>${esc(item.说明)}</p></figcaption></figure>`);
    }
    gallery.push(`<section id="${esc(chapter.锚点)}" class="case-section case-chapter" aria-labelledby="${esc(chapter.锚点)}-heading"><div class="chapter-heading"><div><span class="eyebrow">${String(index+1).padStart(2,'0')} / ${esc(chapter.导航名)}</span><h2 id="${esc(chapter.锚点)}-heading">${esc(chapter.标题)}</h2></div><p>${esc(chapter.导语)}</p></div><div class="case-gallery">${figures.join('\n')}</div></section>`);
  }
  html.set(p.页面, render(caseTemplate, {...data, ...contactContext, ...assetContext, 当前项目:p, 项目摘要:p.概述[0], 浏览目标:'#'+(chapters[0]?.锚点 || 'overview'),规范网址:absolute(p.页面),分享图片:absolute(fullImage(p.封面)),PDF大小:((await stat(local(p.PDF))).size / 1024 / 1024).toFixed(1)}, {
    项目封面: await image(p.封面, p.封面说明, true,'(max-width: 760px) calc(100vw - 32px), (max-width: 1304px) 55vw, 700px'),
    案例导航: navigation,
    案例展示: gallery.join('\n'),
    项目概述: p.概述.map(s => `<p>${esc(s)}</p>`).join('\n'),
    设计思路: p.设计思路.map(s => `<li><h3>${esc(s.标题)}</h3><p>${esc(s.说明)}</p></li>`).join('\n'),
    方案回顾: p.方案回顾.map(s => `<p>${esc(s)}</p>`).join('\n'),
    交付清单: p.交付内容.map((s,i) => `<li><span class="eyebrow">${String(i+1).padStart(2,'0')}</span><h3>${esc(s.名称)}</h3><p>${esc(s.说明)}</p></li>`).join('\n'),
    项目切换: '<a href="./index.html#works">← 全部项目</a>' + (projects.length>1 ? `<a href="./${esc(next.页面)}">${esc(next.名称)} →</a>` : ''),
  }));
}
// Clean only the fixed generated output directory after all content has validated.
if (out !== resolve(root, 'dist') || relative(root,out) !== 'dist') throw Error('输出目录不安全');
await mkdir(out, {recursive:true});
// Keep dist itself so a running Windows preview server can keep its cwd.
for (const name of await readdir(out)) {
  const path = resolve(out, name);
  if (dirname(path) !== out) throw Error('生成文件超出输出目录');
  await rm(path, {recursive:true, force:true});
}
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
await writeFile(resolve(out,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${absolute('sitemap.xml')}\n`);
await writeFile(resolve(out,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[site.href,...projects.map(p=>absolute(p.页面))].map(url=>`<url><loc>${esc(url)}</loc></url>`).join('')}</urlset>\n`);
console.log(`已生成首页和 ${projects.length} 个项目，输出目录 dist/`);
