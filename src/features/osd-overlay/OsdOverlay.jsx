import React from "react";
import {
  Alert,
  Button,
  Container,
  Grid,
  LinearProgress,
  Stack,
  TextField,
} from "@mui/material";
import { useTranslation } from "react-i18next";

import VideoWorkerManager from "../../osd-overlay/manager";
import VideoWorkerShared from "../../osd-overlay/shared";


import Header from "../navigation/Header";


const videoManager = new VideoWorkerManager();

export default function OsdOverlay() {
  const { t } = useTranslation("osdOverlay");

  const canvasRef = React.useRef(null);

  const [videoFile, setVideoFile] = React.useState(null);
  const [osdFile, setOsdFile] = React.useState(null);
  const [fontFiles, setFontFiles] = React.useState(null);

  const [progress, setProgress] = React.useState(0);
  const [progressMax, setProgressMax] = React.useState(0);

  const [inProgress, setInProgress] = React.useState(false);
  const [startedOnce, setStartedOnce] = React.useState(false);

  const [error, setError] = React.useState(null);

  const startEnabled = true;
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

  const handleVideoFileChange = React.useCallback((e) => {
    setVideoFile(e.target.files[0]);
  }, [setVideoFile]);

  const handleOsdFileChange = React.useCallback((e) => {
    setOsdFile(e.target.files[0]);
  }, [setOsdFile]);

  const handleFontFilesChange = React.useCallback((e) => {
    setFontFiles([...e.target.files]);
  }, [setFontFiles]);

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
              <TextField
                InputLabelProps={{ shrink: true }}
                disabled={inProgress}
                id="videoFile"
                inputProps={{ accept: ".mp4,video/mp4" }}
                label={t("videoFile")}
                onChange={handleVideoFileChange}
                type="file"
                variant="filled"
              />

              <TextField
                InputLabelProps={{ shrink: true }}
                disabled={inProgress}
                id="osdFile"
                inputProps={{ accept: ".osd" }}
                label={t("osdFile")}
                onChange={handleOsdFileChange}
                type="file"
                variant="filled"
              />

              <TextField
                InputLabelProps={{ shrink: true }}
                disabled={inProgress}
                id="fontFiles"
                inputProps={{
                  accept: ".bin",
                  multiple: true,
                }}
                label={t("fontFiles")}
                onChange={handleFontFilesChange}
                type="file"
                variant="filled"
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
