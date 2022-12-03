namespace VideoWorkerShared {
  export const enum MessageType {
    COMPLETE,
    ERROR,
    PROGRESS_INIT,
    PROGRESS_UPDATE,
    START,
  }

  export interface CompleteMessage {
    type: MessageType.COMPLETE;
  }

  export interface ErrorMessage {
    type: MessageType.ERROR;
    error: Error;
  }

  export interface ProgressInitMessage {
    type: MessageType.PROGRESS_INIT;
    expectedFrames: number;
  }

  export interface ProgressUpdateMessage {
    type: MessageType.PROGRESS_UPDATE;
    currentFrame?: number;
    preview?: ImageBitmap;
  }

  export interface StartMessage {
    type: MessageType.START;
    fontFiles: File[];
    osdFile: File;
    videoFile: File;
    outHandle: FileSystemFileHandle;
  }

  export type Message =
    | CompleteMessage
    | ErrorMessage
    | ProgressInitMessage
    | ProgressUpdateMessage
    | StartMessage;
}

export default VideoWorkerShared;
