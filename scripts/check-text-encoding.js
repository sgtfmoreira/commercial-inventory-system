const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const ignoredDirectories = new Set(['.git', '.tools', '.worktrees', 'node_modules', 'build', 'coverage']);
const checkedExtensions = new Set(['.js', '.jsx', '.json', '.md', '.html', '.css', '.prisma', '.sql']);
const corruptedText = /Ã(?:ƒ|§|£|¡|©|µ|­|³|º|ª)|â€”|Â(?:°|º|ª)|�/u;
const findings = [];

const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            visit(fullPath);
            continue;
        }
        if (fullPath === __filename) continue;
        if (!checkedExtensions.has(path.extname(entry.name))) continue;

        const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/u);
        lines.forEach((line, index) => {
            if (corruptedText.test(line)) {
                findings.push(`${path.relative(root, fullPath)}:${index + 1}: ${line.trim()}`);
            }
        });
    }
};

visit(root);

if (findings.length) {
    console.error('Foram encontrados textos possivelmente corrompidos por codificação:');
    findings.forEach(finding => console.error(`- ${finding}`));
    process.exit(1);
}

console.log('Codificação de textos validada.');
