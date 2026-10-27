const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const sourceRoots = ['src/pages', 'src/components'];
const primitiveFiles = new Set([
  'src/components/Button.js',
  'src/components/FormFields.js',
  'src/components/Table.js',
]);
const styledButtonAllowlist = new Set([
  'src/components/Modal.js',
  'src/components/SidebarLayout.js',
  // Controles espaciais do mapa de mesas, não ações convencionais da aplicação.
  'src/pages/TableReservations.js',
]);
const documentMarkupAllowlist = new Map([
  ['src/pages/Production.js', { table: 1 }],
  ['src/pages/Reports.js', { table: 1 }],
]);
const violations = [];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(target);
    return /\.(js|jsx)$/.test(entry.name) && !/\.test\.(js|jsx)$/.test(entry.name) ? [target] : [];
  });
}

for (const file of sourceRoots.flatMap((root) => walk(path.join(projectRoot, root)))) {
  const relative = path.relative(projectRoot, file).replace(/\\/g, '/');
  const source = fs.readFileSync(file, 'utf8');

  if (!primitiveFiles.has(relative)) {
    const styledMatches = [...source.matchAll(/styled\.(button|input|select|textarea|table)\b/g)];
    styledMatches.forEach((match) => violations.push(`${relative}: componente styled.${match[1]} deve estender o primitivo compartilhado`));

    if (!styledButtonAllowlist.has(relative) && /styled\(DSButton\)/.test(source)) {
      violations.push(`${relative}: não personalize DSButton; use variant, size, fullWidth ou iconOnly`);
    }
  }

  const allowance = documentMarkupAllowlist.get(relative) || {};
  for (const tag of ['button', 'input', 'select', 'textarea', 'table']) {
    const matches = [...source.matchAll(new RegExp(`<${tag}(?=\\s|>)`, 'g'))];
    const allowed = allowance[tag] || 0;
    matches.slice(allowed).forEach(() => violations.push(`${relative}: <${tag}> nativo deve usar o componente compartilhado`));
  }
}

if (violations.length) {
  console.error('Inconsistências de UI encontradas:\n');
  violations.forEach((violation) => console.error(`- ${violation}`));
  process.exit(1);
}

console.log('UI padronizada: nenhuma implementação paralela de botão, campo ou tabela encontrada.');
