# 小鸭池塘交互小游戏素材包

源图尺寸：1672 × 941px，坐标原点在左上角。

## 目录结构

- `background_full_original.png`：原始完整背景图，未改动。
- `background_inpainted_no_characters.png`：去掉鸭子、人物、芦苇后的机器修补版背景，适合做原型底图。
- `sprites/`：已切出的独立素材 PNG，带透明通道。
- `layers/`：较大的环境层，例如木栈道、石岸、水域。
- `spritesheet.png`：所有非环境层素材合成的雪碧图。
- `metadata/manifest.json`：完整标注，含 bbox、分类、碰撞体建议、标签。
- `metadata/labels.csv`：轻量表格版标注。
- `metadata/pondAssets.ts`：可直接给前端/Codex 使用的 TypeScript 素材索引。
- `metadata/spritesheet.json`：雪碧图 frame 坐标。
- `previews/annotated_overview_all_assets.png`：所有素材在原图上的标注预览。
- `previews/annotated_overview_major_sprites.png`：主要可交互素材标注预览。
- `previews/sprite_contact_sheet.png`：切图素材总览。

## 使用建议

1. 用 `background_inpainted_no_characters.png` 做底图；如需保持原画完全一致，用 `background_full_original.png`。
2. 按 `manifest.json` 的 `bbox_xywh` 把素材放回原始坐标，即可复原大致布局。
3. 鸭子、人物适合作为可移动或可点击 NPC；`rock` 与 `layer_rock_bank_full` 可作为障碍/碰撞区域。
4. 单个石头是近似椭圆切图，因原画石头互相覆盖，建议在游戏中更多使用整块 `layer_rock_bank_full` 作为碰撞层。
