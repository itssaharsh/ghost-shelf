import { collection } from "../collection";
import { LiveQloo } from "./live";
import { SampleQloo } from "./sample";
import type { QlooClient } from "./types";

export function hasQlooKey(): boolean {
  return Boolean(process.env.QLOO_API_KEY && process.env.QLOO_API_KEY.trim());
}

/** The live client when a key is configured, else the labelled sample client. */
export function makeQlooClient(): QlooClient {
  const key = process.env.QLOO_API_KEY?.trim();
  if (key) return new LiveQloo({ apiKey: key });
  return new SampleQloo(collection.all());
}

export function sampleClient(): QlooClient {
  return new SampleQloo(collection.all());
}
