import { runFile, showHelp, showAbout, showVersion } from './commands.js';

export function start() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'run': {
      const filePath = args[1];
      if (!filePath) {
        console.error('Error: Missing file path for "run" command.');
        showHelp();
        return;
      }
      runFile(filePath);
      break;
    }
    case 'version':
      showVersion();
      break;
    case 'about':
      showAbout();
      break;
    case 'help':
      showHelp();
      break;

    default:
      if (!command) {
        console.log('Welcome to Lumen! Use "lumen help" to see available commands.');
      } else {
        console.error(`Error: Unknown command "${command}"`);
        showHelp();
      }
      break;
  }
}
