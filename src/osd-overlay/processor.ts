import VideoWorkerShared from "./shared";
import { StreamDataView } from "stream-data-view";
import {
  MP4Parser, MP4Writer,
} from "./mp4";
import {
  Avc1Box, AvcCBox,
} from "./mp4/types";

const MAX_QUEUE_SIZE = 60;
const KEYFRAME_INTERVAL = 15;
const TINY_FRAME_SIZE = 100;

function avcCBoxToDescription(avcCBox: AvcCBox): ArrayBuffer {
  const stream = new StreamDataView(undefined, true);

  stream.setNextUint8(avcCBox.configurationVersion);
  stream.setNextUint8(avcCBox.profileIndication);
  stream.setNextUint8(avcCBox.profileCompatibility);
  stream.setNextUint8(avcCBox.levelIndication);
  stream.setNextUint8(avcCBox.lengthSizeMinusOne + (63 << 2));

  stream.setNextUint8(avcCBox.sequenceParameterSets.length + (7 << 5));
  for (let i = 0; i < avcCBox.sequenceParameterSets.length; i++) {
    stream.setNextUint16(avcCBox.sequenceParameterSets[i].length);
    for (let j = 0; j < avcCBox.sequenceParameterSets[i].length; j++) {
      stream.setNextUint8(avcCBox.sequenceParameterSets[i][j]);
    }
  }

  stream.setNextUint8(avcCBox.pictureParameterSets.length);
  for (let i = 0; i < avcCBox.pictureParameterSets.length; i++) {
    stream.setNextUint16(avcCBox.pictureParameterSets[i].length);
    for (let j = 0; j < avcCBox.pictureParameterSets[i].length; j++) {
      stream.setNextUint8(avcCBox.pictureParameterSets[i][j]);
    }
  }

  return stream.getBuffer();
}

type InfoReadyCallback = (width: number, height: number) => void;
type ModifyFrameCallback = (frame: VideoFrame, index: number) => VideoFrame;
type ProgressInitCallback = (total: number) => void;
type ProgressCallback = (processed?: number, preview?: ImageBitmap) => void;

export interface ProcessorOptions {
  infoReady: InfoReadyCallback;
  modifyFrame: ModifyFrameCallback;
  progressInit: ProgressInitCallback;
  progressUpdate: ProgressCallback;
}

export class Processor {
  decoder?: VideoDecoder;
  encoder?: VideoEncoder;

  inMp4?: MP4Parser;
  outMp4?: MP4Writer;

  expectedFrames: number = 0;
  framesDecoded: number = 0;
  framesEncoded: number = 0;
  queuedForDecode: number = 0;
  queuedForEncode: number = 0;

  infoReady: InfoReadyCallback;
  modifyFrame: ModifyFrameCallback;
  progressInit: ProgressInitCallback;
  progressUpdate: ProgressCallback;

  samplePromise = Promise.resolve();
  decoderPromise = Promise.resolve();
  encoderPromise = Promise.resolve();

  constructor(options: ProcessorOptions) {
    this.infoReady = options.infoReady;
    this.modifyFrame = options.modifyFrame;
    this.progressInit = options.progressInit;
    this.progressUpdate = options.progressUpdate;
  }

  reset() {
    if (this.encoder) {
      this.encoder.close();
    }

    this.encoder = new VideoEncoder({
      output: this.handleEncodedFrame.bind(this),
      error: this.handleEncoderError.bind(this),
    });

    if (this.decoder) {
      this.decoder.close();
    }

    this.decoder = new VideoDecoder({
      output: this.handleDecodedFrame.bind(this),
      error: this.handleDecoderError.bind(this),
    });

    this.samplePromise = Promise.resolve();
    this.decoderPromise = Promise.resolve();
    this.encoderPromise = Promise.resolve();
  }

  async processFile(file: File, outHandle: FileSystemFileHandle) {
    this.reset();

    this.inMp4 = new MP4Parser(file);
    await this.inMp4.parse();

    for (const [
      index,
      size,
    ] of this.inMp4.moov!.trak[0].mdia.minf.stbl.stsz.sampleSizes.entries()) {
      if (size <= TINY_FRAME_SIZE) {
        console.warn(`Frame ${index} is too small (${size} bytes)!`);
      }
    }

    this.outMp4 = new MP4Writer(outHandle);
    await this.outMp4.open();

    const avc1box = this.inMp4.moov!.trak[0].mdia.minf.stbl.stsd
      .entries[0] as Avc1Box;
    const codec =
      "avc1." +
      avc1box.avcC.profileIndication.toString(16).padStart(2, "0") +
      avc1box.avcC.profileCompatibility.toString(16).padStart(2, "0") +
      avc1box.avcC.levelIndication.toString(16).padStart(2, "0");

    this.decoder!.configure({
      codec: codec,
      codedWidth: this.inMp4.moov!.trak[0].tkhd.width,
      codedHeight: this.inMp4.moov!.trak[0].tkhd.height,
      description: avcCBoxToDescription(
        (this.inMp4.moov!.trak[0].mdia.minf.stbl.stsd.entries[0] as Avc1Box)
          .avcC
      ),
      optimizeForLatency: false,
    });

    this.infoReady(
      this.inMp4.moov!.trak[0].tkhd.width,
      this.inMp4.moov!.trak[0].tkhd.height
    );
  }

  processSamples(options: { width: number; height: number }) {
    let bitrate =
      (this.inMp4!.mdat!.header!.size * 8 * this.inMp4!.moov!.mvhd.timescale) /
      this.inMp4!.moov!.mvhd.duration;
    bitrate = Math.ceil(bitrate / 5_000_000) * 5_000_000;

    this.encoder!.configure({
      codec: "avc1.42003d",
      width: options.width,
      height: options.height,
      bitrate: bitrate,
      framerate: 60,
      latencyMode: "quality",
    });

    this.outMp4?.setDisplaySize({
      width: options.width,
      height: options.height,
    });

    this.framesDecoded = 0;
    this.framesEncoded = 0;
    this.queuedForDecode = 0;
    this.queuedForEncode = 0;
    this.expectedFrames = this.inMp4!.moov!.trak[0].mdia.mdhd.duration;
    this.progressInit(this.expectedFrames);

    this.decodeNextSamples();
  }

  decodeNextSamples() {
    this.samplePromise = this.samplePromise.then(async () => {
      let remainingSamples = this.expectedFrames - this.queuedForDecode;
      if (remainingSamples <= 0) {
        // console.debug("No more samples to decode");
        return;
      } else {
        // console.debug(`Remaining samples: ${remainingSamples}`);
      }

      // console.debug(
      //   `Dec queue: ${this.decoder!.decodeQueueSize}, Enc queue: ${
      //     this.encoder!.encodeQueueSize
      //   }`
      // );
      if (
        (this.decoder!.decodeQueueSize > MAX_QUEUE_SIZE ||
          this.encoder!.encodeQueueSize > MAX_QUEUE_SIZE) &&
        remainingSamples > MAX_QUEUE_SIZE
      ) {
        // console.debug("Queues too full, not adding more samples");
        return;
      }

      const sample = await this.inMp4!.getSample(this.queuedForDecode);
      if (sample.data.byteLength <= TINY_FRAME_SIZE) {
        console.warn(`Skipping tiny frame ${this.queuedForDecode}`);
        this.queuedForDecode++;
        this.framesDecoded++;
        this.queuedForEncode++;
        this.framesEncoded++;
        this.decodeNextSamples();
        return;
      }

      const chunk = new EncodedVideoChunk({
        type: sample.sync ? "key" : "delta",
        timestamp: 0,
        duration: 60,
        data: sample.data.buffer,
      });

      this.decoder!.decode(chunk);
      this.queuedForDecode++;
      remainingSamples--;

      if (this.inMp4?.isSampleSync(this.queuedForDecode)) {
        // Next frame is a keyframe, so flush.
        this.decoder!.flush();
      }

      this.decodeNextSamples();
    });
  }

  handleDecodedFrame(frame: VideoFrame) {
    this.decoderPromise = this.decoderPromise.then(async () => {
      if (this.framesDecoded % KEYFRAME_INTERVAL === 0) {
        // console.debug(
        //   `Flushing encoder at decoded frame ${this.framesDecoded}, keyframe incoming.`
        // );
        this.encoder!.flush();
      }

      const modifiedFrame = this.modifyFrame!(frame, this.framesDecoded);
      frame.close();

      this.encoder!.encode(modifiedFrame, { keyFrame: this.framesDecoded % KEYFRAME_INTERVAL === 0 });

      this.queuedForEncode++;

      if (this.framesDecoded % KEYFRAME_INTERVAL === 0) {
        createImageBitmap(modifiedFrame).then((previewBitmap) => {
          this.progressUpdate(undefined, previewBitmap);
        });
      }
      modifiedFrame.close();

      this.framesDecoded++;
      if (this.framesDecoded === this.expectedFrames - 1) {
        // console.debug(
        //   `Flushing encoder at decoded frame ${this.framesDecoded}, last frame.`
        // );
        this.encoder!.flush();
      }
    });
  }

  handleEncodedFrame(
    chunk: EncodedVideoChunk,
    metadata: EncodedVideoChunkMetadata
  ) {
    this.encoderPromise = this.encoderPromise.then(async () => {
      if (this.framesEncoded === 0) {
        this.outMp4!.setAvcC(metadata.decoderConfig?.description!);
      }
      this.framesEncoded++;

      // console.debug(`Encoded frame ${this.framesEncoded}`);
      const buffer = new ArrayBuffer(chunk.byteLength);
      chunk.copyTo(buffer);

      await this.outMp4!.writeSample(buffer, chunk.type === "key");
      this.progressUpdate(this.framesEncoded);

      if (this.framesEncoded === this.expectedFrames) {
        await this.outMp4?.close();
        postMessage({ type: VideoWorkerShared.MessageType.FILE_OUT } as VideoWorkerShared.FileOutMessage);
      } else {
        this.decodeNextSamples();
      }
    });
  }

  handleDecoderError(e: Error) {
    throw e;
  }

  handleEncoderError(e: Error) {
    throw e;
  }
}
