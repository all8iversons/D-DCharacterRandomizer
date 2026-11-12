import { ImportFailure } from "../import/import-errors.js";
import {
  createActorsFromShuffle,
  type GeneratedActorBatch,
} from "../foundry/actor-generator.js";
import {
  downloadFile,
  actorPdfFilename,
  exportActorJson,
  exportActorsJsonZip,
  exportActorPdf,
  ExportFailure,
} from "../export/export-service.js";
import { importService } from "../import/import-service.js";
import { shuffleCharacters } from "../shuffle/shuffle-characters.js";
import {
  isSliceCategory,
  manualShuffleWarnings,
  SLICE_OPTIONS,
  swapSlices,
} from "../shuffle/manual-swaps.js";
import type { ShuffledCharacter } from "../types/shuffle-model.js";
import type { ImportedCharacter } from "../types/import-model.js";
import { RulesResolutionError } from "../rules/recalculate-stats.js";
import { assignableUsers, createPdfHandout } from "../foundry/handouts.js";

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
      "swap-slices": DdbImporterApplication.prototype.swapPreviewSlices,
      "create-actors": DdbImporterApplication.prototype.createActors,
      "export-json": DdbImporterApplication.prototype.exportJson,
      "export-json-batch": DdbImporterApplication.prototype.exportJsonBatch,
      "export-pdf": DdbImporterApplication.prototype.exportPdf,
      "create-handout": DdbImporterApplication.prototype.createHandout,
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
  private hasManualSwaps = false;
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
      shuffledPreview: this.shuffledPreview.map((character, index) => ({
        ...character,
        previewNumber: index + 1,
      })),
      hasShufflePreview: this.shuffledPreview.length > 0,
      previewOptions: this.shuffledPreview.map((character, index) => ({
        index,
        label: `Hybrid ${index + 1}: ${character.name}`,
      })),
      sliceOptions: SLICE_OPTIONS,
      manualWarnings: this.hasManualSwaps
        ? manualShuffleWarnings(this.shuffledPreview)
        : [],
      generatedActors: this.generatedActors,
      generationWarnings: this.generationWarnings,
      users: assignableUsers(),
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
      const missing = character.slices.spellcasting.unresolvedSpells ?? [];
      if (missing.length > 0) {
        this.statusMessage += ` ${missing.length} spell(s) need review because D&D Beyond did not provide their definitions. Expand the character for details.`;
      }
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
    this.statusMessage = "Importing campaign characters...";
    this.render({ force: true });
    try {
      const result = await importService.importCampaign(input.value);
      const parts = [`Imported ${result.imported.length} character(s) from the campaign.`];
      if (result.skipped.length > 0) {
        parts.push(`${result.skipped.length} already loaded.`);
      }
      const unresolved = result.imported.reduce(
        (count, character) =>
          count + (character.slices.spellcasting.unresolvedSpells?.length ?? 0),
        0,
      );
      if (unresolved > 0) {
        parts.push(`${unresolved} spell(s) need review. Expand the affected characters for details.`);
      }
      if (result.failed.length > 0) {
        this.errorMessage = result.failed
          .map((failure) => `Character ${failure.id}: ${failure.message}`)
          .join(" ");
      }
      this.statusMessage = parts.join(" ");
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
      const hadPreview = this.shuffledPreview.length > 0;
      this.shuffledPreview = shuffleCharacters(importService.characters);
      this.hasManualSwaps = false;
      this.errorMessage = "";
      this.statusMessage = `${hadPreview ? "Reshuffled:" : "Created"} a ${this.shuffledPreview.length}-character shuffle preview. Review the assignments before creating Actors.`;
    } catch (error) {
      this.errorMessage = this.safeErrorMessage(error);
      this.statusMessage = "";
    }
    this.render({ force: true });
  }

  private swapPreviewSlices(event: Event, target: HTMLElement): void {
    event.preventDefault();
    const section = target.closest(".slice-swap");
    const first = section?.querySelector<HTMLSelectElement>("[name='swap-first']")?.value;
    const second = section?.querySelector<HTMLSelectElement>("[name='swap-second']")?.value;
    const category = section?.querySelector<HTMLSelectElement>("[name='swap-category']")?.value;
    if (
      first === undefined || !/^\d+$/.test(first) ||
      second === undefined || !/^\d+$/.test(second) ||
      category === undefined || !isSliceCategory(category)
    ) {
      this.errorMessage = "Choose two different hybrids and a slice to swap.";
      this.statusMessage = "";
      this.render({ force: true });
      return;
    }
    try {
      this.shuffledPreview = swapSlices(
        this.shuffledPreview,
        Number(first),
        Number(second),
        category,
      );
      this.hasManualSwaps = true;
      this.errorMessage = "";
      this.statusMessage = "Slices swapped. Review the updated preview and any mixing warnings.";
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
      this.hasManualSwaps = false;
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

  private async createHandout(
    event: Event,
    target: HTMLElement,
  ): Promise<void> {
    event.preventDefault();
    const actor = this.actorForTarget(target);
    if (!actor) {
      this.errorMessage = "The selected Actor is no longer available.";
      this.render({ force: true });
      return;
    }
    const select = target
      .closest(".form-group")
      ?.querySelector<HTMLSelectElement>("[name='handout-user']");
    const userId = select?.value ?? "";
    this.importing = true;
    this.errorMessage = "";
    this.statusMessage = `Creating PDF handout for ${actor.name}...`;
    this.render({ force: true });
    try {
      const entry = await createPdfHandout(actor, userId);
      const user = game.users.contents.find((candidate) => candidate.id === userId);
      this.statusMessage = user
        ? `Created handout "${entry.name}" and shared it with ${user.name}.`
        : `Created handout "${entry.name}" (GM only; change its permissions to share it).`;
    } catch (error) {
      this.errorMessage = this.safeErrorMessage(error);
      this.statusMessage = "";
    } finally {
      this.importing = false;
      this.render({ force: true });
    }
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
      const generatedAt = new Date();
      const filename = actorPdfFilename(actor, generatedAt);
      const pdf = await exportActorPdf(actor, undefined, generatedAt);
      downloadFile(filename, pdf, "application/pdf");
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
