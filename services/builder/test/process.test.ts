import assert from "node:assert/strict";
import test from "node:test";
import { runProcess } from "../src/process.js";
test("lost assignment stops compiler process groups, including descendants", async () => {
  if (process.platform === "win32") return;
  const controller = new AbortController(); let childPid: number | undefined;
  const started = Date.now();
  await assert.rejects(runProcess(process.execPath, ["-e", `const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log(child.pid);setInterval(()=>{},1000);`], {
    signal: controller.signal, onOutput(chunk) { childPid=Number(chunk.toString().trim()); controller.abort(); },
  }), /cancelled/);
  assert.ok(Date.now()-started < 6000);
  assert.ok(childPid);
  // A terminated descendant may briefly be a zombie waiting for init to reap it.
  const { readFile } = await import("node:fs/promises");
  const state = await readFile(`/proc/${childPid}/stat`,"utf8").catch(()=>"");
  assert.ok(!state || state.split(" ")[2] === "Z");
});
