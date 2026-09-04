import { runSeedScript, seedCatalogue } from './catalogue';

runSeedScript('Seed', () => seedCatalogue({ truncate: false }));
