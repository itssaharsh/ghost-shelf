import raw from "../../data/presets.json";
import type { Seed } from "./schemas";

export type Preset = {
  id: string;
  kind: "invented" | "real-held" | "real-not-held";
  title: string;
  author: string;
  seeds: Seed[];
};

type PresetFile = { note: string; sources: Record<string, string>; presets: Preset[] };

const file = raw as PresetFile;
export const presets: Preset[] = file.presets;
export const presetNote = file.note;
export const presetSources = file.sources;
export const inventedPresets = presets.filter((p) => p.kind === "invented");
