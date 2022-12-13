/* eslint-disable react/destructuring-assignment */
/* eslint-disable react/no-unused-prop-types */

import React from "react";
import PropTypes from "prop-types";

import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Stack,
  Typography,
} from "@mui/material";

import SettingsIcon from "@mui/icons-material/Settings";

export default function DebugStats(props) {
  const statsTableDef = [
    {
      key: "expectedFrames",
      name: "Expected Frames",
    },
    {
      key: "tinyFramesDetected",
      name: "Tiny Frames Detected",
    },
    {
      key: "framesDecoded",
      name: "Frames Decoded",
    },
    {
      key: "framesEncoded",
      name: "Frames Encoded",
    },
    {
      key: "queuedForDecode",
      name: "Queued for Decode",
    },
    {
      key: "queuedForEncode",
      name: "Queued for Encode",
    },
    {
      key: "inDecoderQueue",
      name: "In Decoder Queue",
    },
    {
      key: "inEncoderQueue",
      name: "In Encoder Queue",
    },
  ];

  const statsTableRows = [];
  for (const stat of statsTableDef) {
    const value = props[stat.key];
    statsTableRows.push(
      <TableRow key={stat.key}>
        <TableCell>
          {stat.name}
        </TableCell>

        <TableCell>
          {value ?? "???"}
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableContainer
      component={Paper}
      elevation={0}
    >
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell
              colSpan={2}
            >
              <Stack
                alignItems="center"
                direction="row"
                justifyContent="center"
                spacing={0.5}
                sx={{ p: 1 }}
              >
                <SettingsIcon />

                <Typography variant="body1">
                  Debug Stats
                </Typography>
              </Stack>
            </TableCell>
          </TableRow>
        </TableHead>

        <TableBody>
          {statsTableRows}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

DebugStats.propTypes = {
  expectedFrames: PropTypes.number,
  framesDecoded: PropTypes.number,
  framesEncoded: PropTypes.number,
  inDecoderQueue: PropTypes.number,
  inEncoderQueue: PropTypes.number,
  queuedForDecode: PropTypes.number,
  queuedForEncode: PropTypes.number,
  tinyFramesDetected: PropTypes.number,
};

DebugStats.defaultProps = {
  expectedFrames: null,
  framesDecoded: null,
  framesEncoded: null,
  inDecoderQueue: null,
  inEncoderQueue: null,
  queuedForDecode: null,
  queuedForEncode: null,
  tinyFramesDetected: null,
};
