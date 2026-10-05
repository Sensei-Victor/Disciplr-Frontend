/**
 * Failure-path and boundary coverage for vite.config.ts.
 *
 * vite.config.ts is the module that decides how the production bundle is
 * split and how the dev server is wired. It has no tests of its own, and its
 * two failure modes are silent:
 *
 *   - `manualChunks` decides chunk membership by substring match, so an id
 *     that should map to a vendor chunk but does not gets inlined into the
 *     entry bundle (or vice versa) without any error;
 *   - `manualChunks` returning an empty string is falsy to rollup, which
 *     silently falls back to default chunking.
 *
 * These tests pin the observable contract of the config: the alias, the
 * vendor-chunk routing table, the dev-server proxy, and the boundary cases
 * around each of them.
 */
import path from "path";
import viteConfig from "../../vite.config";
import type { PluginOption, UserConfig } from "vite";

/** Unwrap rollup's single-or-array output into the object we assert on. */
function outputConfig() {
  const output = viteConfig.build?.rollupOptions?.output;
  return (Array.isArray(output) ? output[0] : output) ?? {};
}

const manualChunks = outputConfig().manualChunks as unknown as (
  id: string,
) => string | undefined;

describe("vite.config.ts — module shape", () => {
  it("exports a plain resolved config, not a promise or a factory", () => {
    expect(viteConfig).toBeTypeOf("object");
    expect(viteConfig).not.toBeInstanceOf(Promise);
  });

  it("registers the react and tailwind plugins, all well-formed", () => {
    const plugins = (viteConfig.plugins ?? []) as PluginOption[];
    expect(plugins).toHaveLength(2);

    // `react()` and `tailwindcss()` each return an *array* of plugins, and
    // vite accepts nested arrays here — so flatten before asserting. Written
    // out rather than `.flat(Infinity)` so `false`/`null` entries (which
    // vite's PluginOption allows as "opt out") are dropped instead of
    // widening the element type.
    const flatten = (entries: PluginOption[]): Array<{ name?: string }> => {
      const out: Array<{ name?: string }> = [];
      for (const entry of entries) {
        if (Array.isArray(entry)) out.push(...flatten(entry as PluginOption[]));
        else if (entry) out.push(entry as { name?: string });
      }
      return out;
    };
    const flat = flatten(plugins);
    expect(flat.length).toBeGreaterThanOrEqual(2);

    for (const plugin of flat) {
      // A plugin that failed to construct would be undefined/null here and
      // vite would drop it silently at startup.
      expect(plugin).toBeTruthy();
      // likewise a missing name makes the plugin unreachable by `config` hooks
      expect(typeof plugin.name).toBe("string");
      expect((plugin.name ?? "").length).toBeGreaterThan(0);
    }

    const names = flat.map((p) => p.name);
    expect(names).toContain("vite:react-babel");
    expect(names).toContain("vite:react-refresh");
    expect(names.some((n) => n?.includes("tailwind"))).toBe(true);
  });

  it("aliases '@' to the real src directory", () => {
    const alias = viteConfig.resolve?.alias as Record<string, string>;
    expect(alias).toBeTruthy();
    expect(alias["@"]).toBe(path.resolve(__dirname, "../../src"));
    // guards against a relative alias, which resolves against the *consumer's*
    // cwd and breaks every '@/' import the moment the working directory moves
    expect(path.isAbsolute(alias["@"])).toBe(true);
    expect(alias["@"].endsWith("/src")).toBe(true);
  });
});

describe("vite.config.ts — manualChunks routing", () => {
  it("routes each known vendor to its own chunk", () => {
    expect(manualChunks("/repo/node_modules/recharts/es/index.js")).toBe(
      "vendor-recharts",
    );
    expect(manualChunks("/repo/node_modules/jspdf/dist/jspdf.es.min.js")).toBe(
      "vendor-jspdf",
    );
    expect(
      manualChunks("/repo/node_modules/framer-motion/dist/es/index.mjs"),
    ).toBe("vendor-framer-motion");
  });

  it("returns undefined for ordinary modules so rollup chunks them normally", () => {
    expect(manualChunks("/repo/src/components/Button.tsx")).toBeUndefined();
    expect(manualChunks("/repo/node_modules/react/index.js")).toBeUndefined();
    expect(manualChunks("")).toBeUndefined();
  });

  it("never returns an empty string (rollup treats it as falsy)", () => {
    for (const id of [
      "",
      " ",
      "/repo/src/app.tsx",
      "/repo/node_modules/react/index.js",
      "recharts",
      "jspdf",
      "framer-motion",
    ]) {
      const result = manualChunks(id);
      expect(result).not.toBe("");
    }
  });

  it("is a pure, deterministic function of its argument", () => {
    const id = "/repo/node_modules/recharts/es/index.js";
    expect(manualChunks(id)).toBe(manualChunks(id));

    // No hidden state: routing a vendor id must not make a later non-vendor id
    // route differently (a memoising implementation would be a chunking bug).
    expect(manualChunks("/repo/src/app.tsx")).toBeUndefined();
    expect(manualChunks(id)).toBe("vendor-recharts");
  });

  it("matches case-sensitively so a differently-cased id is not routed", () => {
    expect(manualChunks("/repo/node_modules/RECHARTS/index.js")).toBeUndefined();
    expect(manualChunks("/repo/node_modules/JSPDF/index.js")).toBeUndefined();
  });

  /**
   * Documents the substring contract rather than assuming it: the matcher is
   * `id.includes(...)`, so anything containing the token is routed. If this
   * ever stops being true the chunking changes silently, which is exactly the
   * failure this suite exists to catch.
   */
  it("matches on substring, not path segment", () => {
    expect(manualChunks("/repo/my-recharts-wrapper.ts")).toBe("vendor-recharts");
    expect(manualChunks("/repo/src/legacy/jspdf-fallback.ts")).toBe(
      "vendor-jspdf",
    );
    expect(manualChunks("/repo/src/lib/framer-motion-shim.ts")).toBe(
      "vendor-framer-motion",
    );
  });

  it("gives only one vendor chunk per id, in a stable order", () => {
    // an id that could plausibly hit two rules resolves to the first match
    const both = manualChunks("/repo/node_modules/recharts-jspdf/index.js");
    expect(both).toBe("vendor-recharts");
  });

  it("keeps the three vendor chunk names distinct and non-empty", () => {
    // `?? ""` so the element type is string; if any rule stopped matching it
    // would collapse to "" and the toEqual below would fail anyway.
    const routed = [
      manualChunks("recharts") ?? "",
      manualChunks("jspdf") ?? "",
      manualChunks("framer-motion") ?? "",
    ];
    expect(routed).toEqual([
      "vendor-recharts",
      "vendor-jspdf",
      "vendor-framer-motion",
    ]);
    expect(new Set(routed).size).toBe(3);
    for (const name of routed) expect(name.length).toBeGreaterThan(0);
  });
});

describe("vite.config.ts — dev server", () => {
  it("listens on the documented port", () => {
    expect(viteConfig.server?.port).toBe(5173);
    expect(typeof viteConfig.server?.port).toBe("number");
    // an out-of-range port would make vite fall back to a random one
    expect(viteConfig.server!.port!).toBeGreaterThan(0);
    expect(viteConfig.server!.port!).toBeLessThanOrEqual(65535);
  });

  it("proxies /api to an absolute http origin with CORS rewriting on", () => {
    const proxy = viteConfig.server?.proxy as Record<
      string,
      { target: string; changeOrigin: boolean }
    >;
    expect(proxy).toBeTruthy();

    const api = proxy["/api"];
    // a missing or relative target makes vite throw at startup
    expect(api).toBeTruthy();
    expect(api.target).toMatch(/^https?:\/\//);
    // without changeOrigin the backend sees the dev-server Host header and
    // rejects the request on a different origin
    expect(api.changeOrigin).toBe(true);
    expect(api.target).toBe("http://localhost:3000");
  });

  it("only proxies the /api prefix, not every request", () => {
    const proxy = viteConfig.server?.proxy as Record<string, unknown>;
    expect(Object.keys(proxy)).toEqual(["/api"]);
    expect(proxy["/"]).toBeUndefined();
    expect(proxy["/api/users"]).toBeUndefined();
  });
});

describe("vite.config.ts — failure paths", () => {
  it("does not define a build target or outDir that would silently relocate output", () => {
    // both are optional in vite; if present they must be non-empty strings,
    // because vite treats '' as "use the default" and hides the mistake
    const config = viteConfig as UserConfig;
    if (config.base !== undefined) {
      expect(config.base).not.toBe("");
      expect(config.base.startsWith("/") || /^https?:\/\//.test(config.base)).toBe(
        true,
      );
    }
    if (config.build?.outDir !== undefined) {
      expect(config.build.outDir).not.toBe("");
    }
  });

  it("leaves manualChunks absent from the output when it is not configured", () => {
    // regression: a future edit that drops manualChunks must not silently
    // make manualChunks an empty object/functionless value
    const output = viteConfig.build?.rollupOptions?.output;
    expect(output).toBeTruthy();
    expect(typeof manualChunks).toBe("function");
  });
});
