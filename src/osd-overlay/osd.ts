import { StreamDataView } from "stream-data-view";

interface OsdHeader {
  software: string;
  magic: Uint8Array;
}

interface OsdConfig {
  charWidth: number;
  charHeight: number;
  fontWidth: number;
  fontHeight: number;
  xOffset: number;
  yOffset: number;
  fontVariant: number;
}

interface OsdFrame {
  frameTime: number;
  frameData: Uint8Array;
}

export class OsdReader {
  readonly header: OsdHeader;
  readonly frames: OsdFrame[] = [];

  constructor(data: ArrayBuffer) {
    const stream = new StreamDataView(data, false);
    this.header = {
      software: stream.getNextString(4),
      magic: stream.getNextBytes(36),
    };

    while (stream.getOffset() < data.byteLength) {
      try {
        const frameTime = stream.getNextUint32()
        const frameData = stream.getNextBytes(2120)

        this.frames.push({
          frameTime,
          frameData,
        });
      } catch (e) {
        if (e instanceof RangeError) {
          console.warn("No more data in OSD file, probably truncated due to power loss");
          break;
        }
      }
    }
  }

  static async fromFile(file: File): Promise<OsdReader> {
    const data = await file.arrayBuffer();
    return new OsdReader(data);
  }
}
