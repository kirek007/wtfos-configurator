import VideoWorkerShared from "./shared";

export interface VideoWorkerManagerCallbacks {
  onProgress: (progress?: number, preview?: ImageBitmap) => void;
  onProgressInit: (progressMax: number) => void;
  onFileOut?: () => void;
}

export default class VideoWorkerManager {
  callbacks?: VideoWorkerManagerCallbacks;
  worker: Worker;

  constructor() {
    this.worker = new Worker(
      new URL("./worker", import.meta.url),
      { type: "module" }
    );
    this.worker.onmessage = this.onMessage.bind(this);
  }

  setCallbacks(callbacks: VideoWorkerManagerCallbacks) {
    this.callbacks = callbacks;
  }

  onMessage(event: MessageEvent) {
    const message = event.data as VideoWorkerShared.Message;

    switch (message.type) {
      case VideoWorkerShared.MessageType.FILE_OUT: {
        if (this.callbacks?.onFileOut) {
          this.callbacks.onFileOut();
        }

        break;
      }

      case VideoWorkerShared.MessageType.PROGRESS_INIT: {
        this.callbacks?.onProgressInit(message.expectedFrames);
        break;
      }

      case VideoWorkerShared.MessageType.PROGRESS_UPDATE: {
        this.callbacks?.onProgress(message.currentFrame, message.preview);
        break;
      }

      default: {
        throw new Error("Unknown message type received");
      }
    }
  }

  postMessage(message: VideoWorkerShared.Message) {
    this.worker.postMessage(message);
  }
}
