import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const STOP_CODE = process.env.STOP_CODE || "8_11550"; // AV.ALGORTA-VITORIA, San Fernando de Henares
const CRTM_BASE = "https://www.crtm.es/widgets/api";

const app = express();
app.use(express.static(path.join(__dirname, "public")));

// The CRTM widget API returns a single object instead of an array when
// there's only one result, so every list-shaped field needs normalizing.
const asArray = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);

app.get("/api/next-bus", async (req, res) => {
  const stopCode = req.query.stop || STOP_CODE;

  try {
    const [stopInfoRes, stopTimesRes] = await Promise.all([
      fetch(`${CRTM_BASE}/GetStopsInformation.php?codStop=${encodeURIComponent(stopCode)}`),
      fetch(
        `${CRTM_BASE}/GetStopsTimes.php?codStop=${encodeURIComponent(stopCode)}&type=1&orderBy=2&stopTimesByIti=3`
      ),
    ]);

    if (!stopInfoRes.ok || !stopTimesRes.ok) {
      return res.status(502).json({ error: "CRTM API request failed" });
    }

    const stopInfo = await stopInfoRes.json();
    const stopTimes = await stopTimesRes.json();

    const stop = stopTimes.stopTimes?.stop;
    const arrivals = asArray(stopTimes.stopTimes?.times?.Time)
      .map((t) => ({
        line: t.line?.shortDescription,
        destination: t.destination,
        time: t.time,
        minutes: Math.max(0, Math.round((new Date(t.time) - new Date()) / 60000)),
      }))
      .sort((a, b) => a.minutes - b.minutes);

    const lines = asArray(stopInfo.stops?.StopInformation?.lines?.Line).map((l) => ({
      code: l.shortDescription,
      description: l.description,
    }));

    res.json({
      stop: { code: stopCode, name: stop?.name },
      lines,
      arrivals,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Could not reach CRTM API" });
  }
});

app.listen(PORT, () => {
  console.log(`Next-bus dashboard running at http://localhost:${PORT} (stop ${STOP_CODE})`);
});
