import { exportActorPdf } from "../export/export-service.js";

const OWNERSHIP_NONE = 0;
const OWNERSHIP_OBSERVER = 2;
const FOLDER_NAME = "Shuffled Characters";

function safeFileName(value: string): string {
  return (
    value
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "character"
  );
}

async function ensureDirectory(path: string): Promise<void> {
  const picker = foundry.applications.apps.FilePicker.implementation;
  const parts = path.split("/");
  for (let index = 1; index <= parts.length; index += 1) {
    try {
      await picker.createDirectory("data", parts.slice(0, index).join("/"));
    } catch {
      // The directory already exists.
    }
  }
}

export function assignableUsers(): readonly FoundryUser[] {
  return game.users.contents.filter((user) => !user.isGM);
}

// Uploads the filled PDF to the world's data folder and wraps it in a Journal
// Entry (PDF page) whose ownership is limited to the chosen player.
export async function createPdfHandout(
  actor: FoundryActor,
  userId: string,
): Promise<FoundryJournalEntry> {
  const pdf = await exportActorPdf(actor);
  const directory = `worlds/${game.world.id}/shuffled-characters`;
  await ensureDirectory(directory);

  const buffer = new ArrayBuffer(pdf.byteLength);
  new Uint8Array(buffer).set(pdf);
  const fileName = `${safeFileName(actor.name)}-${actor.id}.pdf`;
  const file = new File([buffer], fileName, { type: "application/pdf" });
  const response = await foundry.applications.apps.FilePicker.implementation.upload(
    "data",
    directory,
    file,
    {},
    { notify: false },
  );
  const path =
    response && typeof response === "object" && response.path
      ? response.path
      : `${directory}/${fileName}`;

  let folder = game.folders.contents.find(
    (candidate) =>
      candidate.name === FOLDER_NAME && candidate.type === "JournalEntry",
  );
  if (!folder) {
    folder = await CONFIG.Folder.documentClass.create({
      name: FOLDER_NAME,
      type: "JournalEntry",
    });
  }

  const ownership: Record<string, number> = { default: OWNERSHIP_NONE };
  if (userId) {
    ownership[userId] = OWNERSHIP_OBSERVER;
  }
  return CONFIG.JournalEntry.documentClass.create({
    name: `${actor.name} — Character Sheet`,
    folder: folder.id,
    ownership,
    pages: [
      {
        name: `${actor.name} — Character Sheet`,
        type: "pdf",
        src: path,
      },
    ],
  });
}
