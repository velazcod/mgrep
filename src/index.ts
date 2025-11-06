#!/usr/bin/env node
import { program } from "commander";
import * as fs from "fs";
import * as path from "path";
import { Mixedbread } from "@mixedbread/sdk";

program
  .version(
    JSON.parse(
      fs.readFileSync(path.join(__dirname, "../package.json"), {
        encoding: "utf-8",
      }),
    ).version,
  )
  .option("--api-key <string>", "The API key to use", process.env.MXBAI_API_KEY)
  .option("--store <string>", "The store to use", process.env.MXBAI_STORE);

program
  .command("search", { isDefault: true })
  .description("File pattern searcher")
  .argument("<pattern>", "The pattern to search for")
  .action(async (pattern, _options, cmd) => {
    const options: { apiKey: string; store: string } = cmd.optsWithGlobals();

    const mixedbread = new Mixedbread({
      apiKey: options.apiKey,
    });

    const results = await mixedbread.stores.search({
      query: pattern,
      store_identifiers: [options.store],
    });

    console.log(
      results.data
        .map((result) => {
          let content =
            result.type == "text"
              ? result.text
              : `Not a text chunk! (${result.type})`;
          content = JSON.stringify(content);
          return `${(result.metadata as any)?.path ?? "Unknown path"}: ${content}`;
        })
        .join("\n"),
    );
  });

program
  .command("watch")
  .description("Watch for file changes")
  .action((_args, cmd) => {
    const options: { apiKey: string; store: string } = cmd.optsWithGlobals();

    const mixedbread = new Mixedbread({
      apiKey: options.apiKey,
    });

    const watchRoot = process.cwd();
    console.log("Watching for file changes in", watchRoot);
    try {
      fs.watch(watchRoot, { recursive: true }, (eventType, rawFilename) => {
        const filename = rawFilename?.toString();
        if (!filename) {
          return;
        }
        const filePath = path.join(watchRoot, filename);
        console.log(`${eventType}: ${filePath}`);

        mixedbread.stores.files.upload(
          options.store,
          new File([fs.readFileSync(filePath)], filename, {
            type: "text/plain",
          }),
          {
            external_id: filePath,
            metadata: {
              path: filePath,
            },
          },
        );
        console.log("File uploaded");
      });
    } catch (err) {
      console.error("Failed to start watcher:", err);
      process.exitCode = 1;
    }
  });

program.parse();
