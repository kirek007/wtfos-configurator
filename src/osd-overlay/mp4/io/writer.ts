/*
  TODO:
  - Keep a consistent buffer going instead of creating a new one every time.
*/

export class FileStreamWriter {
  private readonly file: FileSystemFileHandle;
  private stream?: FileSystemWritableFileStream;

  private _offset = 0;
  private _size = 0;

  constructor(file: FileSystemFileHandle) {
    this.file = file;
  }

  async writeNextUint8(value: number): Promise<void> {
    const array = new Uint8Array(1);
    array[0] = value;

    await this.writeNextBytes(array);
  }

  async writeNextUint16(value: number): Promise<void> {
    const buffer = new ArrayBuffer(2);
    const view = new DataView(buffer);
    view.setUint16(0, value, false);

    await this.writeNextBytes(buffer);
  }

  async writeNextUint32(value: number): Promise<void> {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint32(0, value, false);

    await this.writeNextBytes(buffer);
  }

  async writeNextUint64(value: number | bigint): Promise<void> {
    if (typeof value === "number") {
      value = BigInt(value);
    }

    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setBigUint64(0, value, false);

    await this.writeNextBytes(buffer);
  }

  async writeNextString(value: string, length?: number): Promise<void> {
    const buffer = new Uint8Array(
      length !== undefined ? length : value.length + 1
    );

    const encoder = new TextEncoder();
    encoder.encodeInto(value, buffer);

    await this.writeNextBytes(buffer);
  }

  async writeNextBytes(bytes: BufferSource | Blob): Promise<void> {
    const stream = await this.getStream();
    await stream.write(bytes);

    const byteLength = bytes instanceof Blob ? bytes.size : bytes.byteLength;
    this._offset += byteLength;
    this._size += byteLength;
  }

  async skip(length: number) {
    await this.seek(this.offset + length);
  }

  async seek(offset: number) {
    const stream = await this.getStream();
    await stream.seek(offset);
    this._offset = offset;
  }

  async close() {
    const stream = await this.getStream();
    await stream.close();
    this.stream = undefined;
  }

  private async getStream(): Promise<FileSystemWritableFileStream> {
    if (!this.stream) {
      this.stream = await this.file.createWritable();
      await this.stream.truncate(0);

      this._size = 0;
      this._offset = 0;
    }

    return this.stream;
  }

  get offset(): number {
    return this._offset;
  }

  get size(): number {
    return this._size;
  }
}
