import { copyFile, mkdir } from "node:fs/promises";

// Keep the original signed packets as the sole source; bundle unchanged copies.
const destination = new URL("../dist/examples/witness/", import.meta.url);
await mkdir(destination, { recursive: true });
for (const filename of [
  "evaluation-packet.production.json",
  "evaluation-packet.proceed-002.production.json",
]) {
  await copyFile(
    new URL(`../../../examples/witness/${filename}`, import.meta.url),
    new URL(filename, destination),
  );
}
const taskDestination = new URL("../dist/examples/task-schedule/", import.meta.url);
await mkdir(taskDestination, { recursive: true });
await copyFile(new URL("../../../examples/task-schedule/packet.json", import.meta.url), new URL("packet.json", taskDestination));
