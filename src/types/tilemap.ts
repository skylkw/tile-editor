/**
 * 瓦片地图核心引用类型
 */

/** Tiled GID 变换位标记 */
export type TiledGidFlags = {
  flipH: boolean      // 水平翻转
  flipV: boolean      // 垂直翻转
  flipD: boolean      // 对角翻转 (90度旋转相关)
  rotateHex120: boolean // 六边形地图专属旋转
}

/** 解码后的 GID 详细信息 */
export type DecodedTiledGid = TiledGidFlags & {
  raw: number         // 原始 32 位整型值
  gid: number         // 纯净的图块 ID (不含标记位)
}

/** 图集 (Tileset) 的初始化配置 */
export interface TilesetConfig {
  name: string
  image: string
  sourcePath?: string
  tileWidth: number
  tileHeight: number
  margin: number
  spacing: number
  firstGid: number
}

/** 图集中单个瓦片的元数据 */
export interface TilesetTileDescriptor {
  gid: number
  localId: number
  column: number
  row: number
  x: number           // 在源图中的像素偏移 X
  y: number           // 在源图中的像素偏移 Y
  width: number
  height: number
}

/** 印章 (Stamp/Brush) 中的单元格定义 */
export interface TilesetStampCell {
  offsetX: number     // 相对原点的网格偏移 X
  offsetY: number     // 相对原点的网格偏移 Y
  gid: number
}

/** 印章 (Stamp/Brush) 完整定义 */
export interface TilesetStamp {
  width: number       // 印章占据的总列数
  height: number      // 印章占据的总行数
  primaryGid: number  // 主导瓦片的 GID (通常是左上角或点击位置)
  cells: TilesetStampCell[]
}

/** 图层 (TileLayer) 初始化配置 */
export interface TileLayerConfig {
  id: string
  name: string
  visible: boolean
  order: number
}
