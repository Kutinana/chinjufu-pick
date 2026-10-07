# 镇守府 PICK / 鎮守府 PICK / Chinjufu Pick

按舰种或按日籍驱逐舰舰级选择最喜欢的舰娘，挑选具体立绘，再导出自己的选择表。中、日、英三语。首页模板入口及选择页面以 [Kivotos Pick](https://blue-archive-pick.vercel.app/) 为唯一视觉参考。

| URL | 页面 |
| --- | --- |
| `/` | 首页，两张 pickup 入口卡片 |
| `/favorite-shipgirls` | 按舰种选择，10 个大类 |
| `/favorite-destroyers` | 日籍驱逐舰按舰级选择，13 个舰级、113 位舰娘 |

两张选择表分别保存昵称、舰娘和立绘。日籍驱逐舰页面按神风型至松型的现有舰级顺序展示，只允许选择对应舰级的舰娘。岛风级默认显示，可关闭；关闭后选择表、完成数量和 PNG 导出改为 12 个舰级，已选岛风立绘仍保留，再次开启即可恢复。开关状态随浏览器保存及分享链接恢复。

分享链接使用对应 pickup 的 URL；旧首页 `#p=` 分享链接仍会载入内容并定位到对应页面。Vercel 配置包含两条页面重写，支持直接访问与刷新。

首页 Hero 使用《「艦これ」いつかあの海で》官方海面群像主视觉，[官网](https://kancolle-itsuumi.com/)、[原图](https://kancolle-itsuumi.com/core_sys/images/main/tz/kv2.jpg)。原图 2560 × 1804，本地 WebP 1920 × 1353（约 308 KiB），不依赖外部图床；© C2機関 / KADOKAWA /「艦これ」第二水雷戦隊。

## 使用

- 点击舰种空位，或在右侧舰娘列表中搜索、选择舰娘。列表每批显示 24 位，滚动接近底部时自动追加下一批；搜索、筛选或切换语言后回到第一批。
- 在立绘子对话框中选择改装形态，筛选常规、季节／节日，以及正常／中破立绘。常规图先于限定图，各组按未改、改、改二、改三等改装顺序排列。
- 单击立绘选中，双击立绘或点击「使用这张立绘」确认。对话框可返回对应舰种的舰娘列表，保留原搜索条件；关闭时淡出。选择表与导出图显示这张立绘的脸部头像和舰娘本名，不带改、改二、改三等形态后缀；立绘选择对话框仍保留具体形态名称。点击已选头像可重新选择立绘，或返回舰娘选择；卡片下方可微调头像位置。
- 立绘选择对话框的「微调头像位置」支持拖动、缩放、方向键微调和恢复默认。应用调整后点击「使用这张立绘」完成选择；选择表上的同名按钮直接调整当前头像。调整仅保存原图路径、尺寸和裁切坐标，随选择保存、分享并用于 PNG 导出，不另存头像图片。
- 「保存图片」生成 2000px 宽的 PNG，可下载或在手机上长按保存。
- 「分享选择表」生成带有选择内容的链接。接收者可以继续编辑自己的副本。
- 昵称与选择自动保存在当前浏览器。无后端、无账号、无需环境变量。

## 本地开发

需要 Node.js 22.12+ 或 24+。

```sh
npm ci
npm run dev
```

```sh
npm test
npm run build
npm run preview
```

生产文件位于 `dist/`。React + TypeScript + Vite，字体与游戏图像均在本地打包；访问网页和导出图片不依赖 Wiki 图床。

## Vercel 部署

建议将整个项目（含 `public/ships`、`public/artworks`、`public/data`）上传到自己的 Git 仓库，然后在 Vercel 中导入仓库。项目已提供 `vercel.json`：

| 设置 | 值 |
| --- | --- |
| Framework Preset | Vite |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Environment Variables | 无 |

立绘目录较大。Vercel 的 Hobby 套餐通过 CLI 上传源码时有 100 MB 限制，因此推荐 Git 导入方式；Pro 的 CLI 限制为 1 GB。参见 [Vercel 上传限制](https://vercel.com/docs/limits#static-file-uploads)与 [Vite 部署文档](https://vercel.com/docs/frameworks/frontend/vite)。本项目只准备部署配置，没有创建或发布 Vercel 项目。

## 数据与立绘更新

内置舰娘目录包含 332 位舰娘、865 个形态、19 个舰种，以及 3483 张立绘（2061 张季节／限定立绘）。865 个形态的常规正常与中破立绘均已覆盖。角色按改装关系归并，选择表共 10 个大类：DD、DE、CL（含 CLT / CT）、CA（含 CAV）、BB（含 BBV）、CV（含 CVB）、CVL、AV、SS（含 SSV）、辅助舰（AO / AS / LHA / AR）。列表仍可按 19 个具体舰种筛选；舰娘选择对话框按舰级分组，支持三语舰级搜索。舰级排序参考 noro6 的固定舰级表，按日籍优先、旧级在前排列，同级舰娘按番舰顺序排列；三语使用同一顺序。排序表位于 `src/class-order.ts`。

旧本地选择与分享链接会自动迁移：同一大类有多个旧选择时，优先保留主类选择，其次按该类列出的子舰种顺序保留一个。

```sh
npm run sync:ships
npm run sync:artworks
```

舰娘同步使用 Node.js，立绘同步可以使用 Python + Pillow 将图片压缩为保留透明通道的 WebP：

```sh
npm run sync:artworks -- --python=/absolute/path/to/python --max-size=1000
```

不传 `--python` 时保留来源的原始 PNG/JPEG，目录体积会增大。建议传入已安装 Pillow 的 Python 路径，以继续生成本项目使用的 WebP。

同步需要网络；正常构建使用已提交的数据与资产，不需要联网采集。脚本会保留每张立绘的原始链接、标题和形态对应关系；失败项与覆盖统计记录在 `public/data/artworks.json` 的 `coverage` 中。未知限定活动使用保守的名称，中文保留来源标题。没有收录的立绘不会以虚构图片代替。

图片更新后重新运行构建。开发服务器为避免批量采集导致频繁刷新，会忽略数据与图片目录的文件监听；采集完成后手动刷新页面即可读取最新数据。

## 头像坐标表

头像不另存图片。`public/data/avatar-crops.json` 以原图路径为键，记录原图像素尺寸 `size` 与裁切矩形 `rect: [x, y, width, height]`。网页通过 CSS 裁切原图；Canvas 导出读取相同坐标，因此节日、中破头像也与选中的立绘一致。立绘对话框仍显示完整原图。

模型只用于开发阶段离线定位，模型文件和 QA 缩略图不进入部署目录。两个经确认的样例与其他手动校正记录在 `scripts/avatar-crop-overrides.json`。每条坐标记录带有原图 SHA-256，构建会检查覆盖范围、坐标边界及原图变化，避免数据更新后继续使用过期坐标。

更新立绘后，使用安装了 `scripts/requirements-avatar.txt` 依赖的 Python 运行：

```sh
python3 scripts/build-avatar-crops.py --onnx=/absolute/path/to/model.onnx --review-dir=/tmp/avatar-review
```

模型为 [DeepGHS anime_face_detection / face_detect_v1.4_s](https://huggingface.co/deepghs/anime_face_detection/tree/784dc4c0bb692351ddcdbe6131a050b17d3025d5/face_detect_v1.4_s)，MIT 许可。`--review-dir` 生成仅供检查的临时总览图；`--force` 可重新定位全部原图。自动定位后应检查低置信度结果，将需要调整的矩形加入 overrides 并重新运行，再执行 `npm run build`。

## 卡面补齐清单

原先以图鉴卡面补齐的 186 张图已全部替换为透明全身图。通过舰娘百科 API 核实 `KanMusu{图鉴编号}HDIllust.png` / `HDDmgIllust.png`，无高清版本时再检查 `Illust.png` / `DmgIllust.png`，逐张确认透明通道及形态。12 张改装图与未改共用，已通过画廊说明、卡面视觉和局部特征比对核实。处理记录见 `docs/artwork-resolution.json`，原 CSV 保留为历史清单。`scripts/resolve-card-artworks.py` 支持读取 CSV、离线审核与应用修正；更新当前 HTML 清单时用 `node scripts/list-card-fallbacks.mjs --html-only`，避免覆盖填写的 CSV。

已确认的素材修正记录在 `scripts/artwork-source-overrides.json`，保留原立绘 ID 和路径以兼容已保存的选择。替换原图后重新运行头像坐标生成及构建。

## 目录

| 路径 | 内容 |
| --- | --- |
| `src/App.tsx` | 选择表、列表、嵌套立绘对话框、分享和浏览器保存 |
| `src/model.ts` | 舰种、改装归并、三语搜索、分享数据校验 |
| `src/routes.ts` | 首页与两个独立 pickup URL |
| `src/i18n.ts` | 中日英界面文案 |
| `src/export.ts` | 同源图片的 Canvas PNG 导出 |
| `public/data/avatar-crops.json` | 每张原图的头像裁切坐标，含原图尺寸和校验值 |
| `scripts/build-avatar-crops.py` | 离线定位和裁切坐标生成工具 |
| `scripts/avatar-crop-overrides.json` | 经检查后手动调整的头像坐标 |
| `public/data/ship-classes.json` | 三语舰级名称与出处 |
| `public/icons/ship-types` | 侧面剪影与作者说明 |
| `public/data/ships.json` | 舰娘与改装目录 |
| `public/data/artworks.json` | 立绘、来源与覆盖统计 |
| `public/data-sources.json` | 数据来源、版本与版权说明 |
| `scripts/sync-ships.mjs` | 舰娘同步脚本 |
| `scripts/sync-artworks.mjs` | 立绘同步脚本 |

## 来源与版权

- 舰娘、舰种与改装关系：[kcwiki / kcdata](https://kcwikizh.github.io/kcdata/ship/ship.json)。
- 舰级排序参考：[noro6 / kc-web](https://github.com/noro6/kc-web/blob/975da86160f35f0fdecb924f0d686630911851da/src/classes/constants/ships.ts)。合并大类后调整了训练巡洋舰和新收录旧舰的位置。
- 舰级目录：KC3 的 `ctype` 与 kcwiki 舰级目录；额外中文与英文舰级名称本地整理，见 `public/data/ship-classes.json`。
- 剪影：战舰、重巡、轻巡、驱逐使用 [Pastime工廠](https://blog.pastime.ne.jp/game/kankore/1473) 作者允许自由使用的矢量素材；其余六类为本站绘制的舰种示意 SVG。原作者链接与转换说明见 [图标说明](public/icons/ship-types/NOTICE.md)。
- 三语名称与头像：[KC3改](https://github.com/KC3Kai/KC3Kai)、[KC3 translations](https://github.com/KC3Kai/kc3-translations)。
- 立绘目录：[舰娘百科](https://zh.kcwiki.cn/wiki/舰娘百科)各舰娘条目的公开画廊。
- 字体：[Outfit](https://github.com/Outfitio/Outfit-Fonts)，通过 Fontsource 本地打包，SIL Open Font License。

这是非官方、非营利同人网站。舰队Collection 与游戏立绘的版权归 DMM / C2 / KADOKAWA 等原权利方所有。数据与翻译的具体版本及原始链接见对应 JSON；游戏图像不受本项目源代码的许可覆盖。
