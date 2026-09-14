#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Le时间管理 · 内置插件图标生成器（Icons8 / iGoutu Color 彩色图标集）

用途
    把 12 个内置插件的图标统一换成 Icons8「Color」彩色风格（品牌类走 3D 图标），
    生成 81×81 的透明 PNG，同时写入桌面端与小程序两处，并把来源台账写进 ATTRIBUTION.md。

来源
    图标集：https://igoutu.cn/icons/set/标志--style-color
    CDN：   https://img.icons8.com/<style>/96/<slug>.png  （style = color / 3d-fluency）
    igoutu.cn 是 Icons8 的中文镜像，slug 与 style 与 icons8.com 完全一致。

输出
    le-time-management/public/icons/plugins/<plugin-id>.png   ← 桌面端（src/icons.js 直接读）
    le-time-management/public/icons/plugins/ATTRIBUTION.md    ← 来源与 sha256 台账
    miniprogram/images/plugins/<plugin-id>.png                ← 小程序（与桌面端同一份素材）

依赖
    Pillow。用项目专用 venv 跑：
    "C:/Users/yile/.workbuddy/binaries/python/envs/default/Scripts/python.exe" tools/gen-plugin-icons.py
    参数 --offline 表示只用缓存（.workbuddy/icon-cache/）不联网。
"""

import argparse
import hashlib
import io
import json
import os
import sys
import urllib.request
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parent.parent
DESKTOP_OUT = REPO / "le-time-management" / "public" / "icons" / "plugins"
MINI_OUT = REPO / "miniprogram" / "images" / "plugins"
CACHE = REPO / ".workbuddy" / "icon-cache"

CANVAS = 81          # 画布边长，与历史素材（FA 50px 落在 81px 画布）保持一致
GLYPH = 58           # 图形最长边，略大于历史 50px，暗色底板下更清楚

# plugin-id -> (CDN 风格, slug, 说明)
ICONS = {
    "plugin-guide":      ("color",      "help",             "插件使用说明 / 帮助"),
    "pomodoro":          ("color",      "tomato",           "番茄专注 / 番茄"),
    "cppu-notify":       ("color",      "university",       "警大门户通知 / 大学建筑"),
    "gx-news":           ("color",      "trophy",           "竞赛消息雷达 / 奖杯"),
    "exam-calendar":     ("color",      "test-passed",      "考试日历 / 考核清单"),
    "shiguang-schedule": ("color",      "timetable",        "课程表 / 日历+时钟"),
    "web-collector":     ("color",      "bookmark-ribbon",  "网页收集 / 书签"),
    "wechat-push":       ("3d-fluency", "wechat",           "微信提醒推送 / 微信标志"),
    "chaoxing-notify":   ("color",      "books",            "学习通 / 一摞书"),
    "school-notice":     ("color",      "school",           "学校通知网站 / 校舍"),
    "cn-holiday":        ("color",      "lantern",          "中国节假日 / 中式灯笼"),
    "weekly-report":     ("color",      "statistics",       "周度报告 / 数据看板"),
}

UA = {"User-Agent": "Mozilla/5.0 (compatible; Le-time-management-icon-sync/1.0)"}


def cdn_url(style: str, slug: str) -> str:
    return f"https://img.icons8.com/{style}/96/{slug}.png"


def fetch(style: str, slug: str, offline: bool) -> bytes:
    CACHE.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE / f"{style}__{slug}.png"
    if cache_file.exists():
        return cache_file.read_bytes()
    if offline:
        raise SystemExit(f"缓存缺失且处于 --offline：{cache_file}")
    last = None
    for _ in range(3):
        try:
            req = urllib.request.Request(cdn_url(style, slug), headers=UA)
            with urllib.request.urlopen(req, timeout=25) as res:
                body = res.read()
            if len(body) < 600:
                raise RuntimeError(f"返回内容异常（{len(body)} 字节）")
            cache_file.write_bytes(body)
            return body
        except Exception as exc:  # noqa: BLE001
            last = exc
    raise SystemExit(f"下载失败 {style}/{slug}：{last}")


def normalize(raw: bytes) -> Image.Image:
    """把任意尺寸的图标缩放到 81×81 画布，图形最长边统一为 GLYPH，居中（保留透明边）。"""
    src = Image.open(io.BytesIO(raw)).convert("RGBA")
    bbox = src.getbbox()
    if bbox:
        src = src.crop(bbox)
    ratio = GLYPH / max(src.width, src.height)
    size = (max(1, round(src.width * ratio)), max(1, round(src.height * ratio)))
    src = src.resize(size, Image.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.alpha_composite(src, ((CANVAS - size[0]) // 2, (CANVAS - size[1]) // 2))
    return canvas


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true", help="只使用本地缓存，不联网")
    ap.add_argument("--check", action="store_true", help="只校验落地文件是否与 CDN 一致（需缓存或联网）")
    args = ap.parse_args()

    DESKTOP_OUT.mkdir(parents=True, exist_ok=True)
    MINI_OUT.mkdir(parents=True, exist_ok=True)

    rows = []
    for plugin_id, (style, slug, note) in ICONS.items():
        img = normalize(fetch(style, slug, args.offline))
        buf = io.BytesIO()
        img.save(buf, "PNG", optimize=True)
        data = buf.getvalue()
        digest = hashlib.sha256(data).hexdigest()

        existing = DESKTOP_OUT / f"{plugin_id}.png"
        if args.check:
            same = existing.exists() and hashlib.sha256(existing.read_bytes()).hexdigest() == digest
            print(f"{'OK ' if same else 'DIFF'} {plugin_id:20} {style}/{slug}")
            continue

        existing.write_bytes(data)
        (MINI_OUT / f"{plugin_id}.png").write_bytes(data)
        rows.append((plugin_id, style, slug, note, digest))
        print(f"写入 {plugin_id:20} {style}/{slug:18} {len(data):6} B  sha256={digest[:12]}")

    if not args.check:
        lines = [
            "# public/icons/plugins 素材台账（内置插件图标）",
            "",
            f"共 {len(rows)} 个图标，全部来自 **Icons8 / iGoutu** 的 **Color 彩色风格**"
            "（`wechat-push` 用 `3d-fluency` 风格，因为 Color 风格没有微信标志）。",
            "",
            "图标集入口：<https://igoutu.cn/icons/set/标志--style-color> ｜ "
            "CDN 直链格式：`https://img.icons8.com/<style>/96/<slug>.png`",
            "",
            "生成方式：`tools/gen-plugin-icons.py`（Pillow，输出 81×81 透明 PNG，"
            f"图形最长边 {GLYPH}px）。**不要手工替换这些 PNG** —— 重新生成会覆盖。",
            "",
            "| 插件 ID | 风格 | slug | 说明 | sha256 |",
            "|---|---|---|---|---|",
        ]
        for plugin_id, style, slug, note, digest in rows:
            lines.append(f"| `{plugin_id}` | {style} | `{slug}` | {note} | `{digest[:16]}…` |")
        lines += [
            "",
            "## 许可",
            "",
            "Icons8 License（免费使用需在产品内署名）。署名入口见设置 → 关于（`src/aboutData.js`）"
            "与 `public/OPEN_SOURCE_NOTICES.md`。",
            "素材仅作为本产品界面的组成部分使用，**不得作为独立图标库转售或再分发**。",
            "",
            "## 消费方",
            "",
            "| 端 | 路径 | 读取方式 |",
            "|---|---|---|",
            "| 桌面 / Android | `le-time-management/public/icons/plugins/*.png` | `src/icons.js` 的 `appIcon()` 按插件 ID 直读 |",
            "| 微信小程序 | `miniprogram/images/plugins/*.png` | `pages/plugins/index.js`、`pages/plugin/index.js` 拼 `/images/plugins/${id}.png` |",
            "",
            "两份文件字节一致，由本脚本一次写入。",
            "",
        ]
        (DESKTOP_OUT / "ATTRIBUTION.md").write_text("\n".join(lines), encoding="utf-8")
        print(f"\n台账已写入 {DESKTOP_OUT / 'ATTRIBUTION.md'}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
