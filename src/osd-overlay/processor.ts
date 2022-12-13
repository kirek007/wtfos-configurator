/* eslint-disable no-restricted-globals */
import { StreamDataView } from "stream-data-view";

import VideoWorkerShared from "./shared";
import { MP4Parser, MP4Writer } from "./mp4";
import { Avc1Box, AvcCBox } from "./mp4/types";

const MAX_QUEUE_SIZE = 60;
const KEYFRAME_INTERVAL = 15;
const TINY_FRAME_SIZE = 100;
const PROGRESS_UPDATE_INTERVAL = 100;

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

type ModifyFrameCallback = (frame: VideoFrame, index: number) => VideoFrame;

type ProgressInitCallback = (options: {
  expectedFrames: number;
  tinyFramesDetected: number;
}) => void;

type ProgressCallback = (options: {
  framesDecoded?: number;
  framesEncoded?: number;
  preview?: ImageBitmap;
  queuedForDecode?: number;
  queuedForEncode?: number;
  inEncoderQueue?: number;
  inDecoderQueue?: number;
}) => void;

export interface ProcessorOptions {
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
  tinyFramesDetected: number = 0;

  modifyFrame: ModifyFrameCallback;
  progressInit: ProgressInitCallback;
  progressUpdate: ProgressCallback;

  samplePromise = Promise.resolve();
  decoderPromise = Promise.resolve();
  encoderPromise = Promise.resolve();

  processResolve?: () => void;
  processReject?: (reason?: any) => void;

  progressUpdateIntervalHandle?: number;

  constructor(options: ProcessorOptions) {
    this.modifyFrame = options.modifyFrame;
    this.progressInit = options.progressInit;
    this.progressUpdate = options.progressUpdate;

    this.sendProgressUpdate = this.sendProgressUpdate.bind(this);
  }

  async open(file: File, outHandle: FileSystemFileHandle) {
    this.reset();

    this.inMp4 = new MP4Parser(file);
    await this.inMp4.parse();

    for (const [
      index,
      size,
    ] of this.inMp4.moov!.trak[0].mdia.minf.stbl.stsz.sampleSizes.entries()) {
      if (size <= TINY_FRAME_SIZE) {
        console.warn(`Frame ${index} is too small (${size} bytes)!`);
        this.tinyFramesDetected++;
      }
    }

    this.outMp4 = new MP4Writer(outHandle);
    await this.outMp4.open();

    return {
      width: this.inMp4.moov!.trak[0].tkhd.width,
      height: this.inMp4.moov!.trak[0].tkhd.height,
    };
  }

  process(options: { width: number; height: number }): Promise<void> {
    return new Promise((resolve, reject) => {
      this.processResolve = resolve;
      this.processReject = reject;

      try {
        const avc1box = this.inMp4!.moov!.trak[0].mdia.minf.stbl.stsd
          .entries[0] as Avc1Box;
        const codec =
          "avc1." +
          avc1box.avcC.profileIndication.toString(16).padStart(2, "0") +
          avc1box.avcC.profileCompatibility.toString(16).padStart(2, "0") +
          avc1box.avcC.levelIndication.toString(16).padStart(2, "0");

        this.decoder!.configure({
          codec: codec,
          codedWidth: this.inMp4!.moov!.trak[0].tkhd.width,
          codedHeight: this.inMp4!.moov!.trak[0].tkhd.height,
          description: avcCBoxToDescription(
            (this.inMp4!.moov!.trak[0].mdia.minf.stbl.stsd.entries[0] as Avc1Box)
              .avcC
          ),
        });
      } catch (e: any) {
        throw new VideoWorkerShared.DecoderConfigureError(e);
      }

      try {
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
      } catch (e: any) {
        throw new VideoWorkerShared.EncoderConfigureError(e);
      }

      this.outMp4?.setDisplaySize({
        width: options.width,
        height: options.height,
      });

      this.expectedFrames = this.inMp4!.moov!.trak[0].mdia.mdhd.duration;
      this.progressInit({
        expectedFrames: this.expectedFrames,
        tinyFramesDetected: this.tinyFramesDetected,
      });

      this.progressUpdateIntervalHandle = self.setInterval(this.sendProgressUpdate, PROGRESS_UPDATE_INTERVAL);

      this.decodeNextSamples();
    });
  }

  private reset() {
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

    this.expectedFrames = 0;
    this.framesDecoded = 0;
    this.framesEncoded = 0;
    this.queuedForDecode = 0;
    this.queuedForEncode = 0;
    this.tinyFramesDetected = 0;

    this.samplePromise = Promise.resolve();
    this.decoderPromise = Promise.resolve();
    this.encoderPromise = Promise.resolve();

    this.processResolve = undefined;
    this.processReject = undefined;

    if (this.progressUpdateIntervalHandle) {
      clearInterval(this.progressUpdateIntervalHandle);
    }
  }

  private decodeNextSamples() {
    this.samplePromise = this.samplePromise.then(async () => {
      let remainingSamples = this.expectedFrames - this.queuedForDecode;
      if (remainingSamples <= 0) {
        return;
      }

      if (
        (this.decoder!.decodeQueueSize > MAX_QUEUE_SIZE ||
          this.encoder!.encodeQueueSize > MAX_QUEUE_SIZE) &&
        remainingSamples > MAX_QUEUE_SIZE
      ) {
        return;
      }

      const sample = await this.inMp4!.getSample(this.queuedForDecode);
      if (sample.data.byteLength <= TINY_FRAME_SIZE) {
        // TODO: I think this needs handled in order, maybe? Works OK for me.
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

      if (this.inMp4?.isSampleSync(this.queuedForDecode)) {
        // Next frame is a keyframe, so flush.
        this.decoder!.flush();
      }

      this.decodeNextSamples();
    });
  }

  private handleDecodedFrame(frame: VideoFrame) {
    this.decoderPromise = this.decoderPromise.then(async () => {
      if (this.framesDecoded % KEYFRAME_INTERVAL === 0) {
        this.encoder!.flush();
      }

      const modifiedFrame = this.modifyFrame!(frame, this.framesDecoded);
      frame.close();

      this.encoder!.encode(modifiedFrame, {
        keyFrame: this.framesDecoded % KEYFRAME_INTERVAL === 0,
      });

      this.queuedForEncode++;
      if (this.framesDecoded % KEYFRAME_INTERVAL === 0) {
        createImageBitmap(modifiedFrame).then((previewBitmap) => {
          this.progressUpdate({ preview: previewBitmap });
        });
      }
      modifiedFrame.close();

      this.framesDecoded++;
      if (this.framesDecoded === this.expectedFrames - 1) {
        this.encoder!.flush();
      }
    });
  }

  private handleEncodedFrame(
    chunk: EncodedVideoChunk,
    metadata: EncodedVideoChunkMetadata
  ) {
    this.encoderPromise = this.encoderPromise.then(async () => {
      if (this.framesEncoded === 0) {
        this.outMp4!.setAvcC(metadata.decoderConfig?.description!);
      }
      this.framesEncoded++;

      const buffer = new ArrayBuffer(chunk.byteLength);
      chunk.copyTo(buffer);

      await this.outMp4!.writeSample(buffer, chunk.type === "key");

      if (this.framesEncoded === this.expectedFrames) {
        self.clearInterval(this.progressUpdateIntervalHandle!);
        this.sendProgressUpdate();

        await this.outMp4?.close();
        this.processResolve!();
      } else {
        this.decodeNextSamples();
      }
    });
  }

  private handleDecoderError(e: Error) {
    this.processReject!(new VideoWorkerShared.DecoderError(e.message));
    throw e;
  }

  private handleEncoderError(e: Error) {
    this.processReject!(new VideoWorkerShared.EncoderError(e.message));
    throw e;
  }

  private sendProgressUpdate() {
    this.progressUpdate({
      framesDecoded: this.framesDecoded,
      framesEncoded: this.framesEncoded,
      queuedForDecode: this.queuedForDecode,
      queuedForEncode: this.queuedForEncode,
      inDecoderQueue: this.decoder?.decodeQueueSize,
      inEncoderQueue: this.encoder?.encodeQueueSize,
    });
  }
}
