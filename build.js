const fs = require("fs");
const path = require("path");
const { ZipArchive } = require("archiver");

function build() {
    const distDir = path.join(__dirname, "dist");
    if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
    }

    const zipPath = path.join(distDir, "paper-lite.zip");
    const output = fs.createWriteStream(zipPath);
    const archive = new ZipArchive({
        zlib: { level: 9 },
    });

    output.on("close", () => {
        const sizeMb = (archive.pointer() / (1024 * 1024)).toFixed(2);
        console.log(`Сборка завершена успешно: ${zipPath}`);
        console.log(`Итоговый размер архива: ${sizeMb} MB (${archive.pointer()} байт)`);
    });

    archive.on("warning", (err) => {
        if (err.code === "ENOENT") {
            console.warn(err);
        } else {
            throw err;
        }
    });

    archive.on("error", (err) => {
        throw err;
    });

    archive.pipe(output);

    archive.directory("src/", "src");
    archive.directory("docs/", "docs");
    if (fs.existsSync("AGENTS.md")) {
        archive.file("AGENTS.md", { name: "AGENTS.md" });
    }

    archive.finalize();
}

build();
