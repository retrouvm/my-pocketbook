import * as esbuild from "esbuild";
import { mkdirSync } from "fs";

mkdirSync("dist", { recursive: true });

await esbuild.build({
  entryPoints: {
    handler: "src/handler.ts",
    "statement-parser": "src/statement-parser.ts",
    "plaid-sync": "src/plaid-sync.ts",
  },
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outdir: "dist",
  sourcemap: true,
  external: [],
});

console.log("API build complete");
