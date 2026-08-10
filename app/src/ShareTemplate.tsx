/**
 * Send a template to someone else.
 *
 * A pasted template lives in this browser's storage and nowhere else, so
 * without this it cannot be handed to a colleague, backed up before a
 * reinstall, or submitted for inclusion — which TERMS.md explicitly invites
 * people to do. The storage module has claimed templates were "exportable as a
 * file" since it was written; this is that claim becoming true.
 *
 * Two routes because two situations. A file is what you attach to a message or
 * keep in a project folder. The clipboard is what you drop straight into a chat
 * window, and it is the same text the Add screen already accepts — so sharing
 * and importing are the same format with no conversion step between them.
 */

import { useState } from "react";
import type { TemplateFile } from "@engine/authoring/format";

export const ShareTemplate: React.FC<{ file: TemplateFile }> = ({ file }) => {
  const [done, setDone] = useState<string | null>(null);

  const flash = (what: string) => {
    setDone(what);
    window.setTimeout(() => setDone(null), 1800);
  };

  /*
    Pretty-printed, not minified. This is read by people and by chat models,
    both of which do better with line breaks — and a template is a few
    kilobytes, so the whitespace costs nothing worth counting.
  */
  const json = () => JSON.stringify(file, null, 2);

  const download = () => {
    const blob = new Blob([json()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${file.id}.template.json`;
    a.click();
    // Revoked on the next tick: revoking immediately can beat the click in
    // some browsers and the file arrives empty.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash("file");
  };

  return (
    <div className="share">
      <strong className="small">Share this template</strong>
      <p className="muted small">
        Send the file to anyone using this app — they add it with{" "}
        <strong>Add a template</strong> and it appears in their Library, fields
        and all.
      </p>
      <div className="btn-group">
        <button onClick={download}>
          {done === "file" ? "Saved ✓" : "Save as file"}
        </button>
        <button
          onClick={() => {
            navigator.clipboard.writeText(json());
            flash("copy");
          }}
        >
          {done === "copy" ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <p className="muted small">
        {/*
          Said explicitly because it is the difference between sharing a
          template and sharing a video, and people arrive here wanting one or
          the other without the words to tell them apart.
        */}
        This shares the <strong>template</strong>, not the video. For the video
        itself, use Export below.
      </p>
    </div>
  );
};
