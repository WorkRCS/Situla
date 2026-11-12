import 'dotenv/config';
import mongoose from 'mongoose';
import { initializeDatabaseIndexes } from '../src/db.js';

try {
  await initializeDatabaseIndexes();
  console.log('Situla database indexes are ready.');
} catch (error) {
  console.error('Database index initialization failed:', error?.message || 'Unknown error');
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
