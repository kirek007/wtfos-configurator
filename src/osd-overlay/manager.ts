import VideoWorkerShared from "./shared";

export interface VideoWorkerManagerCallbacks {
  onComplete?: () => void;
  onError?: (error: Error) => void;
  onProgressInit: (progressMax: number) => void;
  onProgressUpdate: (progress?: number, preview?: ImageBitmap) => void;
}

export default class VideoWorkerManager {
  callbacks?: VideoWorkerManagerCallbacks;
  worker: Worker;

  constructor() {
    this.worker = new Worker(
      new URL("./worker", import.meta.url),
      { type: "module" }
    );

    this.worker.addEventListener("message", this.onMessage.bind(this));
  }

  setCallbacks(callbacks: VideoWorkerManagerCallbacks) {
    this.callbacks = callbacks;
  }

  onMessage(event: MessageEvent) {
    const message = event.data as VideoWorkerShared.Message;

    switch (message.type) {
      case VideoWorkerShared.MessageType.COMPLETE: {
        this.callbacks?.onComplete?.();
        break;
      }

      case VideoWorkerShared.MessageType.ERROR: {
        this.callbacks?.onError?.(message.error);
        break;
      }

      case VideoWorkerShared.MessageType.PROGRESS_INIT: {
        this.callbacks?.onProgressInit(message.expectedFrames);
        break;
      }

      case VideoWorkerShared.MessageType.PROGRESS_UPDATE: {
        this.callbacks?.onProgressUpdate(message.currentFrame, message.preview);
        break;
      }

      default: {
        throw new Error("Unknown message type received");
      }
    }
  }

  start(options: {
    fontFiles: File[],
    osdFile: File,
    outHandle: FileSystemFileHandle
    videoFile: File,
  }) {
    this.postMessage({
      type: VideoWorkerShared.MessageType.START,
      ...options,
    });
  }

  private postMessage(message: VideoWorkerShared.Message) {
    this.worker.postMessage(message);
  }
}
