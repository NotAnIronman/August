import fs from "node:fs";
import path from "node:path";

let temporaryFileSerial = 0;

function nextTemporaryPath(filePath: string): string {
    const serial = temporaryFileSerial++;
    return path.join(
        path.dirname(filePath),
        `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${serial}.tmp`,
    );
}

/**
 * Durably writes a complete file beside its destination, then atomically
 * promotes it. Readers therefore observe either the old contents or the new
 * contents, never a partially written catalog after a crash or forced exit.
 */
export function writeTextFileAtomicallySync(filePath: string, contents: string): void {
    const resolvedPath = path.resolve(filePath);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

    const temporaryPath = nextTemporaryPath(resolvedPath);
    let descriptor: number | undefined;
    try {
        descriptor = fs.openSync(temporaryPath, "wx");
        fs.writeFileSync(descriptor, contents, "utf8");
        fs.fsyncSync(descriptor);
        fs.closeSync(descriptor);
        descriptor = undefined;
        fs.renameSync(temporaryPath, resolvedPath);
    } finally {
        if (descriptor !== undefined) {
            fs.closeSync(descriptor);
        }
        try {
            fs.unlinkSync(temporaryPath);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
    }
}

export function writeJsonFileAtomicallySync(
    filePath: string,
    value: unknown,
    indentation: number = 2,
): void {
    writeTextFileAtomicallySync(filePath, `${JSON.stringify(value, null, indentation)}\n`);
}
