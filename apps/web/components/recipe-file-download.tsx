"use client";
import { gdBuildFilename, serializeGdBuildFile } from "@mingd/build-config";
import { Button } from "@/components/ui/button";

export function downloadRecipeFile(name: string, config: unknown) {
  const url = URL.createObjectURL(new Blob([serializeGdBuildFile(name, config)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = gdBuildFilename(name); link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function RecipeFileDownload({ name, config }: { name: string; config: unknown }) {
  return <Button type="button" variant="secondary" onClick={() => downloadRecipeFile(name, config)}>Export .gdbuild</Button>;
}
