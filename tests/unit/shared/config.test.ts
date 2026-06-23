"use strict";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { readNoesisConfig } from "../../../src/shared/config.js";
import { createTempDir } from "../../helpers/temp-dir.js";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

describe("readNoesisConfig", () => {
  let tmp: { path: string; cleanup(): void };

  beforeEach(() => {
    tmp = createTempDir();
  });

  afterEach(() => {
    tmp.cleanup();
  });

  it("should return defaults when .omp/config.yml does not exist", async () => {
    const config = await readNoesisConfig(tmp.path);
    expect(config).toEqual({
      autoUpdate: true,
      updateOnAttend: true,
      maxUpdateInterval: 15,
    });
  });

  it("should return defaults when .omp/ directory does not exist", async () => {
    const config = await readNoesisConfig(tmp.path);
    expect(config).toEqual({
      autoUpdate: true,
      updateOnAttend: true,
      maxUpdateInterval: 15,
    });
  });

  it("should return full config from valid YAML", async () => {
    const ompDir = join(tmp.path, ".omp");
    mkdirSync(ompDir, { recursive: true });
    writeFileSync(
      join(ompDir, "config.yml"),
      [
        "noesis:",
        "  graphify:",
        "    autoUpdate: false",
        "    updateOnAttend: false",
        "    maxUpdateInterval: 60",
      ].join("\n") + "\n"
    );

    const config = await readNoesisConfig(tmp.path);
    expect(config).toEqual({
      autoUpdate: false,
      updateOnAttend: false,
      maxUpdateInterval: 60,
    });
  });

  it("should merge partial config with defaults for missing fields", async () => {
    const ompDir = join(tmp.path, ".omp");
    mkdirSync(ompDir, { recursive: true });
    writeFileSync(
      join(ompDir, "config.yml"),
      [
        "noesis:",
        "  graphify:",
        "    autoUpdate: false",
      ].join("\n") + "\n"
    );

    const config = await readNoesisConfig(tmp.path);
    expect(config).toEqual({
      autoUpdate: false,
      updateOnAttend: true,
      maxUpdateInterval: 15,
    });
  });

  it("should return defaults when YAML is malformed", async () => {
    const ompDir = join(tmp.path, ".omp");
    mkdirSync(ompDir, { recursive: true });
    writeFileSync(join(ompDir, "config.yml"), "noesis:\n  graphify: [unclosed\n");

    const config = await readNoesisConfig(tmp.path);
    expect(config).toEqual({
      autoUpdate: true,
      updateOnAttend: true,
      maxUpdateInterval: 15,
    });
  });

  it("should return defaults when noesis block exists but graphify sub-block is missing", async () => {
    const ompDir = join(tmp.path, ".omp");
    mkdirSync(ompDir, { recursive: true });
    writeFileSync(
      join(ompDir, "config.yml"),
      [
        "noesis:",
        "  someOtherKey: value",
      ].join("\n") + "\n"
    );

    const config = await readNoesisConfig(tmp.path);
    expect(config).toEqual({
      autoUpdate: true,
      updateOnAttend: true,
      maxUpdateInterval: 15,
    });
  });

  it("should return defaults when config.yml is empty", async () => {
    const ompDir = join(tmp.path, ".omp");
    mkdirSync(ompDir, { recursive: true });
    writeFileSync(join(ompDir, "config.yml"), "");

    const config = await readNoesisConfig(tmp.path);
    expect(config).toEqual({
      autoUpdate: true,
      updateOnAttend: true,
      maxUpdateInterval: 15,
    });
  });

  it("should handle config with all non-default values", async () => {
    const ompDir = join(tmp.path, ".omp");
    mkdirSync(ompDir, { recursive: true });
    writeFileSync(
      join(ompDir, "config.yml"),
      [
        "noesis:",
        "  graphify:",
        "    autoUpdate: true",
        "    updateOnAttend: false",
        "    maxUpdateInterval: 5",
      ].join("\n") + "\n"
    );

    const config = await readNoesisConfig(tmp.path);
    expect(config).toEqual({
      autoUpdate: true,
      updateOnAttend: false,
      maxUpdateInterval: 5,
    });
  });
});
