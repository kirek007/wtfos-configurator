import React from "react";
import {
  Alert,
  Button,
  Container,
  Grid,
  LinearProgress,
  Stack,
} from "@mui/material";
import { useTranslation } from "react-i18next";

import FileDrop, { useFileDropState } from "./FileDrop";
import VideoWorkerManager from "../../osd-overlay/manager";
import VideoWorkerShared from "../../osd-overlay/shared";


import Header from "../navigation/Header";


const videoManager = new VideoWorkerManager();

export default function OsdOverlay() {
  const { t } = useTranslation("osdOverlay");

  const canvasRef = React.useRef(null);

  const [files, setFiles] = useFileDropState();
  const videoFile = files.videoFile;
  const osdFile = files.osdFile;
  const fontFiles = React.useMemo(() => ({
    sd1: files.fontFileSd1,
    sd2: files.fontFileSd2,
    hd1: files.fontFileHd1,
    hd2: files.fontFileHd2,
  }), [files]);

  const [progress, setProgress] = React.useState(0);
  const [progressMax, setProgressMax] = React.useState(0);

  const [inProgress, setInProgress] = React.useState(false);
  const [startedOnce, setStartedOnce] = React.useState(false);

  const [error, setError] = React.useState(null);

  const startEnabled = (
    videoFile &&
    osdFile &&
    fontFiles.sd1 &&
    fontFiles.sd2 &&
    fontFiles.hd1 &&
    fontFiles.hd2 &&
    !inProgress
  );
  const progressValue = progressMax ? (progress / progressMax) * 100 : 0;

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = canvas.width * 9 / 16;
  }, [canvasRef]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    videoManager.setCallbacks({
      onComplete: () => {
        setInProgress(false);
      },
      onError: (e) => {
        setError(e);
        setInProgress(false);
      },
      onProgressUpdate: (progress, preview) => {
        if (progress) {
          setProgress(progress);
        }

        if (preview) {
          const scale = Math.min(
            canvas.width / preview.width,
            canvas.height / preview.height
          );

          const width = preview.width * scale;
          const height = preview.height * scale;
          const x = (canvas.width - width) / 2;
          const y = (canvas.height - height) / 2;

          ctx.drawImage(preview, x, y, width, height);
        }
      },
      onProgressInit: setProgressMax,

    });
  }, [canvasRef, setInProgress, setProgress, setProgressMax]);

  const handleStart = React.useCallback(async () => {
    const handle = await window.showSaveFilePicker({
      excludeAcceptAllOption: true,
      suggestedName: videoFile.name.replace(/\.[^/.]+$/, "") + "-osd.mp4",
      types: [
        {
          description: "MP4",
          accept: { "video/mp4": [".mp4"] },
        },
      ],
    });

    setInProgress(true);
    setStartedOnce(true);

    videoManager.start({
      type: VideoWorkerShared.MessageType.START,
      fontFiles: fontFiles,
      osdFile: osdFile,
      videoFile: videoFile,
      outHandle: handle,
    });
  }, [
    fontFiles,
    osdFile,
    setInProgress,
    setStartedOnce,
    videoFile,
  ]);

  const handleOnFilesChanged = React.useCallback((files) => {
    setFiles(files);
  }, [setFiles]);

  return (
    <Container
      fixed
    >
      <Header />

      <Stack>
        <Alert
          severity="info"
          sx={{ mb: 2 }}
        >
          OSD recording is an opt-in feature on the goggle side.
          <pre style={{ marginBottom: 0 }}>
            $ package-config set msp-osd rec_enabled true
            <br />
            $ package-config apply msp-osd
          </pre>

          <br />

          <strong>
            Only video files directly from the goggles are supported.
          </strong>

          <br />

          Re-encoded, merged, or otherwise modified video files will cause
          problems!
        </Alert>

        <Grid
          container
          spacing={2}
        >
          <Grid
            item
            md={3}
            xs={12}
          >
            <Stack
              spacing={2}
              sx={{ height: "100%" }}
            >
              <FileDrop
                files={files}
                onChange={handleOnFilesChanged}
              />

              <LinearProgress
                color={
                  (inProgress
                    ? "primary"
                    : startedOnce
                      ? "success"
                      : "primary")
                }
                value={progressValue}
                variant={
                  inProgress && progressValue >= 99 ? "indeterminate" : "determinate"
                }
              />

              <Button
                disabled={!startEnabled}
                onClick={handleStart}
                variant="contained"
              >
                {inProgress ? t("processing") : t("start")}
              </Button>
            </Stack>
          </Grid>

          <Grid
            item
            md={9}
            xs={12}
          >
            <Stack
              spacing={2}
            >
              {error && (
                <Alert severity="error">
                  {error.message}
                </Alert>
              )}

              <canvas
                ref={canvasRef}
                style={{
                  backgroundColor: "black",
                  borderRadius: 4,
                  flexGrow: 1,
                }}
              />
            </Stack>
          </Grid>
        </Grid>
      </Stack>
    </Container>
  );
}
