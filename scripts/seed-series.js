import 'dotenv/config';
import mongoose from 'mongoose';
import { TvSeries, AnimeSeries } from '../src/models.js';
import { importTvSeriesIds, importAnimeIds, importPopularTvSeries, importPopularAnimeSeries } from '../src/series.js';

const mode = String(process.argv[2] || 'all').trim().toLowerCase();
const targetCount = Number(process.argv[3] || 50);

const STARTER_TV_IDS = [
  1396, 1399, 87108, 70523, 66732, 76479, 100088, 95396, 94605, 63639,
  19885, 82856, 83867, 93740, 125988, 95557, 84958, 61889, 62560, 42009
];
const STARTER_ANIME_MAL_IDS = [5114, 16498, 1535, 11061, 9253, 38000, 40748, 30276, 32182, 37521, 52991, 44511];

function printPopularResult(label, result) {
  console.log('\n' + label + ' discovery result');
  console.log('New popular titles added:', result.imported);
  console.log('Still missing:', result.remaining);
  console.log('Candidates checked:', result.candidatesChecked);
  console.log('Discovery pages:', result.pagesProcessed);
  console.log('Filtered by quality/safety criteria:', result.filtered);
  console.log('Already in database:', result.duplicates);
  console.log('Failed requests/database writes:', result.failed);
  if (result.failures.length) {
    console.error('First errors:');
    for (const failure of result.failures) {
      console.error('-', failure.tmdbId || failure.malId || ('page ' + (failure.page || '?')), failure.message);
    }
  }
  if (!result.targetReached) {
    process.exitCode = 1;
    console.error(label + ' target not reached. Existing records are never duplicated; rerun after resolving the reported issue.');
  }
}

async function seedTv() {
  if (!process.env.TMDB_API_KEY || process.env.TMDB_API_KEY.startsWith('replace_')) {
    throw new Error('TMDB_API_KEY is missing in .env. Add your TMDB v3 API key to import TV series.');
  }

  console.log('\nTV: checking the 20 existing curated starter IDs…');
  const present = new Set((await TvSeries.find({ tmdbId: { $in: STARTER_TV_IDS } }).select('tmdbId').lean()).map((item) => Number(item.tmdbId)));
  const missing = STARTER_TV_IDS.filter((id) => !present.has(id));
  let starterImported = 0;
  if (missing.length) {
    const starter = await importTvSeriesIds({ ids: missing });
    starterImported = starter.imported;
  }
  await TvSeries.updateMany(
    { tmdbId: { $in: STARTER_TV_IDS }, moderationStatus: { $ne: 'rejected' } },
    { $set: { moderationStatus: 'approved', manualReviewNote: 'Curated Situla TV series; English, non-adult, rating and artwork filters passed.' } }
  );
  console.log('Curated TV starter titles added:', starterImported);

  const result = await importPopularTvSeries({ targetCount, maxPages: 30 });
  printPopularResult('TV', result);
}

async function seedAnime() {
  console.log('\nAnime: checking the 12 existing curated starter IDs…');
  const present = new Set((await AnimeSeries.find({ malId: { $in: STARTER_ANIME_MAL_IDS } }).select('malId').lean()).map((item) => Number(item.malId)));
  const missing = STARTER_ANIME_MAL_IDS.filter((id) => !present.has(id));
  let starterImported = 0;

  // Import one at a time so a single Jikan failure cannot discard earlier saves.
  for (const malId of missing) {
    const starter = await importAnimeIds({ ids: [malId] });
    starterImported += starter.imported;
  }
  await AnimeSeries.updateMany(
    { malId: { $in: STARTER_ANIME_MAL_IDS }, moderationStatus: { $ne: 'rejected' } },
    { $set: { moderationStatus: 'approved', manualReviewNote: 'Curated Situla anime; SFW TV/ONA, MAL score and artwork filters passed.' } }
  );
  console.log('Curated anime starter titles added:', starterImported);

  const result = await importPopularAnimeSeries({ targetCount, maxPages: 30 });
  printPopularResult('Anime', result);
}

if (!['all', 'tv', 'anime'].includes(mode)) {
  console.error('Usage: node scripts/seed-series.js [all|tv|anime] [targetCount]');
  process.exitCode = 2;
} else if (!Number.isSafeInteger(targetCount) || targetCount < 1 || targetCount > 200) {
  console.error('targetCount must be a whole number between 1 and 200.');
  process.exitCode = 2;
} else if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME) {
  console.error('MONGODB_URI and MONGODB_DB_NAME must be set in .env.');
  process.exitCode = 1;
} else {
  console.log('Situla series seed starting. Target:', targetCount, 'new popular TV titles and', targetCount, 'new popular anime titles.');
  if (mode === 'all' || mode === 'tv') {
    try {
      await seedTv();
    } catch (error) {
      process.exitCode = 1;
      console.error('\nTV seed failed:', error.message);
    }
  }
  if (mode === 'all' || mode === 'anime') {
    try {
      await seedAnime();
    } catch (error) {
      process.exitCode = 1;
      console.error('\nAnime seed failed:', error.message);
    }
  }
}

if (process.exitCode === undefined || process.exitCode === 0) {
  console.log('\nSeries seed finished.');
}
await mongoose.disconnect().catch(() => {});
