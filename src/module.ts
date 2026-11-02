import { registerSettings } from "./settings/credentials.js";
import { registerImporterMenu } from "./applications/importer.js";

Hooks.once("init", () => {
  if (game.system.id !== "dnd5e") {
    throw new Error(
      "D&D Beyond Character Shuffler requires the D&D 5e game system.",
    );
  }
  registerSettings();
  registerImporterMenu();
});
