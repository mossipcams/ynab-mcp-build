import { describe, expect, it } from "vitest";

import vitestConfig from "../../vitest.config.js";

describe("vitest project layout", () => {
  it("defines separate unit and workers projects", () => {
    // DEFECT: worker-runtime tests can silently run in the plain Node project when the config has only one test project.
    const projects = vitestConfig.test?.projects;

    expect(projects).toBeDefined();
    expect(Array.isArray(projects)).toBe(true);
    expect(projects).toHaveLength(2);
    expect(projects?.map((project) => project.test?.name)).toEqual(["unit", "workers"]);
  });
});
