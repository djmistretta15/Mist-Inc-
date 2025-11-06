#!/usr/bin/env node
import { program } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { scaffoldEngine } from '../src/scaffold.js';

program
  .name('create-mist-engine')
  .description('Create a new Mist arbitrage engine')
  .argument('[name]', 'Engine name (e.g., "gpu-engine", "memory-arb")')
  .option('-t, --type <type>', 'Engine type (gpu, memory, data, latency, edge, energy)')
  .option('-d, --dir <directory>', 'Output directory')
  .action(async (name, options) => {
    console.log(chalk.cyan('\n🌫️  Mist Engine Generator\n'));

    // If name not provided, prompt for it
    if (!name) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'engineName',
          message: 'Engine name:',
          default: 'my-engine',
          validate: (input) => input.length > 0 || 'Name is required'
        }
      ]);
      name = answers.engineName;
    }

    // If type not provided, prompt for it
    let type = options.type;
    if (!type) {
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'engineType',
          message: 'What type of arbitrage engine?',
          choices: [
            { name: '🖥️  GPU (Compute)', value: 'gpu' },
            { name: '💾 Memory (VRAM/RAM)', value: 'memory' },
            { name: '📊 Data (Provenance/Rights)', value: 'data' },
            { name: '⚡ Latency (Edge/Region)', value: 'latency' },
            { name: '🌐 Edge (Distributed Nodes)', value: 'edge' },
            { name: '🔋 Energy (Time-of-Use)', value: 'energy' },
            { name: '🔧 Custom', value: 'custom' }
          ]
        }
      ]);
      type = answers.engineType;
    }

    const dir = options.dir || `./${name}`;

    console.log(chalk.gray(`\nCreating ${type} engine: ${name}`));
    console.log(chalk.gray(`Output directory: ${dir}\n`));

    try {
      await scaffoldEngine(name, type, dir);

      console.log(chalk.green('\n✅ Engine created successfully!\n'));
      console.log(chalk.cyan('Next steps:'));
      console.log(chalk.gray(`  cd ${dir}`));
      console.log(chalk.gray('  npm install'));
      console.log(chalk.gray('  npm run dev\n'));
      console.log(chalk.cyan('Documentation:'));
      console.log(chalk.gray('  README.md - Getting started'));
      console.log(chalk.gray('  src/engine.ts - Your engine implementation\n'));
    } catch (err) {
      console.error(chalk.red(`\n❌ Failed to create engine: ${err.message}\n`));
      process.exit(1);
    }
  });

program.parse();
