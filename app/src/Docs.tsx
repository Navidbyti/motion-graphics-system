/**
 * IN-APP DOCUMENTATION — how to add a template.
 *
 * Two audiences, one document. A person reads it on screen; an AI gets it
 * pasted in as context via "Copy for AI". That second case is the point: the
 * editor cannot write a Remotion component, but he can describe the graphic he
 * wants to whichever model he uses — and a model given the actual contract
 * produces something that fits the system instead of inventing its own.
 *
 * The contract is imported from engine/TEMPLATE_SPEC.md rather than restated
 * here. Two copies of a rule is one copy that is wrong: the spec is what the
 * templates are reviewed against, so it has to be the thing shown.
 *
 * `?raw` inlines the file at build time, so this works in the packaged app
 * where there is no filesystem to read from.
 */

import { useMemo, useState } from "react";
import guide from "./docs/adding-templates.md?raw";
import { specForAI } from "./spec";
// Relative, not via @engine — that alias points at engine/src and the contract
// lives one level above it.
import spec from "../../engine/TEMPLATE_SPEC.md?raw";

/**
 * A deliberately small markdown renderer.
 *
 * Only what these two documents actually use: headings, fenced code, inline
 * code, bold, list items, rules and paragraphs. Pulling in a markdown library
 * for that would add a dependency to the shipped app for one screen.
 */
const render = (markdown: string): React.ReactNode[] => {
  const out: React.ReactNode[] = [];
  const lines = markdown.split("\n");
  let i = 0;
  let key = 0;

  const inline = (text: string): React.ReactNode => {
    // Split on `code` and **bold**, keeping the delimiters.
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    return parts.map((part, n) => {
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={n}>{part.slice(1, -1)}</code>;
      }
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={n}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) body.push(lines[i++]);
      i++; // closing fence
      out.push(
        <pre key={key++} data-lang={lang}>
          <code>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    if (/^#{1,4}\s/.test(line)) {
      const level = line.match(/^#+/)![0].length;
      const text = line.replace(/^#+\s*/, "");
      const Tag = `h${Math.min(level + 1, 6)}` as "h2";
      out.push(<Tag key={key++}>{inline(text)}</Tag>);
      i++;
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      out.push(<hr key={key++} />);
      i++;
      continue;
    }

    if (/^\s*[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) {
        // Continuation lines are indented under the bullet; join them in.
        let item = lines[i].replace(/^\s*[-*]\s/, "");
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*[-*]\s/.test(lines[i])) {
          item += " " + lines[i].trim();
          i++;
        }
        items.push(item);
      }
      out.push(
        <ul key={key++}>
          {items.map((item, n) => (
            <li key={n}>{inline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s/, ""));
        i++;
      }
      out.push(
        <ol key={key++}>
          {items.map((item, n) => (
            <li key={n}>{inline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph: gather until a blank line or a block starter.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("```") &&
      !/^#{1,4}\s/.test(lines[i]) &&
      !/^\s*[-*]\s/.test(lines[i]) &&
      !/^\s*\d+\.\s/.test(lines[i]) &&
      !/^---+$/.test(lines[i].trim())
    ) {
      para.push(lines[i]);
      i++;
    }
    out.push(<p key={key++}>{inline(para.join(" "))}</p>);
  }

  return out;
};

export const Docs: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [copied, setCopied] = useState<string | null>(null);

  /** Guide first, contract second — the order an author needs them in. */
  const full = useMemo(() => `${guide}\n\n${spec}`, []);
  const body = useMemo(() => render(full), [full]);

  const copy = async (what: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  };

  return (
    <main className="docs">
      <div className="docs-head">
        <div>
          <h1>How to add templates</h1>
          <p className="muted">
            Two ways. Most of the time you want the first one.
          </p>
        </div>
        <div className="btn-group">
          <button className="active" onClick={() => copy("easy", specForAI())}>
            {copied === "easy" ? "Copied ✓" : "Copy the AI instructions"}
          </button>
          <button onClick={onClose}>Done</button>
        </div>
      </div>

      {/*
        The no-code route leads, because it is the one almost everybody should
        use and the one that needs no explaining. The code route stays — a
        declarative format has a ceiling and pretending otherwise would strand
        anyone who hits it — but it is an escape hatch, not the main road.
      */}
      <div className="docs-routes">
        <section>
          <h3>Paste one in — no code</h3>
          <p className="muted">
            Copy the instructions above into Gemini or ChatGPT, describe the graphic
            you want (attach a reference image if you have one), and paste its reply
            into <strong>Library → Add a template</strong>. It becomes a normal
            template you can edit, rebrand and export like any other. If the reply is
            wrong, the app tells you exactly what to send back.
          </p>
        </section>
        <section>
          <h3>Write one in code</h3>
          <p className="muted">
            For anything the pasted format cannot express. This needs the repo and a
            pull request. The full contract is below.
          </p>
          <button onClick={() => copy("code", full)}>
            {copied === "code" ? "Copied ✓" : "Copy the code contract"}
          </button>
        </section>
      </div>

      <article className="docs-body">{body}</article>
    </main>
  );
};
