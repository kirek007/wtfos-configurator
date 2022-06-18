import React,
{
  useCallback,
  useEffect,
  useState,
} from "react";
import { useLocation } from "react-router-dom";

import { useCookies } from "react-cookie";
import ReactGA from "react-ga4";

import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Snackbar from "@mui/material/Snackbar";
import Typography from "@mui/material/Typography";

export default function CookieBanner() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [cookie, setCookie] = useCookies(["consentClicked", "consentGiven"]);

  const handleAccept = useCallback(() => {
    setOpen(false);

    setCookie("consentClicked", true);
    setCookie("consentGiven", true);

    ReactGA._gtag("consent", "update", { analytics_storage: "granted" });
    ReactGA.send({
      hitType: "pageview",
      page: location.pathname,
    });
  }, [location.pathname, setCookie]);

  const handleDecline = useCallback(() => {
    setOpen(false);

    setCookie("consentClicked", true);
    setCookie("consentGiven", false);
  }, [setCookie]);

  useEffect(() => {
    if(!cookie.consentClicked) {
      setOpen(true);
    }
  }, [cookie.consentClicked]);

  return(
    <Snackbar
      anchorOrigin={{
        vertical: "bottom",
        horizontal: "center",
      }}
      open={open}
      sx={{
        bottom: "0px !important",
        width: "100%",
      }}
    >
      <Container fixed>
        <Paper>
          <Box sx={{ padding: 1 }}>
            <Grid container>
              <Grid
                item
                md={9}
                xs={12}
              >
                <Typography
                  margin={1}
                >
                  This page uses Google Analytics to improve the user experience. Your data will not be shared with any 3rd parties nor to target any advertising. Please allow the use of cookies for these purposes.
                </Typography>
              </Grid>

              <Grid
                align="right"
                item
                md={3}
                sx={{
                  display: "flex",
                  alignItems: "end",
                  justifyContent: "end",
                  marginBottom: 1,
                }}
                xs={12}
              >
                <Button
                  onClick={handleDecline}
                  sx={{ marginRight: 2 }}
                  variant="outlined"
                >
                  Decline
                </Button>

                <Button
                  onClick={handleAccept}
                  sx={{ marginRight: 1 }}
                  variant="contained"
                >
                  Accept
                </Button>
              </Grid>
            </Grid>
          </Box>
        </Paper>
      </Container>
    </Snackbar>
  );
}
