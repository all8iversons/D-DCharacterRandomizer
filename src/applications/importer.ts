import { ImportFailure } from "../import/import-errors.js";
import {
  createActorsFromShuffle,
  type GeneratedActorBatch,
} from "../foundry/actor-generator.js";
import {
  downloadFile,
  exportActorJson,
  exportActorsJsonZip,
  exportActorPdf,
  ExportFailure,
} from "../export/export-service.js";
import { importService } from "../import/import-service.js";
import { shuffleCharacters } from "../shuffle/shuffle-characters.js";
import type { ShuffledCharacter } from "../types/shuffle-model.js";
import type { ImportedCharacter } from "../types/import-model.js";
import { RulesResolutionError } from "../rules/recalculate-stats.js";

const HandlebarsApplication =
  foundry.applications.api.HandlebarsApplicationMixin(
    foundry.applications.api.ApplicationV2,
  );

export class DdbImporterApplication extends HandlebarsApplication {
  static DEFAULT_OPTIONS = {
    id: "ddb-character-importer",
    classes: ["dndbeyond-character-shuffler", "ddb-importer"],
    window: {
      title: "D&D Beyond Character Importer",
      icon: "fa-solid fa-file-import",
      resizable: true,
    },
    position: {
      width: 720,
      height: 640,
    },
    actions: {
      "import-character": DdbImporterApplication.prototype.importCharacter,
      "import-campaign": DdbImporterApplication.prototype.importCampaign,
      "shuffle-preview": DdbImporterApplication.prototype.createShufflePreview,
      "create-actors": DdbImporterApplication.prototype.createActors,
      "export-json": DdbImporterApplication.prototype.exportJson,
      "export-json-batch": DdbImporterApplication.prototype.exportJsonBatch,
      "export-pdf": DdbImporterApplication.prototype.exportPdf,
    },
  };

  static PARTS = {
    main: {
      template:
        "modules/d-d-character-randomizer/templates/importer.hbs",
    },
  };

  private importing = false;
  private errorMessage = "";
  private statusMessage = "";
  private shuffledPreview: readonly ShuffledCharacter[] = [];
  private generatedActors: readonly FoundryActor[] = [];
  private generationWarnings: readonly string[] = [];

  override async _prepareContext(
    options: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const context = await super._prepareContext(options);
    const characters: readonly ImportedCharacter[] = importService.characters;
    return {
      ...context,
      characters,
      characterCount: characters.length,
      canShuffle: importService.canShuffle,
      shuffledPreview: this.shuffledPreview,
      hasShufflePreview: this.shuffledPreview.length > 0,
      generatedActors: this.generatedActors,
      generationWarnings: this.generationWarnings,
      importing: this.importing,
      errorMessage: this.errorMessage,
      statusMessage: this.statusMessage,
    };
  }

  private async importCharacter(
    event: Event,
    target: HTMLElement,
  ): Promise<void> {
    event.preventDefault();
    const input = target
      .closest(".form-group")
      ?.querySelector<HTMLInputElement>("[name='character-source']");
    if (!input) {
      this.errorMessage = "The character ID or URL field is unavailable.";
      this.render({ force: true });
      return;
    }

    this.importing = true;
    this.errorMessage = "";
    this.statusMessage = "Importing character...";
    this.render({ force: true });
    try {
      const character = await importService.importCharacter(input.value);
      this.statusMessage = `Imported ${character.name}.`;
    } catch (error) {
      this.errorMessage = this.safeErrorMessage(error);
      this.statusMessage = "";
    } finally {
      this.importing = false;
      this.render({ force: true });
    }
  }

  private async importCampaign(
    event: Event,
    target: HTMLElement,
  ): Promise<void> {
    event.preventDefault();
    const input = target
      .closest(".form-group")
      ?.querySelector<HTMLInputElement>("[name='campaign-source']");
    if (!input) {
      this.errorMessage = "The campaign URL field is unavailable.";
      this.render({ force: true });
      return;
    }

    this.importing = true;
    this.errorMessage = "";
    this.statusMessage = "Checking campaign roster availability...";
    this.render({ force: true });
    try {
      await importService.importCampaign(input.value);
    } catch (error) {
      this.errorMessage = this.safeErrorMessage(error);
      this.statusMessage = "";
    } finally {
      this.importing = false;
      this.render({ force: true });
    }
  }

  private createShufflePreview(event: Event): void {
    event.preventDefault();
    try {
      this.shuffledPreview = shuffleCharacters(importService.characters);
      this.errorMessage = "";
      this.statusMessage = `Created a ${this.shuffledPreview.length}-character shuffle preview. Review the assignments before creating Actors.`;
    } catch (error) {
      this.errorMessage = this.safeErrorMessage(error);
      this.statusMessage = "";
    }
    this.render({ force: true });
  }

  private async createActors(event: Event): Promise<void> {
    event.preventDefault();
    if (this.shuffledPreview.length < 2) {
      this.errorMessage = "Create a shuffle preview with at least two characters first.";
      this.render({ force: true });
      return;
    }

    this.importing = true;
    this.errorMessage = "";
    this.statusMessage = "Validating and creating shuffled Actors...";
    this.render({ force: true });
    try {
      const batch: GeneratedActorBatch = await createActorsFromShuffle(
        this.shuffledPreview,
      );
      this.generatedActors = [...this.generatedActors, ...batch.actors];
      this.generationWarnings = batch.warnings;
      this.shuffledPreview = [];
      this.statusMessage = `Created ${batch.actors.length} Actors in the Shuffled Characters folder.`;
      if (batch.warnings.length > 0) {
        this.statusMessage += ` ${batch.warnings.length} item(s) use custom data without compendium mechanics; review them in Foundry.`;
      }
    } catch (error) {
      this.errorMessage = this.safeErrorMessage(error);
      this.statusMessage = "";
    } finally {
      this.importing = false;
      this.render({ force: true });
    }
  }

  private async exportJson(event: Event, target: HTMLElement): Promise<void> {
    event.preventDefault();
    const actor = this.actorForTarget(target);
    if (!actor) {
      this.errorMessage = "The selected Actor is no longer available.";
      this.render({ force: true });
      return;
    }
    try {
      const json = await exportActorJson(actor);
      downloadFile(`${actor.name}.json`, json, "application/json");
      this.errorMessage = "";
      this.statusMessage = `Downloaded Foundry JSON for ${actor.name}.`;
    } catch (error) {
      this.errorMessage = this.safeErrorMessage(error);
      this.statusMessage = "";
    }
    this.render({ force: true });
  }

  private async exportPdf(event: Event, target: HTMLElement): Promise<void> {
    event.preventDefault();
    const actor = this.actorForTarget(target);
    if (!actor) {
      this.errorMessage = "The selected Actor is no longer available.";
      this.render({ force: true });
      return;
    }
    try {
      const pdf = await exportActorPdf(actor);
      downloadFile(`${actor.name}.pdf`, pdf, "application/pdf");
      this.errorMessage = "";
      this.statusMessage = `Downloaded the fillable 5e PDF for ${actor.name}.`;
    } catch (error) {
      this.errorMessage = this.safeErrorMessage(error);
      this.statusMessage = "";
    }
    this.render({ force: true });
  }

  private async exportJsonBatch(event: Event): Promise<void> {
    event.preventDefault();
    try {
      const archive = await exportActorsJsonZip(this.generatedActors);
      downloadFile(
        "shuffled-characters.zip",
        archive,
        "application/zip",
      );
      this.errorMessage = "";
      this.statusMessage = `Downloaded Foundry JSON for ${this.generatedActors.length} Actors.`;
    } catch (error) {
      this.errorMessage = this.safeErrorMessage(error);
      this.statusMessage = "";
    }
    this.render({ force: true });
  }

  private actorForTarget(target: HTMLElement): FoundryActor | undefined {
    const actorId = target.dataset.actorId;
    return this.generatedActors.find((actor) => actor.id === actorId);
  }

  private safeErrorMessage(error: unknown): string {
    if (error instanceof ImportFailure) {
      return error.details.message;
    }
    if (
      error instanceof RulesResolutionError ||
      error instanceof ExportFailure
    ) {
      return error.message;
    }
    if (error instanceof RangeError) {
      return error.message;
    }
    console.error("D&D Beyond Character Shuffler operation failed", error);
    return "The requested operation could not be completed. Check the proxy and D&D 5e system configuration, then try again.";
  }
}

export function registerImporterMenu(): void {
  game.settings.registerMenu("d-d-character-randomizer", "importer", {
    name: "D&D Beyond Character Importer",
    label: "Open Importer",
    hint: "Import individual D&D Beyond characters into a temporary in-memory workspace.",
    icon: "fa-solid fa-file-import",
    type: DdbImporterApplication,
    restricted: true,
  });
}
