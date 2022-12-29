export const SD_TILE_WIDTH = 12 * 3;
export const SD_TILE_HEIGHT = 18 * 3;

export const HD_TILE_WIDTH = 12 * 2;
export const HD_TILE_HEIGHT = 18 * 2;

export const TILES_PER_PAGE = 256;

export interface FontPack {
  sd: Font;
  hd: Font;
}

export interface FontPackFiles {
  sd: File;
  hd: File;
}

export class Font {
  readonly name: string;
  readonly tiles: ImageBitmap[];

  constructor(name: string, tiles: ImageBitmap[]) {
    this.name = name;
    this.tiles = tiles;
  }

  getTile(index: number): ImageBitmap {
    return this.tiles[index];
  }

  static async fromFile(file: File): Promise<Font> {
    const data = await file.arrayBuffer();
    const isHd = file.name.includes("36");

    const tileWidth = isHd ? HD_TILE_WIDTH : SD_TILE_WIDTH;
    const tileHeight = isHd ? HD_TILE_HEIGHT : SD_TILE_HEIGHT;

    const tiles: ImageBitmap[] = [];
    for (let tileIndex = 0; tileIndex < TILES_PER_PAGE; tileIndex++) {

      const tileY = tileIndex * tileHeight 
      const tileY2 = tileY + tileHeight

      const imageBitmap = await createImageBitmap(file, 0, tileY, tileWidth, tileY2);
      tiles.push(imageBitmap);
    }

    return new Font(file.name, tiles);
  }

  static async fromFiles(files: FontPackFiles): Promise<FontPack> {
    return {
      sd: await Font.fromFile(files.sd),
      hd: await Font.fromFile(files.hd),
    };
  }
}
