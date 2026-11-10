import "dotenv/config";
import mongoose from "mongoose";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { connectDatabase } from "../src/db.js";
import { TvSeries } from "../src/models.js";
import { STATIC_TV_SERIES } from "../data/tv-catalog.js";
import { TV_SERIES_CANDIDATES } from "../data/tv-additions.js";

const TVMAZE_API = "https://api.tvmaze.com";
const TV_SERIES_TARGET_ADDITIONS = 200;
const REQUEST_INTERVAL_MS = 520;
const USER_AGENT = "Situla-TV-Catalog/2.0 (https://github.com/WorkRCS/Situla)";
const DISALLOWED_GENRES = new Set(["adult", "erotica", "porn", "pornographic", "hentai"]);
const imageValidationCache = new Map();
let nextRequestAt = 0;
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

export function normalizeShowName(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
}
export function stripHtml(value) {
  return String(value || "").replace(/<\/p>\s*<p[^>]*>/gi, "\n\n").replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ").trim().slice(0, 4000);
}
function safeHttpsUrl(value) {
  try { const url = new URL(String(value || "")); return url.protocol === "https:" ? url.toString() : null; }
  catch { return null; }
}
export function isExactTvmazeMatch(show, candidate) {
  if (!show?.id || normalizeShowName(show.name) !== normalizeShowName(candidate?.title)) return false;
  const expectedYear = String(candidate?.firstAirDate || "").slice(0, 4);
  const actualYear = String(show.premiered || show.ended || "").slice(0, 4);
  return !expectedYear || !actualYear || expectedYear === actualYear;
}
export function buildSeasonRecords(episodes, fallbackPoster = null) {
  const grouped = new Map();
  for (const episode of Array.isArray(episodes) ? episodes : []) {
    const seasonNumber = Number(episode?.season), episodeNumber = Number(episode?.number);
    if (!Number.isSafeInteger(seasonNumber) || seasonNumber < 0 || !Number.isSafeInteger(episodeNumber) || episodeNumber < 1) continue;
    if (!grouped.has(seasonNumber)) grouped.set(seasonNumber, []);
    grouped.get(seasonNumber).push({
      episodeNumber, name: String(episode.name || "Episode " + episodeNumber).trim().slice(0, 240),
      overview: stripHtml(episode.summary),
      airDate: /^\d{4}-\d{2}-\d{2}$/.test(String(episode.airdate || "")) ? episode.airdate : null,
      runtime: Number(episode.runtime) > 0 ? Number(episode.runtime) : null,
      stillUrl: safeHttpsUrl(episode.image?.original || episode.image?.medium),
      voteAverage: Math.max(0, Math.min(10, Number(episode.rating?.average) || 0))
    });
  }
  return [...grouped.entries()].sort(([a],[b])=>a-b).map(([seasonNumber, seasonEpisodes])=>{
    seasonEpisodes.sort((a,b)=>a.episodeNumber-b.episodeNumber);
    return { seasonNumber, name: seasonNumber===0?"Specials":"Season "+seasonNumber, overview:"",
      airDate:seasonEpisodes.find(e=>e.airDate)?.airDate||null, episodeCount:seasonEpisodes.length,
      posterUrl:fallbackPoster, voteAverage:0, episodes:seasonEpisodes };
  });
}
export function mapTvmazeShow(show, candidate) {
  if (!isExactTvmazeMatch(show,candidate)) return null;
  const overview=stripHtml(show.summary);
  if(overview.length<40)return null;
  const imageUrl=safeHttpsUrl(show.image?.original||show.image?.medium)||safeHttpsUrl(candidate.posterUrl);
  if(!imageUrl)return null;
  const genres=Array.isArray(show.genres)&&show.genres.length
    ? show.genres.map(g=>String(g).trim()).filter(Boolean)
    : (Array.isArray(candidate.genres)?candidate.genres:[]);
  if(genres.some(g=>DISALLOWED_GENRES.has(String(g).toLowerCase().trim())))return null;
  const rawEpisodes=show?._embedded?.episodes;
  if(!Array.isArray(rawEpisodes)||rawEpisodes.length<2)return null;
  const seasons=buildSeasonRecords(rawEpisodes,imageUrl);
  const numberOfEpisodes=seasons.reduce((n,s)=>n+s.episodeCount,0);
  const numberOfSeasons=seasons.filter(s=>s.seasonNumber>0).length;
  if(!numberOfEpisodes||!numberOfSeasons)return null;
  const firstAirDate=/^\d{4}-\d{2}-\d{2}$/.test(String(show.premiered||""))?show.premiered:candidate.firstAirDate;
  const imdb=String(show.externals?.imdb||"").trim().toLowerCase();
  return {
    tmdbId:Number(candidate.tmdbId), externalImdbId:/^tt\d{5,12}$/.test(imdb)?imdb:null,
    title:String(show.name).trim(), originalTitle:String(show.name).trim(), overview,
    posterUrl:imageUrl, backdropUrl:imageUrl, firstAirDate, releaseYear:Number(firstAirDate.slice(0,4))||null,
    runtime:Number(show.averageRuntime||show.runtime)>0?Number(show.averageRuntime||show.runtime):null,
    adult:false, metadataSource:"TVmaze", sourceId:Number(show.id),
    sourceUrl:"https://www.tvmaze.com/shows/"+encodeURIComponent(show.id),
    referenceUrl:String(candidate.referenceUrl||""),
    voteAverage:Math.max(0,Math.min(10,Number(show.rating?.average)||0)), voteCount:0,
    popularity:Number(show.weight)||0, genres, keywords:[], certification:"", status:String(show.status||""),
    numberOfSeasons, numberOfEpisodes,
    network:String(show.network?.name||show.webChannel?.name||candidate.network||"").trim(),
    country:String(show.network?.country?.name||show.webChannel?.country?.name||candidate.country||"").trim(),
    creators:Array.isArray(candidate.creators)?candidate.creators:[], seasons
  };
}
async function tvmazeRequest(path,attempt=0) {
  const wait=Math.max(0,nextRequestAt-Date.now());if(wait)await sleep(wait);nextRequestAt=Date.now()+REQUEST_INTERVAL_MS;
  let response;
  try {
    response=await fetch(TVMAZE_API+path,{headers:{Accept:"application/json","User-Agent":USER_AGENT},signal:AbortSignal.timeout(20000)});
  } catch(error) {
    if(attempt<3){await sleep(1000*(attempt+1));return tvmazeRequest(path,attempt+1);}throw error;
  }
  if(response.status===404)return null;
  if((response.status===429||response.status>=500)&&attempt<5){
    const retry=Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retry)&&retry>0?Math.min(retry*1000,30000):Math.min(1000*(2**attempt),15000));
    return tvmazeRequest(path,attempt+1);
  }
  if(!response.ok)throw new Error("TVmaze returned HTTP "+response.status+".");
  return response.json();
}
async function findTvmazeShow(candidate) {
  const query=encodeURIComponent(candidate.title);
  const direct=await tvmazeRequest("/singlesearch/shows?q="+query+"&embed=episodes");
  if(isExactTvmazeMatch(direct,candidate)&&Array.isArray(direct?._embedded?.episodes))return direct;
  const results=await tvmazeRequest("/search/shows?q="+query);
  const matches=(Array.isArray(results)?results:[]).map(e=>e?.show).filter(s=>isExactTvmazeMatch(s,candidate))
    .sort((a,b)=>Number(Boolean(b?.image))-Number(Boolean(a?.image)));
  const match=matches[0];if(!match?.id)return null;
  if(Array.isArray(match?._embedded?.episodes))return match;
  return tvmazeRequest("/shows/"+encodeURIComponent(match.id)+"?embed=episodes");
}
async function verifyRemoteImage(value) {
  const url=safeHttpsUrl(value);if(!url)return false;
  if(imageValidationCache.has(url))return imageValidationCache.get(url);
  const check=(async()=>{
    try {
      const head=await fetch(url,{method:"HEAD",headers:{"User-Agent":USER_AGENT,Accept:"image/*,*/*;q=0.8"},signal:AbortSignal.timeout(10000)});
      const type=String(head.headers.get("content-type")||"").toLowerCase();
      if(head.ok&&type.startsWith("image/"))return true;
      if(![403,405,501].includes(head.status)&&!head.ok)return false;
    }catch{}
    try{
      const response=await fetch(url,{method:"GET",headers:{"User-Agent":USER_AGENT,Range:"bytes=0-0",Accept:"image/*"},signal:AbortSignal.timeout(10000)});
      const type=String(response.headers.get("content-type")||"").toLowerCase();
      const valid=response.ok&&type.startsWith("image/");
      await response.body?.cancel().catch(()=>{});
      return valid;
    }catch{return false;}
  })();
  imageValidationCache.set(url,check);return check;
}
async function mapWithConcurrency(items,concurrency,mapper) {
  const output=new Array(items.length);let next=0;
  await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{
    while(true){const index=next++;if(index>=items.length)return;output[index]=await mapper(items[index],index);}
  }));
  return output;
}
async function validateSeriesArtwork(item,candidate) {
  const posters=[...new Set([item.posterUrl,candidate.posterUrl].map(safeHttpsUrl).filter(Boolean))];
  let poster=null;
  for(const option of posters){if(await verifyRemoteImage(option)){poster=option;break;}}
  if(!poster)return null;
  const seasons=await mapWithConcurrency(item.seasons,6,async season=>{
    const episodes=await mapWithConcurrency(season.episodes,12,async episode=>({
      ...episode,stillUrl:episode.stillUrl&&await verifyRemoteImage(episode.stillUrl)?episode.stillUrl:null
    }));
    return {...season,posterUrl:poster,episodes};
  });
  return {...item,posterUrl:poster,backdropUrl:poster,seasons};
}
function staticCandidate(item) {
  return {tmdbId:Number(item.tmdbId),title:item.title,firstAirDate:item.firstAirDate,posterUrl:item.posterUrl,
    genres:item.genres||[],network:"",country:"",creators:[],referenceUrl:item.sourceUrl||""};
}
function titleYearKey(title,date){return normalizeShowName(title)+"|"+String(date||"").slice(0,4);}
async function prepareCandidate(candidate) {
  const show=await findTvmazeShow(candidate);if(!show)return null;
  const mapped=mapTvmazeShow(show,candidate);if(!mapped)return null;
  return validateSeriesArtwork(mapped,candidate);
}
export async function seedTvSeries() {
  if(!process.env.MONGODB_URI||!process.env.MONGODB_DB_NAME)throw new Error("Set MONGODB_URI and MONGODB_DB_NAME before running the TV seed.");
  if(!Array.isArray(TV_SERIES_CANDIDATES)||TV_SERIES_CANDIDATES.length<TV_SERIES_TARGET_ADDITIONS)
    throw new Error("TV candidate pack does not contain enough records to seed 200 new series.");
  await connectDatabase();
  const existingDocuments=await TvSeries.find({}).select("tmdbId title firstAirDate metadataSource overview backdropUrl seasons").lean();
  const existingById=new Map(existingDocuments.map(item=>[Number(item.tmdbId),item]));
  const occupiedIds=new Set(existingById.keys());
  const occupiedTitleYears=new Set(existingDocuments.map(item=>titleYearKey(item.title,item.firstAirDate)));
  for(const item of STATIC_TV_SERIES){occupiedIds.add(Number(item.tmdbId));occupiedTitleYears.add(titleYearKey(item.title,item.firstAirDate));}

  console.log("TV seed: checking existing static records and preparing 200 new TMDB-keyed series.");
  const legacyRecords=[],legacyFailures=[];
  for(const item of STATIC_TV_SERIES){
    const current=existingById.get(Number(item.tmdbId));
    const needs=!current||current.metadataSource==="Situla static catalog"||!String(current.overview||"").trim()||
      !Array.isArray(current.seasons)||current.seasons.length===0||!current.backdropUrl;
    if(!needs)continue;
    try{const mapped=await prepareCandidate(staticCandidate(item));if(mapped)legacyRecords.push(mapped);
      else legacyFailures.push(item.title+" (metadata, guide or artwork unavailable)");}
    catch(error){legacyFailures.push(item.title+" ("+error.message+")");}
  }

  const newRecords=[],failures=[],seenIds=new Set();
  for(const candidate of TV_SERIES_CANDIDATES){
    if(newRecords.length>=TV_SERIES_TARGET_ADDITIONS)break;
    const id=Number(candidate.tmdbId),key=titleYearKey(candidate.title,candidate.firstAirDate);
    if(occupiedIds.has(id)||occupiedTitleYears.has(key)||seenIds.has(id))continue;
    seenIds.add(id);
    try{
      const mapped=await prepareCandidate(candidate);
      if(!mapped){failures.push(candidate.title+" (no exact TVmaze match or complete verified metadata)");continue;}
      newRecords.push(mapped);occupiedIds.add(id);occupiedTitleYears.add(key);
      console.log("  ✓ "+mapped.title+" · TMDB "+mapped.tmdbId+" · "+mapped.numberOfEpisodes+" verified episodes");
    }catch(error){failures.push(candidate.title+" ("+error.message+")");}
  }
  if(newRecords.length!==TV_SERIES_TARGET_ADDITIONS)
    throw new Error("TV seed preflight stopped before database writes: verified "+newRecords.length+" of "+TV_SERIES_TARGET_ADDITIONS+
      " new series. Candidate failures: "+failures.slice(0,12).join("; "));

  const operations=[];
  for(const record of legacyRecords){
    const existing=existingById.get(record.tmdbId);
    const needs=!existing||existing.metadataSource==="Situla static catalog"||!String(existing.overview||"").trim()||
      !Array.isArray(existing.seasons)||existing.seasons.length===0||!existing.backdropUrl;
    if(!needs)continue;
    operations.push({updateOne:{filter:{tmdbId:record.tmdbId},update:existing?{$set:record}:{$setOnInsert:record},upsert:!existing}});
  }
  for(const record of newRecords)operations.push({
    updateOne:{filter:{tmdbId:record.tmdbId},update:{$setOnInsert:record},upsert:true}
  });
  await TvSeries.bulkWrite(operations,{ordered:true});

  const newIds=newRecords.map(item=>item.tmdbId);
  const saved=await TvSeries.find({tmdbId:{$in:newIds}})
    .select("tmdbId adult overview posterUrl backdropUrl seasons").lean();
  const byId=new Map(saved.map(item=>[Number(item.tmdbId),item]));
  const invalid=newIds.filter(id=>{
    const item=byId.get(id);
    return !item||item.adult===true||String(item.overview||"").trim().length<40||
      !safeHttpsUrl(item.posterUrl)||!safeHttpsUrl(item.backdropUrl)||
      !Array.isArray(item.seasons)||!item.seasons.some(s=>Number(s.episodeCount)>0&&Array.isArray(s.episodes)&&s.episodes.length>0);
  });
  if(invalid.length)throw new Error("TV seed database verification failed for TMDB IDs: "+invalid.join(", "));
  console.log("TV seed complete: "+saved.length+" new series saved; "+legacyRecords.length+
    " existing static records enriched; "+legacyFailures.length+" legacy records could not be refreshed.");
  if(legacyFailures.length)console.warn("Legacy TV refresh warnings: "+legacyFailures.slice(0,12).join("; "));
  return {added:saved.length,enriched:legacyRecords.length,legacyFailures:legacyFailures.length,totalNew:TV_SERIES_TARGET_ADDITIONS};
}
export { TV_SERIES_TARGET_ADDITIONS };
const isDirectRun=process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
if(isDirectRun)seedTvSeries().catch(error=>{
  console.error("Situla TV seed failed:",error.message);process.exitCode=1;
}).finally(async()=>{await mongoose.disconnect().catch(()=>{});});
