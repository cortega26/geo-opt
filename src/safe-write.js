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
 * Deliberately not exported from `src/index.js`: this is an internal security
 * boundary, not a public API.
 */

function isInsideDirectory(candidatePath, directoryPath) {
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
 * Resolve the nearest existing ancestor of `dirPath` to its real path, so a
 * symlinked parent component cannot smuggle a write outside the CWD.
 *
 * @param {string} dirPath
 * @returns {string} real path of the nearest existing ancestor
 */
function resolveExistingParent(dirPath) {
  let probe = path.resolve(dirPath);
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  try {
    return fs.realpathSync(probe);
  } catch (e) {
    throw new Error(`Failed to resolve real path for ${probe}: ${e.message}`, { cause: e });
  }
}

/**
 * Atomically write `data` to `filepath` inside the CWD.
 *
 * Validates the real path of the nearest existing parent directory, rejects a
 * final destination that already is a symlink (never write through one) or a
 * directory, writes through a unique temp file and atomic rename so a symlink
 * raced in between check and write is replaced, not followed. Preserves the
 * mode of an existing regular file. Cleans the temp file on failure.
 *
 * @param {string} filepath
 * @param {string | Buffer} data
 * @param {{ mode?: number }} [options]
 */
export function writeFileAtomic(filepath, data, options = {}) {
  const resolved = path.resolve(filepath);
  const destDir = path.dirname(resolved);
  const destDirReal = resolveExistingParent(destDir);
  const cwdReal = fs.realpathSync(process.cwd());

  if (!isInsideDirectory(destDirReal, cwdReal)) {
    throw new Error(
      `Security restriction — output path ${filepath} resolves outside the current working directory. Run the command from the target directory, or copy the file into the current working directory.`
    );
  }

  let mode = options.mode ?? 0o644;
  try {
    const st = fs.lstatSync(resolved);
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
    fs.renameSync(tmpPath, resolved);
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
 * atomic boundary. The source is realpath-checked against the CWD, its mode
 * is preserved, and the destination goes through writeFileAtomic.
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

  const st = fs.statSync(srcResolved);
  const data = fs.readFileSync(srcResolved);
  return writeFileAtomic(dest, data, { mode: st.mode & 0o777 });
}
