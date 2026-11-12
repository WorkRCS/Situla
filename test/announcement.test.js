import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  parseAnnouncementDate,
  getAnnouncementStatus,
  resolveAnnouncementMedia,
  formatAnnouncementDateTime
} from '../src/announcement-utils.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('announcement dates preserve exact instants and publication scheduling is stable', () => {
  const now = new Date('2026-11-12T10:00:00.000Z');
  assert.equal(parseAnnouncementDate(null), null);
  assert.equal(parseAnnouncementDate('not-a-date'), null);
  assert.equal(parseAnnouncementDate('2026-11-12T11:30:00.000Z').toISOString(), '2026-11-12T11:30:00.000Z');
  assert.equal(getAnnouncementStatus('draft', null, now), 'draft');
  assert.equal(getAnnouncementStatus('publish', '2026-11-12T11:00:00.000Z', now), 'scheduled');
  assert.equal(getAnnouncementStatus('publish', '2026-11-12T09:59:59.000Z', now), 'published');
  assert.equal(getAnnouncementStatus('publish', null, now), null);
});


test('announcement date-time formatting accepts a timezone name with explicit date/time fields', () => {
  const value = '2026-11-12T10:15:00.000Z';
  const formatted = formatAnnouncementDateTime(value, 'en-GB');
  assert.equal(typeof formatted, 'string');
  assert.match(formatted, /2026/);
  assert.doesNotMatch(formatted, /Invalid Date/);
  assert.equal(formatAnnouncementDateTime('invalid-date', 'en-GB'), 'Date unavailable');
});

test('announcement media supports uploads, direct image URLs and approved video embeds only', () => {
  assert.deepEqual(resolveAnnouncementMedia('', '/api/announcements/abc/image'), {
    type: 'image', src: '/api/announcements/abc/image'
  });
  assert.equal(resolveAnnouncementMedia('https://cdn.example.com/banner.webp?width=100').type, 'image');
  assert.equal(
    resolveAnnouncementMedia('https://www.youtube.com/watch?v=dQw4w9WgXcQ').src,
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
  );
  assert.equal(
    resolveAnnouncementMedia('https://vimeo.com/123456789').src,
    'https://player.vimeo.com/video/123456789'
  );
  assert.equal(resolveAnnouncementMedia('https://evil-youtube.com/watch?v=dQw4w9WgXcQ').type, 'link');
  assert.equal(resolveAnnouncementMedia('http://cdn.example.com/banner.jpg'), null);
  assert.equal(resolveAnnouncementMedia('javascript:alert(1)'), null);
});

test('announcement API and admin CRUD persist media, schedule and account-scoped read receipts', async () => {
  const app = await read('../src/app.js');
  const admin = await read('../src/admin.js');
  const models = await read('../src/models.js');
  const db = await read('../src/db.js');

  assert.match(app, /app\.get\('\/api\/announcements'/);
  const publicFeedStart = app.indexOf("app.get('/api/announcements'");
  const selectionStart = app.indexOf("const items = await Announcement.find(", publicFeedStart);
  const selectionEnd = app.indexOf(".lean();", selectionStart);
  const selectionQuery = app.slice(selectionStart, selectionEnd);
  assert.ok(selectionQuery.includes("status: { $in: ['published', 'scheduled'] }"));
  assert.ok(selectionQuery.includes("scheduledAt: { $lte: now }"));
  assert.doesNotMatch(selectionQuery, /role:|planId:|segment:|audience:|userId:/);
  assert.match(app, /app\.get\('\/api\/announcements\/:announcementId\/image'/);
  assert.match(app, /app\.post\('\/api\/announcements\/:announcementId\/read'/);
  assert.match(app, /viewerScope/);
  assert.match(app, /AnnouncementRead\.updateOne/);
  assert.match(app, /status: \{ \$in: \['published', 'scheduled'\] \}, scheduledAt: \{ \$lte: new Date\(\) \}/);

  assert.match(admin, /router\.get\('\/announcements'/);
  assert.match(admin, /router\.get\('\/announcements\/:announcementId\/image'/);
  assert.match(admin, /uploadedImageUrl: hasImage \? '\/api\/admin\/announcements\/'/);
  assert.match(admin, /router\.post\('\/announcements'/);
  assert.match(admin, /router\.patch\('\/announcements\/:announcementId'/);
  assert.match(admin, /router\.delete\('\/announcements\/:announcementId'/);
  assert.match(admin, /4 \* 1024 \* 1024/);
  assert.match(admin, /does not match its declared image format/);
  assert.match(admin, /AnnouncementRead\.deleteMany/);

  assert.match(models, /const announcementSchema/);
  assert.match(models, /const announcementReadSchema/);
  assert.match(models, /announcementReadSchema\.index\(\{ userId: 1, announcementId: 1 \}, \{ unique: true \}\)/);
  assert.match(db, /Announcement\.createIndexes\(\)/);
  assert.match(db, /AnnouncementRead\.createIndexes\(\)/);
});

test('announcement UI schedules, uploads or embeds media, and lets visitors mark items read', async () => {
  const manager = await read('../app/components/announcement-manager.jsx');
  const center = await read('../app/components/announcement-center.jsx');
  const dashboard = await read('../app/components/admin-dashboard.jsx');
  const layout = await read('../app/layout.jsx');
  const app = await read('../app/components/situla-app.jsx');
  const utils = await read('../src/announcement-utils.js');

  assert.match(manager, /type="datetime-local"/);
  assert.match(manager, /type="file"/);
  assert.match(manager, /Save draft/);
  assert.match(manager, /Publish \/ schedule/);
  assert.match(manager, /FormData/);
  assert.match(center, /Mark as read/);
  assert.match(center, /header-notification-trigger/);
  assert.match(center, /No announcements yet/);
  assert.doesNotMatch(center, /site-announcement-bar|site-announcement-backdrop/);
  assert.match(app, /<AnnouncementCenter onOpen=/);
  assert.doesNotMatch(app, /Sample notifications|notificationsRead/);
  assert.doesNotMatch(layout, /AnnouncementCenter/);
  assert.match(utils, /timeZoneName: 'short'/);
  assert.match(utils, /year: 'numeric'/);
  assert.match(center, /formatAnnouncementDateTime/);
  assert.match(center, /situla:announcement-reads:v1:/);
  assert.match(center, /resolveAnnouncementMedia/);
  assert.match(dashboard, /AnnouncementManager/);
  assert.match(dashboard, /activeTab === "announcements"/);
  assert.match(app, /<AnnouncementCenter onOpen=/);
});

test('movie and TV poster cards invoke native share with canonical links and poster attachments', async () => {
  const cards = await read('../app/components/situla-app.jsx');
  const moviePage = await read('../app/watch/[imdbId]/page.jsx');
  const tvPage = await read('../app/tv/[tmdbId]/page.jsx');

  assert.match(cards, /navigator\.share/);
  assert.match(cards, /navigator\.canShare/);
  assert.match(cards, /files: \[file\]/);
  assert.match(cards, /Poster:/);
  assert.match(cards, /className="share-button"/);
  assert.match(cards, /function movieCardHref/);
  assert.match(cards, /function seriesCardHref/);
  assert.match(moviePage, /openGraph: \{ type: "video\.movie"/);
  assert.match(tvPage, /openGraph: \{ type: "video\.tv_show"/);
  assert.match(moviePage, /posterUrl/);
  assert.equal(moviePage.includes("/^tt\\d{5,12}$/"), true);
  assert.match(tvPage, /posterUrl/);
});
