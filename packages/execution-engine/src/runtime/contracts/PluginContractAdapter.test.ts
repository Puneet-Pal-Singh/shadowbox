// packages/execution-engine/src/runtime/contracts/PluginContractAdapter.test.ts
// Phase 1: Contract validation tests
// Ensures task type -> plugin/action mapping is correct

import { describe, it, expect, beforeEach } from "vitest";
import {
  getPluginContract,
  verifyContract,
  getRegisteredTaskTypes,
  type PluginActionContract,
} from "./PluginContractAdapter.js";

describe("PluginContractAdapter", () => {
  describe("getPluginContract", () => {
    it("should return correct contract for analyze task", () => {
      const contract = getPluginContract("analyze");
      expect(contract).toEqual({
        plugin: "filesystem",
        action: "read_file",
      });
    });

    it("should return correct contract for edit task", () => {
      const contract = getPluginContract("edit");
      expect(contract).toEqual({
        plugin: "filesystem",
        action: "write_file",
      });
    });

    it("should return correct contract for test task", () => {
      const contract = getPluginContract("test");
      expect(contract).toEqual({
        plugin: "node",
        action: "run",
      });
    });

    it("should return correct contract for shell task", () => {
      const contract = getPluginContract("shell");
      expect(contract).toEqual({
        plugin: "node",
        action: "run",
      });
    });

    it("should return correct contract for git task", () => {
      const contract = getPluginContract("git");
      expect(contract).toEqual({
        plugin: "git",
        action: "execute",
      });
    });

    it("should return correct contract for review task", () => {
      const contract = getPluginContract("review");
      expect(contract).toEqual({
        plugin: "none",
        action: "none",
      });
    });

    it("should throw for unknown task type", () => {
      expect(() => getPluginContract("unknown")).toThrow(
        /Unknown task type.*unknown/,
      );
    });
  });

  describe("verifyContract", () => {
    it("should return true for correct analyze contract", () => {
      expect(verifyContract("analyze", "filesystem", "read_file")).toBe(true);
    });

    it("should return true for correct edit contract", () => {
      expect(verifyContract("edit", "filesystem", "write_file")).toBe(true);
    });

    it("should return true for correct test contract", () => {
      expect(verifyContract("test", "node", "run")).toBe(true);
    });

    it("should return false for incorrect plugin", () => {
      expect(verifyContract("analyze", "node", "read_file")).toBe(false);
    });

    it("should return false for incorrect action", () => {
      expect(verifyContract("analyze", "filesystem", "read")).toBe(false);
    });

    it("should return false for unknown task type", () => {
      expect(verifyContract("unknown", "filesystem", "read_file")).toBe(false);
    });
  });

  describe("getRegisteredTaskTypes", () => {
    it("should return all task types except review", () => {
      const types = getRegisteredTaskTypes();
      expect(types).toContain("analyze");
      expect(types).toContain("edit");
      expect(types).toContain("test");
      expect(types).toContain("shell");
      expect(types).toContain("git");
      expect(types).not.toContain("review");
    });
  });
});
