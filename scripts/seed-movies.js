import 'dotenv/config';
import mongoose from 'mongoose';
import { importPopularMovies } from '../src/crawler.js';

const targetCount = Number(process.argv[2] || 60);

try {
  if (!process.env.TMDB_API_KEY || process.env.TMDB_API_KEY.startsWith('replace_')) {
    throw new Error('TMDB_API_KEY is missing in .env. Add your TMDB v3 API key, save .env and rerun this command.');
  }
  if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME) {
    throw new Error('MONGODB_URI and MONGODB_DB_NAME must be set in .env.');
  }

  console.log('Situla movie seed starting. Target:', targetCount, 'new eligible movies.');
  const result = await importPopularMovies({ targetCount, maxPages: 20 });
  console.log('\nMovie seed result');
  console.log('New movies added:', result.imported);
  console.log('Still missing:', result.remaining);
  console.log('Candidates checked:', result.candidatesChecked);
  console.log('Discovery pages:', result.pagesProcessed);
  console.log('Filtered by existing criteria:', result.filtered);
  console.log('Already in database:', result.duplicates);
  console.log('Failed metadata/database writes:', result.failed);

  if (result.failures.length) {
    console.error('\nFirst errors:');
    for (const failure of result.failures) {
      console.error('-', failure.tmdbId || failure.imdbId || ('page ' + (failure.page || '?')), failure.message);
    }
  }
  if (!result.targetReached) {
    console.error('\nThe target was not reached. Check the errors above and rerun the command; existing records will not be duplicated.');
    process.exitCode = 1;
  } else {
    console.log('\nDone: 60 new eligible movies are in the database.');
  }
} catch (error) {
  console.error('\nMovie seed failed:', error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
