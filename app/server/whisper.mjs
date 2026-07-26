/**
 * TRANSCRIPTION — subtitles and markers, for English and Persian.
 *
 * Runs whisper.cpp locally. Nothing is uploaded: the editor's footage is client
 * material, and a transcription service would mean shipping it to a third party
 * to save a download.
 *
 * NOT BUNDLED, DOWNLOADED. The installer is already 155 MB, and the models run
 * from 142 MB to 1.6 GB — bundling even the smallest would grow the app for
 * every user who never opens this screen, and bundling one big enough for
 * Persian would double the installer. Both the binary and the chosen model are
 * fetched once, into the app's data folder, and reused.
 *
 * Audio is extracted with Remotion's own compositor rather than ffmpeg. The
 * compositor already ships with the renderer, so this adds nothing to the
 * install and cannot drift from a separately-versioned binary.
 */

import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { httpFetchDirectFirst } from "./http.mjs";

/**
 * The BLAS build, not the plain one. It is 19 MB against 7 MB and roughly twice
 * as fast on CPU, which on a 20-minute interview is the difference between a
 * coffee break and a lunch break. There is no GPU build here on purpose: the
 * CUDA packages are 265 MB and 646 MB and only help on NVIDIA hardware.
 */
const WHISPER_RELEASE = "v1.9.1";
const WHISPER_ZIP = `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_RELEASE}/whisper-blas-bin-x64.zip`;

/**
 * Multilingual models only. The `.en` variants are smaller and better at
 * English, and completely unable to handle Persian — offering them would put a
 * silent failure one dropdown away.
 */
export const MODELS = [
  {
    id: "base",
    label: "Base — fastest, roughest",
    file: "ggml-base.bin",
    mb: 142,
    note: "Fine for clear English. Struggles with Persian.",
  },
  {
    id: "small",
    label: "Small — balanced",
    file: "ggml-small.bin",
    mb: 466,
    note: "The sensible default for mixed English and Persian.",
  },
  {
    id: "medium",
    label: "Medium — accurate",
    file: "ggml-medium.bin",
    mb: 1533,
    note: "Noticeably better on Persian. Slower.",
  },
  {
    id: "large-v3-turbo",
    label: "Large v3 Turbo — best",
    file: "ggml-large-v3-turbo.bin",
    mb: 1624,
    note: "Best Persian accuracy, and faster than Medium despite the size.",
  },
];

export const LANGUAGES = [
  { id: "auto", label: "Detect automatically" },
  { id: "en", label: "English" },
  { id: "fa", label: "Persian / فارسی" },
];

const modelUrl = (file) =>
  `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${file}`;

const ROOT = () =>
  process.env.MG_WHISPER_DIR ?? path.join(process.cwd(), ".whisper");

const binDir = () => path.join(ROOT(), "bin");
const modelDir = () => path.join(ROOT(), "models");

/**
 * Find the CLI, preferring whisper-cli.exe over main.exe — and the order is not
 * cosmetic.
 *
 * The binary was renamed, and current releases still ship a `main.exe` that
 * only prints "this binary is deprecated" and exits 1. Taking whichever name
 * turned up first in the directory walk therefore worked or failed depending on
 * filesystem ordering, and the failure surfaced as a bare "exited 1". Collect
 * every candidate, then choose.
 */
const findCli = () => {
  const dir = binDir();
  if (!existsSync(dir)) return null;

  const found = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === "whisper-cli.exe" || entry.name === "main.exe") {
        found.push(full);
      }
    }
  }

  return (
    found.find((f) => path.basename(f) === "whisper-cli.exe") ?? found[0] ?? null
  );
};

export const whisperStatus = () => {
  const cli = findCli();
  const installed = MODELS.filter((m) =>
    existsSync(path.join(modelDir(), m.file)),
  ).map((m) => m.id);
  return { engineReady: Boolean(cli), models: installed };
};

/* ------------------------------------------------------------------ *
 * Downloads
 * ------------------------------------------------------------------ */

/**
 * Streamed to disk, and to a temporary name first.
 *
 * A 1.6 GB model buffered in memory is a crash on a modest machine, and a
 * partial file left at the real path would look installed forever after — the
 * next run would load a truncated model and fail somewhere far less obvious.
 */
const download = async (url, destination, onProgress) => {
  const response = await httpFetchDirectFirst(url);
  if (!response.ok) {
    throw new Error(`Download failed (HTTP ${response.status}) — ${url}`);
  }

  const total = Number(response.headers.get("content-length") ?? 0);
  let received = 0;
  let lastReport = 0;

  const temporary = `${destination}.part`;
  mkdirSync(path.dirname(destination), { recursive: true });

  const body = Readable.fromWeb(response.body);
  body.on("data", (chunk) => {
    received += chunk.length;
    const now = Date.now();
    // Throttled: a progress callback per chunk floods the job object.
    if (onProgress && now - lastReport > 250) {
      lastReport = now;
      onProgress(total ? Math.round((received / total) * 100) : null, received, total);
    }
  });

  await pipeline(body, createWriteStream(temporary));
  await rename(temporary, destination);
};

export const ensureEngine = async (onProgress) => {
  if (findCli()) return findCli();

  const zip = path.join(ROOT(), "whisper.zip");
  await download(WHISPER_ZIP, zip, (percent) =>
    onProgress?.({ stage: "engine", percent }),
  );

  onProgress?.({ stage: "engine", percent: 100, message: "Extracting…" });

  /*
    PowerShell rather than a zip library. Node has no built-in unzip, and this
    app already only ships for Windows — adding a dependency to the render
    server for one extraction is a worse trade than calling the tool that is
    guaranteed present.
  */
  await run("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${binDir()}' -Force`,
  ]);

  rmSync(zip, { force: true });

  const cli = findCli();
  if (!cli) throw new Error("Downloaded the engine but couldn't find whisper-cli.exe in it.");
  return cli;
};

export const ensureModel = async (modelId, onProgress) => {
  const model = MODELS.find((m) => m.id === modelId);
  if (!model) throw new Error(`Unknown model "${modelId}".`);

  const destination = path.join(modelDir(), model.file);
  if (existsSync(destination) && statSync(destination).size > 1_000_000) {
    return destination;
  }

  await download(modelUrl(model.file), destination, (percent, received, total) =>
    onProgress?.({
      stage: "model",
      percent,
      message: total
        ? `${(received / 1048576).toFixed(0)} of ${(total / 1048576).toFixed(0)} MB`
        : undefined,
    }),
  );

  return destination;
};

/* ------------------------------------------------------------------ *
 * Running
 * ------------------------------------------------------------------ */

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const { onStderr, onStdout, ...spawnOptions } = options;
    const child = spawn(command, args, { windowsHide: true, ...spawnOptions });

    // Both streams are kept: whisper.cpp writes its progress and some of its
    // failures to stderr and others to stdout, and an error message that says
    // only "exited 1" is worth nothing to whoever has to act on it.
    let stderr = "";
    let stdout = "";
    child.stderr?.on("data", (d) => {
      stderr += String(d);
      onStderr?.(String(d));
    });
    child.stdout?.on("data", (d) => {
      stdout += String(d);
      onStdout?.(String(d));
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve();
      const detail = `${stderr}\n${stdout}`.trim().split("\n").filter(Boolean).slice(-5).join("\n");
      reject(new Error(detail || `${path.basename(command)} exited with code ${code}`));
    });
  });

const AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".flac", ".ogg"]);

/**
 * whisper.cpp reads wav, mp3, flac and ogg directly and resamples internally,
 * so an audio file needs no preparation. Video does — that is what the
 * compositor extraction is for.
 */
const prepareAudio = async (source, workDir) => {
  if (AUDIO_EXTENSIONS.has(path.extname(source).toLowerCase())) return source;

  const { extractAudio } = await import(
    process.env.MG_ENGINE_ROOT
      ? new URL(
          `file:///${path.join(process.env.MG_ENGINE_ROOT, "node_modules", "@remotion", "renderer", "dist", "index.js").replace(/\\/g, "/")}`,
        ).href
      : "@remotion/renderer"
  );

  const output = path.join(workDir, "audio.wav");
  await extractAudio({ videoSource: source, audioOutput: output, logLevel: "error" });
  return output;
};

const TIMECODE = /(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/;

/** SRT timestamps → seconds, for the marker list. */
const toSeconds = (stamp) => {
  const m = stamp.match(TIMECODE);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
};

/** Seconds → Premiere's HH:MM:SS:FF timecode. */
const toTimecode = (seconds, fps) => {
  const whole = Math.floor(seconds);
  const frames = Math.round((seconds - whole) * fps);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(Math.floor(whole / 3600))}:${pad(Math.floor(whole / 60) % 60)}:${pad(whole % 60)}:${pad(Math.min(frames, fps - 1))}`;
};

const parseSrt = (srt) => {
  const cues = [];
  for (const block of srt.trim().split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/);
    const timing = lines.find((l) => l.includes("-->"));
    if (!timing) continue;
    const [from, to] = timing.split("-->").map((s) => s.trim());
    const text = lines.slice(lines.indexOf(timing) + 1).join(" ").trim();
    if (text) cues.push({ start: toSeconds(from), end: toSeconds(to), text });
  }
  return cues;
};

/* ------------------------------------------------------------------ *
 * Premiere markers
 * ------------------------------------------------------------------ */

const xmlEscape = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * NTSC rates are stored as the next whole number plus an `ntsc` flag — there is
 * no way to write 29.97 in a `<timebase>`, which only accepts an integer.
 */
const rateOf = (fps) => {
  const ntsc = Math.abs(fps - Math.round(fps)) > 0.001;
  return { timebase: Math.round(fps), ntsc: ntsc ? "TRUE" : "FALSE" };
};

/**
 * FCP7 XML — the native way into Premiere.
 *
 * Premiere has never imported marker CSVs; that always needed a third-party
 * panel. It does import FCP7 XML directly (File > Import), and honours
 * `<marker>` elements on the sequence — so the markers arrive with no extension
 * installed and no manual placement.
 *
 * Structure follows Apple's xmeml v4 as Premiere consumes it. It is fussier
 * than it looks: `<in>` and `<out>` are FRAME NUMBERS rather than seconds or
 * timecode, the sequence needs a rate and video format block or the import
 * fails with a generic error, and marker elements must be children of
 * `<sequence>`, after `<timecode>`.
 */
const toFcpXml = (cues, fps, name, { width = 1920, height = 1080 } = {}) => {
  const { timebase, ntsc } = rateOf(fps);
  const frames = (seconds) => Math.round(seconds * fps);
  const last = cues[cues.length - 1];

  const rate = `<rate><timebase>${timebase}</timebase><ntsc>${ntsc}</ntsc></rate>`;

  const markers = cues
    .map((c, i) => {
      /*
        A one-frame marker collapses to nothing on the timeline and becomes
        impossible to grab, so every marker spans at least a frame. Whisper can
        also emit a cue whose end equals its start on very short utterances.
      */
      const start = frames(c.start);
      const end = Math.max(frames(c.end), start + 1);
      return [
        "\t\t<marker>",
        `\t\t\t<comment>${xmlEscape(c.text)}</comment>`,
        `\t\t\t<name>${xmlEscape(`${i + 1}. ${c.text.slice(0, 40)}`)}</name>`,
        `\t\t\t<in>${start}</in>`,
        `\t\t\t<out>${end}</out>`,
        "\t\t</marker>",
      ].join("\n");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<xmeml version="4">
	<sequence id="sequence-1">
		<duration>${frames(last?.end ?? 0) + 1}</duration>
		${rate}
		<name>${xmlEscape(name)}</name>
		<media>
			<video>
				<format>
					<samplecharacteristics>
						${rate}
						<width>${width}</width>
						<height>${height}</height>
						<anamorphic>FALSE</anamorphic>
						<pixelaspectratio>square</pixelaspectratio>
						<fielddominance>none</fielddominance>
						<colordepth>24</colordepth>
					</samplecharacteristics>
				</format>
				<track>
					<enabled>TRUE</enabled>
					<locked>FALSE</locked>
				</track>
			</video>
		</media>
		<timecode>
			${rate}
			<string>00:00:00:00</string>
			<frame>0</frame>
			<displayformat>${ntsc === "TRUE" ? "DF" : "NDF"}</displayformat>
		</timecode>
${markers}
	</sequence>
</xmeml>
`;
};

/**
 * Kept alongside the XML for the marker-import panels that read a CSV, and
 * because it opens in a spreadsheet when someone just wants the timings.
 */
const toMarkerCsv = (cues, fps) =>
  [
    "Marker Name,Description,In,Out,Duration,Marker Type",
    ...cues.map((c, i) => {
      const name = c.text.replace(/"/g, "'").slice(0, 60);
      return [
        `"${i + 1}. ${name}"`,
        `"${c.text.replace(/"/g, "'")}"`,
        toTimecode(c.start, fps),
        toTimecode(c.end, fps),
        toTimecode(Math.max(c.end - c.start, 0), fps),
        "Comment",
      ].join(",");
    }),
  ].join("\n");

export const transcribe = async ({
  source,
  model = "small",
  language = "auto",
  fps = 30,
  outputDir,
  onProgress,
}) => {
  if (!source || !existsSync(source)) {
    throw new Error(`Can't find that file: ${source}`);
  }

  const cli = await ensureEngine(onProgress);
  const modelPath = await ensureModel(model, onProgress);

  const work = path.join(ROOT(), "work");
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });

  onProgress?.({ stage: "audio", message: "Extracting audio…" });
  const audio = await prepareAudio(source, work);

  const base = path.basename(source).replace(/\.[^.]+$/, "");
  const stem = path.join(work, "out");

  onProgress?.({ stage: "transcribe", message: "Transcribing…", percent: 0 });

  await run(
    cli,
    [
      "-m", modelPath,
      "-f", audio,
      "-l", language,
      "-osrt",
      "-ovtt",
      "-otxt",
      "-of", stem,
      // Shorter cues. Whisper's default segments run long enough to overflow a
      // vertical frame, and a caption nobody can read in time is worse than no
      // caption. Splitting on word boundaries keeps Persian words intact.
      "-ml", "42",
      "-sow",
      "-pp",
    ],
    {
      onStderr: (chunk) => {
        // whisper.cpp reports progress on stderr as "progress = NN%".
        const match = chunk.match(/progress\s*=\s*(\d+)%/);
        if (match) {
          onProgress?.({
            stage: "transcribe",
            percent: Number(match[1]),
            message: "Transcribing…",
          });
        }
      },
    },
  );

  const srt = await readFile(`${stem}.srt`, "utf8");
  const cues = parseSrt(srt);
  if (!cues.length) {
    throw new Error(
      "Whisper produced no speech. Check the file actually has audio, and that " +
        "the language is right.",
    );
  }

  mkdirSync(outputDir, { recursive: true });
  const safe = base.replace(/[^a-z0-9-_ ]+/gi, "-").trim() || "transcript";

  const written = {
    srt: path.join(outputDir, `${safe}.srt`),
    markersXml: path.join(outputDir, `${safe} markers.xml`),
    vtt: path.join(outputDir, `${safe}.vtt`),
    txt: path.join(outputDir, `${safe}.txt`),
    markersCsv: path.join(outputDir, `${safe} markers.csv`),
  };

  await writeFile(written.srt, srt, "utf8");
  await writeFile(written.markersXml, toFcpXml(cues, fps, `${safe} — transcript`), "utf8");
  await writeFile(written.vtt, await readFile(`${stem}.vtt`, "utf8"), "utf8");
  await writeFile(written.txt, await readFile(`${stem}.txt`, "utf8"), "utf8");
  // BOM: Excel and several Premiere marker extensions read the CSV as the
  // system codepage otherwise, which mangles every Persian caption.
  await writeFile(written.markersCsv, "﻿" + toMarkerCsv(cues, fps), "utf8");

  rmSync(work, { recursive: true, force: true });

  return {
    files: written,
    cues: cues.length,
    duration: cues[cues.length - 1]?.end ?? 0,
    preview: cues.slice(0, 5).map((c) => c.text),
  };
};
