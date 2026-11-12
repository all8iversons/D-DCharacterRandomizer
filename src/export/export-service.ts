import { strToU8, zipSync } from "fflate";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { PDFFont, PDFTextField } from "pdf-lib";
import {
  PDF_FIELD_NAMES,
  actorClassName,
  actorFieldValues,
  wrapLineCount,
} from "./sheet-values.js";

type JsonRecord = Record<string, unknown>;

export class ExportFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportFailure";
  }
}

export function actorPdfFilename(actor: FoundryActor, date: Date = new Date()): string {
  const className = actorClassName(actor.toObject(false));
  if (!className.trim() || !actor.name.trim() || !Number.isFinite(date.getTime())) {
    throw new ExportFailure("Cannot name the PDF: the character name, class, or generation date is missing.");
  }
  const safePart = (value: string): string =>
    value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").trim();
  const name = safePart(actor.name);
  const characterClass = safePart(className);
  if (!name || !characterClass) {
    throw new ExportFailure("Cannot name the PDF: the character name or class is invalid.");
  }
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${name}-${characterClass}-${year}-${month}-${day}.pdf`;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function exportActorJson(actor: FoundryActor): Promise<string> {
  const json = await actor.exportToJSON();
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new ExportFailure("Foundry returned invalid Actor JSON.");
  }
  if (!isRecord(parsed) || parsed.type !== "character") {
    throw new ExportFailure("Foundry returned an unexpected Actor export.");
  }
  return json;
}

export async function exportActorsJsonZip(
  actors: readonly FoundryActor[],
): Promise<Uint8Array> {
  if (actors.length === 0) {
    throw new ExportFailure("There are no generated Actors to export.");
  }
  const files: Record<string, Uint8Array> = {};
  for (const [index, actor] of actors.entries()) {
    const name = sanitizeFilename(actor.name) || "Actor";
    const id = sanitizeFilename(actor.id) || String(index + 1);
    files[`${name}-${id}.json`] = strToU8(await exportActorJson(actor));
  }
  return zipSync(files, { level: 6 });
}

// Shrinks a field's font until its text fits the first widget's rectangle.
function fitFontSize(field: PDFTextField, value: string, font: PDFFont): void {
  const rect = field.acroField.getWidgets()[0]?.getRectangle();
  if (!rect || !value) {
    return;
  }
  const multiline = field.isMultiline();
  const width = rect.width - 6;
  const height = rect.height - 6;
  const measure = (line: string, size: number): number =>
    font.widthOfTextAtSize(line, size);
  const largest = multiline
    ? Math.min(8, Math.floor(height / 6))
    : Math.min(14, Math.floor(rect.height * 0.62));
  let size = Math.max(largest, 5);
  for (; size > 5; size -= 0.5) {
    const fits = multiline
      ? wrapLineCount(value, width, size, measure) * size * 1.2 <= height
      : measure(value, size) <= width;
    if (fits) {
      break;
    }
  }
  field.setFontSize(size);
}

export async function exportActorPdf(
  actor: FoundryActor,
  template?: Uint8Array,
  generatedAt: Date = new Date(),
): Promise<Uint8Array> {
  const filename = actorPdfFilename(actor, generatedAt);
  const source =
    template ??
    (await (async () => {
      const response = await fetch(
        "modules/d-d-character-randomizer/assets/character-sheet-template.pdf",
      );
      if (!response.ok) {
        throw new ExportFailure(
          "The fillable character-sheet template could not be loaded.",
        );
      }
      return new Uint8Array(await response.arrayBuffer());
    })());
  const pdf = await PDFDocument.load(source);
  pdf.setTitle(filename.slice(0, -4));
  pdf.catalog.getOrCreateViewerPreferences().setDisplayDocTitle(true);
  const form = pdf.getForm();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const values = actorFieldValues(actor.toObject(false));
  for (const name of PDF_FIELD_NAMES) {
    let field: PDFTextField;
    try {
      field = form.getTextField(name);
    } catch {
      throw new ExportFailure(
        `The fillable character-sheet template is missing the ${name} field.`,
      );
    }
    const value = values[name] ?? "";
    field.setText(value);
    fitFontSize(field, value, font);
  }
  try {
    form.updateFieldAppearances(font);
  } catch {
    throw new ExportFailure(
      "The PDF template cannot render one or more character text values.",
    );
  }
  return pdf.save();
}

export function downloadFile(
  filename: string,
  content: string | Uint8Array,
  mimeType: string,
): void {
  const data =
    typeof content === "string"
      ? new Blob([content], { type: mimeType })
      : (() => {
          const buffer = new ArrayBuffer(content.byteLength);
          new Uint8Array(buffer).set(content);
          return new Blob([buffer], { type: mimeType });
        })();
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .trim();
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function sanitizeFilename(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/^\.+$/, "")
    .trim();
}

export function pdfTemplateFieldNames(): readonly string[] {
  return PDF_FIELD_NAMES;
}
