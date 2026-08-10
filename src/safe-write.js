import fs from "fs";
import path from "path";
import crypto from "crypto";

/**
 * Atomic, symlink-safe artifact writes (Plan 083).
 *
 * Every user-directed artifact destination goes through this boundary instead
 * of raw `writeFileSync`/`copyFileSync`, so a destination whose final name is
 * a symlink — or whose parent resolves outside the CWD — can never cause a
 * write outside the working directory. The final rename replaces a raced-in
 * symlink rather than following it.
 *
 * Audit 2026-08-09: all check/write operations now use the fully resolved
 * real destination path (`destDirReal + basename`), so a symlinked parent
 * component cannot be re-pointed between validation and rename to smuggle
 * the write outside the CWD. The destination directory must exist (strict
 * realpath), matching the pre-083 behavior of the CLI guards.
 *
 * Deliberately not exported from `src/index.js`: this is an internal security
 * boundary, not a public API.
 */

/**
 * True when `candidatePath` is `directoryPath` itself or lies below it.
 *
 * @param {string} candidatePath — absolute, real path
 * @param {string} directoryPath — absolute, real path
 * @returns {boolean}
 */
export function isInsideDirectory(candidatePath, directoryPath) {
  const relativePath = path.relative(directoryPath, candidatePath);
  return (
    relativePath === "." ||
    !(
      relativePath === ".." ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath)
    )
  );
}

/**
 * Atomically write `data` to `filepath` inside the CWD.
 *
 * Resolves the real path of the destination directory (it must exist), rejects
 * a destination directory that resolves outside the CWD and a final
 * destination that already is a symlink (never write through one) or a
 * directory. The write stages through a unique temp file created in the real
 * destination directory with mode `options.mode` (default 0o644) or the mode
 * of an existing regular file, then atomically renames it onto the real
 * destination path, so a symlink raced in between check and write is replaced,
 * not followed. Cleans the temp file on failure.
 *
 * @param {string} filepath
 * @param {string | Buffer} data
 * @param {{ mode?: number }} [options]
 */
export function writeFileAtomic(filepath, data, options = {}) {
  const resolved = path.resolve(filepath);
  const destDir = path.dirname(resolved);
  const destDirReal = resolveDestinationDir(destDir);
  const cwdReal = fs.realpathSync(process.cwd());

  if (!isInsideDirectory(destDirReal, cwdReal)) {
    throw new Error(
      `Security restriction — output path ${filepath} resolves outside the current working directory. Run the command from the target directory, or copy the file into the current working directory.`
    );
  }

  // Operate on the fully real destination path from here on: the temp file
  // and the rename share `finalPath`, which has no symlinked components, so
  // a parent symlink re-pointed between validation and rename cannot
  // redirect the write.
  const finalPath = path.join(destDirReal, path.basename(resolved));

  let mode = options.mode ?? 0o644;
  try {
    const st = fs.lstatSync(finalPath);
    if (st.isSymbolicLink()) {
      throw new Error(`Security restriction — refusing to write through symlink: ${filepath}`);
    }
    if (st.isDirectory()) {
      throw new Error(`Output path ${filepath} is a directory.`);
    }
    mode = st.mode & 0o777;
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }

  const tmpPath = path.join(
    destDirReal,
    `.${path.basename(resolved)}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`
  );

  let fd;
  try {
    fd = fs.openSync(tmpPath, "wx", mode);
    const payload = typeof data === "string" ? Buffer.from(data, "utf8") : data;
    fs.writeSync(fd, payload);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmpPath, finalPath);
  } catch (e) {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // already closed or never opened — best effort
      }
    }
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {
      // best effort cleanup
    }
    throw e;
  }
}

/**
 * Copy an existing validated source file to a new destination using the same
 * atomic boundary. The source is realpath-checked against the CWD and read
 * through its real path (never through symlinked components), its mode is
 * preserved, and the destination goes through writeFileAtomic.
 *
 * @param {string} src
 * @param {string} dest
 */
export function copyFileAtomic(src, dest) {
  const srcResolved = path.resolve(src);
  const cwdReal = fs.realpathSync(process.cwd());
  let srcReal;
  try {
    srcReal = fs.realpathSync(srcResolved);
  } catch (e) {
    throw new Error(`Failed to resolve real path for ${src}: ${e.message}`, { cause: e });
  }

  if (!isInsideDirectory(srcReal, cwdReal)) {
    throw new Error(
      `Security restriction — source file ${src} resolves outside the current working directory. Run the command from the target directory, or copy the file into the current working directory.`
    );
  }

  const st = fs.statSync(srcReal);
  const data = fs.readFileSync(srcReal);
  return writeFileAtomic(dest, data, { mode: st.mode & 0o777 });
}

/**
 * Resolve the real path of the destination directory. Strict: the directory
 * must exist (a missing component cannot be a write target and would have
 * failed with a raw ENOENT before Plan 083 landed the boundary).
 *
 * @param {string} destDir — absolute path
 * @returns {string} real path of the destination directory
 */
function resolveDestinationDir(destDir) {
  let destDirReal;
  try {
    destDirReal = fs.realpathSync(destDir);
  } catch (e) {
    if (e.code === "ENOENT") {
      throw new Error(
        `Output directory does not exist: ${path.relative(process.cwd(), destDir) || destDir}. Create it first, then run the command again.`,
        { cause: e }
      );
    }
    throw new Error(`Failed to resolve real path for ${destDir}: ${e.message}`, { cause: e });
  }
  return destDirReal;
}
