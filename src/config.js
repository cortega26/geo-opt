import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

export const MAX_PRONOUN_DENSITY = 0.02;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const offerSchema = z.object({
  price: z.union([z.string(), z.number()]).optional(),
  priceCurrency: z.string().optional(),
  availability: z.string().optional(),
});

const configSchema = z
  .object({
    author: z
      .object({
        name: z.string(),
        jobTitle: z.string().optional(),
        sameAs: z.string().optional(),
      })
      .optional(),
    publisher: z
      .object({
        name: z.string().optional(),
        url: z.string().optional(),
        logo: z.string().optional(),
      })
      .optional(),
    acronyms: z.record(z.string()).optional(),
    product: z
      .object({
        offer: offerSchema.optional(),
      })
      .optional(),
    license: z
      .object({
        key: z.string().optional(),
      })
      .optional(),
    licenseKey: z.string().optional(),
    datePublished: z.string().optional(),
    limits: z
      .object({
        max_pronoun_density: z.number().optional(),
      })
      .optional(),
    ignore: z.array(z.string()).optional(),
    allowedExtensions: z.array(z.string()).optional(),
    siteUrl: z.string().optional(),
    siteDescription: z.string().optional(),
  })
  .passthrough();

export function loadConfig(configPath = null) {
  const searchPaths = [];
  if (configPath) {
    if (!fs.existsSync(configPath)) {
      console.error(`Error: Specified config file ${configPath} not found.`);
      process.exit(1);
      return;
    }
    searchPaths.push(configPath);
  } else {
    searchPaths.push(path.join(process.cwd(), "geo_config.json"));
    searchPaths.push(
      path.resolve(__dirname, "..", ".agents", "skills", "geo-optimization", "geo_config.json")
    );
  }

  for (const p of searchPaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, { encoding: "utf8", flag: "r" });
        const parsed = JSON.parse(raw);
        const result = configSchema.safeParse(parsed);
        if (!result.success) {
          const issues = result.error.issues
            .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
            .join("\n");
          const message = `Invalid config at ${p}:\n${issues}`;
          if (configPath) {
            console.error(`Error: ${message}`);
            process.exit(1);
            return;
          }
          console.warn(`Warning: ${message}`);
          return { config: {}, configPath: null };
        }
        return { config: result.data, configPath: p };
      } catch (e) {
        const message = `Failed to parse config at ${p}: ${e.message}`;
        if (configPath) {
          console.error(`Error: ${message}`);
          process.exit(1);
          return;
        }
        console.warn(`Warning: ${message}`);
      }
    }
  }

  return { config: {}, configPath: null };
}
