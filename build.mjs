// Builds public/index.html (online server page) and dist/duskhold.html (single-file solo version).
import fs from 'node:fs';
import { build } from 'esbuild';
const shell = fs.readFileSync('src/shell.html', 'utf8');
const cut = shell.indexOf('</style>') + '</style>'.length;
const head = shell.slice(0, cut), body = shell.slice(cut);
const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js';
const online = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
${head}
</head>
<body>
${body}
<script>window.DUSKHOLD_ONLINE = true;</script>
<script type="importmap">{"imports":{"three":"/vendor/three.module.js"}}</script>
<script type="module" src="/client/main.js"></script>
</body>
</html>
`;
fs.writeFileSync('public/index.html', online);
const minify = !process.argv.includes('--dev');
const r = await build({ entryPoints: ['public/client/main.js'], bundle: true, format: 'esm', external: ['three'], write: false, minify, target: 'es2020', legalComments: 'none' });
let js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
fs.mkdirSync('dist', { recursive: true });
const solo = `${head}
${body}
<script type="importmap">{"imports":{"three":"${THREE_CDN}"}}</script>
<script type="module">
${js}
</script>
`;
fs.writeFileSync('dist/duskhold.html', solo);
// solo version as a normal web page (for itch.io or any web host)
fs.mkdirSync('solo-version', { recursive: true });
fs.writeFileSync('solo-version/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
${head}
</head>
<body>
${body}
<script type="importmap">{"imports":{"three":"${THREE_CDN}"}}</script>
<script type="module">
${js}
</script>
</body>
</html>
`);
// online copy for other websites (e.g. nyborggaming.vercel.app): one file that plays on the Render server
const SERVER = process.env.DUSKHOLD_SERVER || 'wss://duskhold.onrender.com/ws';
fs.writeFileSync('dist/duskhold-online.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
${head}
</head>
<body>
${body}
<script>window.DUSKHOLD_ONLINE = true; window.DUSKHOLD_SERVER = ${JSON.stringify(SERVER)};</script>
<script type="importmap">{"imports":{"three":"${THREE_CDN}"}}</script>
<script type="module">
${js}
</script>
</body>
</html>
`);
// local test copy of the solo build (full document, loads three from node_modules)
fs.writeFileSync('dist/solo-test.html', `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${head}</head><body>${body}<script type="importmap">{"imports":{"three":"/vendor/three.module.js"}}</script><script type="module">${js}</script></body></html>`);
console.log('built: public/index.html, dist/duskhold.html, solo-version/index.html', (solo.length / 1024).toFixed(0) + ' KB');
