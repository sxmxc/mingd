import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// npm runs workspace scripts in the workspace, but keeps the caller's directory.
export function credentialFilePath(file: string) {
  return resolve(process.env.INIT_CWD || process.cwd(), file);
}

export class CredentialFileError extends Error {}

export function writeCredentialFile(file: string, credential: string) {
  try {
    writeFileSync(file, `${credential}\n`, { flag: "wx", mode: 0o600 });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const message = code === "ENOENT" ? "Credential file parent directory does not exist. Create it before enrolling."
      : code === "EEXIST" ? "Credential file already exists; it was not overwritten. Choose a new file or inspect the previous enrollment."
      : code === "EACCES" || code === "EPERM" ? "Permission denied creating credential file. Check directory permissions."
      : "Could not create credential file. Check directory permissions and available storage.";
    // Raw filesystem exceptions may contain sensitive user-supplied paths.
    throw new CredentialFileError(message);
  }
}
