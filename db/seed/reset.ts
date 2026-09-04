import { runSeedScript, seedCatalogue } from './catalogue';

runSeedScript('Reset', () => seedCatalogue({ truncate: true }));
