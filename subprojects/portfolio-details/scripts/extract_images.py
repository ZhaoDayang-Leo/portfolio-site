#!/usr/bin/env python3
"""从「作品集已有页面.pdf」导出完整页面图（不裁剪内容）。"""
from pathlib import Path

import fitz

PDF = Path("/Users/bytedance/Desktop/2026 zpj/作品集已有页面.pdf")
OUT = Path(__file__).resolve().parents[1] / "public" / "images"
ZOOM = 2.0

# PDF 页码为 0-based；与详情页 img 引用一一对应
MAPPING = {
    "rebranding": {
        "hero.png": 2,
        "drivers.png": 4,
        "phases.png": 5,
        "challenges.png": 6,
        "token-color.png": 7,
        "dark-mode.png": 8,
        "spacing.png": 9,
        "typography.png": 10,
        "before-after-detail.png": 11,
        "before-after-list.png": 12,
        "outcomes.png": 13,
        "ai-research.png": 18,
        "ai-language.png": 19,
        "ai-components.png": 20,
        "ai-workspace.png": 17,
        "design-platform.png": 15,
    },
    "metrics": {
        "hero.png": 22,
        "research.png": 23,
        "themes-explore.png": 24,
        "chroma.png": 25,
        "contrast.png": 26,
        "token.png": 27,
        "before-after.png": 28,
        "multi-theme.png": 29,
        "results.png": 30,
    },
    "gantt": {
        "hero.png": 31,
        "background.png": 32,
        "model.png": 33,
        "details.png": 34,
        "before-after.png": 35,
        "reuse-model.png": 36,
    },
}


def export_page(doc: fitz.Document, page_index: int, out_path: Path) -> None:
    page = doc[page_index]
    pix = page.get_pixmap(matrix=fitz.Matrix(ZOOM, ZOOM), alpha=False)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    pix.save(str(out_path))
    print(f"{page_index:02d} -> {out_path.relative_to(OUT.parent.parent)}")


def main() -> None:
    doc = fitz.open(PDF)
    try:
        for folder, files in MAPPING.items():
            for filename, page_index in files.items():
                if page_index >= doc.page_count:
                    raise ValueError(f"{folder}/{filename}: page {page_index} out of range ({doc.page_count})")
                export_page(doc, page_index, OUT / folder / filename)
    finally:
        doc.close()


if __name__ == "__main__":
    main()
