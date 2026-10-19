import { spawn } from 'node:child_process';

const [command = 'dev', ...args] = process.argv.slice(2);
const cli =
  process.platform === 'win32' ? '.\\node_modules\\.bin\\tauri.cmd' : 'node_modules/.bin/tauri';

const configCommands = new Set(['build', 'dev']);
const commandArgs = configCommands.has(command)
  ? [command, '--config', 'backend/tauri.conf.json', ...args]
  : [command, ...args];

const child = spawn(cli, commandArgs, {
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code ?? 1));
child.on('error', (error) => {
  console.error(`\n❌ Unable to start Tauri: ${error.message}`);
  process.exit(1);
});
