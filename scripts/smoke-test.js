const { spawn } = require('child_process');
const path = require('path');

const TIMEOUT = 5000;
const electron = require('electron');
const appDir = path.resolve(__dirname, '..');

console.log('Smoke test: spawning Electron...');
const child = spawn(electron, [appDir], { stdio: 'ignore', env: { ...process.env, ELECTRON_DISABLE_GPU: '1' } });

let exited = false;

child.on('exit', (code) => {
  exited = true;
  if (code === 0) {
    console.log('PASS — app exited cleanly');
    process.exit(0);
  } else {
    console.error(`FAIL — app exited with code ${code}`);
    process.exit(1);
  }
});

child.on('error', (err) => {
  exited = true;
  console.error(`FAIL — could not spawn: ${err.message}`);
  process.exit(1);
});

setTimeout(() => {
  if (!exited) {
    console.log('PASS — app still running after 5s');
    child.kill();
    process.exit(0);
  }
}, TIMEOUT);
