# YouTube scraper for Node.js and JavaScript

[![Live check](https://github.com/brightdata/youtube-scraper-node/actions/workflows/live.yml/badge.svg)](https://github.com/brightdata/youtube-scraper-node/actions/workflows/live.yml)
[![last verified](https://img.shields.io/badge/last%20verified-9%20Nov%202026-brightgreen)](https://github.com/brightdata/youtube-scraper-node/actions/workflows/live.yml) <!-- verified: rewritten by the daily run -->

[Quickstart](#how-to-scrape-youtube-videos-with-nodejs) · [No API key](#scrape-youtube-without-the-youtube-data-api) · [CLI](#bulk-youtube-search-scraper-cli) · [Endpoints](#scrape-youtube-videos-transcripts-shorts-channels-and-comments) · [Transcripts](#scrape-youtube-video-transcripts) · [Data](#youtube-video-data-fields-json) · [Errors](#youtube-scraper-errors) · [MCP and Claude Code](#youtube-mcp-server-and-claude-code-skill) · [Free credits](#is-this-youtube-scraper-free) · [Docs](https://docs.brightdata.com/products/scrapers/youtube/introduction) · [Support](#support)

YouTube data as JSON, in JavaScript: videos and Shorts with views, likes,
transcripts and chapters, search results, hashtags, channels, comments and
podcast episodes. All three Bright Data YouTube scrapers and all ten of their
methods, one function each. No YouTube Data API key, no quota, no browser, no
dependencies. Built on the
[Bright Data YouTube Scraper API](https://brightdata.com/products/web-scraper/youtube?utm_source=github).

Also here: a one-command CLI for keyword searches, and the
[Bright Data CLI](#youtube-mcp-server-and-claude-code-skill), which needs no JavaScript at all.

## How to scrape YouTube videos with Node.js

Node 20 or newer, and nothing to install: this is the built-in `fetch`. Save
it as a `.mjs` file, since it uses top-level `await`.

```bash
export BRIGHTDATA_API_TOKEN=YOUR_API_KEY
```

Get a token from the
[Bright Data control panel](https://brightdata.com/cp/setting/users). No
account yet? [Create one](https://brightdata.com/cp/start); new accounts get
[5,000 free credits a month](https://docs.brightdata.com/general/account/billing-and-pricing/free-tier).

```javascript
const API = "https://api.brightdata.com/datasets/v3";
const HEADERS = {
  Authorization: `Bearer ${process.env.BRIGHTDATA_API_TOKEN}`,
  "Content-Type": "application/json",
};

async function call(path, body) {
  const init = body === undefined ? { headers: HEADERS } : { method: "POST", headers: HEADERS, body: JSON.stringify(body) };
  const response = await fetch(API + path, init);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}

const query = new URLSearchParams({
  dataset_id: "gd_lk56epmy2i5g7lzu0k",
  type: "discover_new",
  discover_by: "keyword",
  limit_per_input: "3",
  include_errors: "true",
});
const job = await call(`/trigger?${query}`, [{ keyword: "python tutorial", num_of_posts: "3" }]);
while (!["ready", "failed"].includes((await call(`/progress/${job.snapshot_id}`)).status)) {
  await new Promise((done) => setTimeout(done, 10_000));
}
for (const video of await call(`/snapshot/${job.snapshot_id}?format=json`)) {
  if (video.error) {
    console.log("error row:", video.error);
    continue;
  }
  console.log(video.views, video.likes, video.title.slice(0, 50));
}
```

```
error row: Parse error: ORIGINAL_LANGUAGE_TO_COUNTRY is not defined
332620 5802 Python Tutorial for AI: Everything You Need in 2 H
26081206 474384 Python Tutorial For Beginners in Hindi | Complete 
```

Expect two to eleven minutes: the API runs a search job and the loop waits for
it. Billed [per video](https://brightdata.com/pricing/web-scraper).

Three things in that snippet are not optional.

`limit_per_input` caps the run, and the bill. `num_of_posts` asks for the same
number; it is a text field in this scraper, so it is sent as `"3"`.

`include_errors=true` makes the API report a video it could not collect as a
row with an `error` key. The API default is off, and a failed search then
looks the same as a search with no results.

The `error row` branch is there because, on 9 Nov 2026, some videos in a
search came back as "Parse error: ORIGINAL_LANGUAGE_TO_COUNTRY is not
defined" while the rest came back whole. See
[YouTube scraper errors](#youtube-scraper-errors).

## Scrape YouTube without the YouTube Data API

The YouTube Scraper API needs no Google Cloud project, no YouTube Data API key
and no OAuth, and it has no daily quota. The only credential is a Bright Data
API key, set as `BRIGHTDATA_API_TOKEN`. This package and its command also find
the key stored by `bdata login`. It collects what a logged-out visitor can
see, the transcript included.

## Bulk YouTube search scraper CLI

The command in this repo runs the Node.js quickstart for several keywords at
once and writes one JSON file.

```bash
npm install -g github:brightdata/youtube-scraper-node
youtube-scraper "python tutorial" "home workout" --limit 2
```

```
Finding up to 2 videos per keyword, for: python tutorial, home workout
Usually two to ten minutes each. Billed per video, 5,000 free credits a month.
asking  "python tutorial"...
got     "python tutorial": 1 videos, 1 error rows: Parse error: ORIGINAL_LANGUAGE_TO_COUNTRY is not defined
asking  "home workout"...
got     "home workout": 1 videos, 1 error rows: Parse error: ORIGINAL_LANGUAGE_TO_COUNTRY is not defined

Saved 2 videos as JSON to youtube.json (51 fields per video)
```

In a terminal the `asking` lines are replaced by a spinner and a running
clock, updating in place, so you can see it is working and how long it has
been going.

```
--limit N      videos per keyword, default 5, minimum 1
--out PATH     output file, default youtube.json
```

The command finds the token in `BRIGHTDATA_API_TOKEN`, or, if you ran
`npx -p @brightdata/cli bdata login` once, in the stored login, for you and
for any coding agent in that terminal. It does not read a `.env` file; Node
loads one for it with `node --env-file=.env`.

Import it instead of running it, for `ok`, `note` and `error` per keyword
instead of raw rows. This package is ESM, so use `import`, not `require`.
`scrape` never rejects for one bad keyword; check `ok` before reading
`videos`:

```javascript
import { scrape } from "@brightdata/youtube-scraper-node";

for (const outcome of await scrape(["python tutorial", "home workout"], { limit: 1 })) {
  if (outcome.ok) {
    const [video] = outcome.videos;
    console.log(`${outcome.keyword}: ${video.title.slice(0, 45)} (${video.views} views)`);
  } else {
    console.log(`${outcome.keyword} failed: ${outcome.error}`);
  }
}
```

```
python tutorial: Python Full Course for free 🐍 (13401278 views)
home workout: 25 MIN FULL BODY HIIT for Beginners - No Equi (34828112 views)
```

A keyword fails only when every row it returns is an error row. When a search
returns some videos and some error rows, the videos are kept, and the errors
land in `note`.

## Scrape YouTube videos, transcripts, Shorts, channels and comments

Bright Data has three YouTube scrapers, videos, channels and comments, with
ten ways to call them, each documented in the
[YouTube Scraper API docs](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/youtube-videos-collect-by-url).
This package has one function for each. Every snippet below is complete:
paste it as is after the `npm install` above. Every one of them runs in
Actions each Monday, a smaller check runs every other day, and the badge at
the top is the latest result.

| you have | want | how |
| --- | --- | --- |
| video or Shorts URLs | views, likes, transcript, chapters | `videos(urls)` |
| a search, like "python tutorial" | matching videos | `search("python tutorial", { limit: 5 })` |
| a search and YouTube's filters | filtered videos | `searchFilters("python tutorial", { limit: 5, upload_date: "This month" })` |
| a hashtag | its videos and Shorts | `hashtag("baking", { limit: 5 })` |
| video URLs | their comments | `comments(urls, { limit: 10 })`, billed per comment |
| channel URLs | subscribers, views, video count | `channels(urls)` |
| a keyword | matching channels | `channelsSearch("home cooking", { limit: 5 })` |
| a podcast playlist URL | its episodes | `podcast(url, { limit: 5 })` |
| an explore page URL | its videos | `explore("https://www.youtube.com/gaming/games", { limit: 5 })` |
| a channel's `/videos` URL | its recent videos | `channelVideos(url, { limit: 5 })`, broken upstream on 9 Nov 2026 |

Each takes one URL or an array. An array is one job, not one per URL. Each
resolves to an array of rows, and a row the API could not collect carries an
`error` key instead of the record. Functions that take a limit pass any other
input the API accepts in the same options object, named as the API names it:
`search("python tutorial", { limit: 5, start_date: "10-01-2026" })`.

### Scrape a YouTube video by URL

```javascript
import { videos } from "@brightdata/youtube-scraper-node";

const [video] = await videos("https://www.youtube.com/watch?v=jNQXAC9IVRw");
console.log(video.title, "|", video.youtuber, "|", video.date_posted.slice(0, 10));
console.log(video.views, "views,", video.likes, "likes,", video.num_comments, "comments");
console.log(video.video_length, "seconds,", video.category, "| tags:", video.tags.join(", "));
```

```
Me at the zoo | @jawed | 2005-04-24
448085592 views, 20132396 likes, 10646130 comments
19 seconds, Film & Animation | tags: me at the zoo, jawed karim, first youtube video
```

Collecting a video by URL took 12 to 178 seconds. Shorts URLs work the same way.

### Scrape YouTube video transcripts

```javascript
import { videos } from "@brightdata/youtube-scraper-node";

const url = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
const [video] = await videos(url, { transcription_language: "English" });
for (const line of video.formatted_transcript.slice(0, 3)) {
  const text = line.text.split(/\s+/).join(" ");
  console.log(`${(line.start_time / 1000).toFixed(1).padStart(5)}s  ${text}`);
}
console.log(video.transcript.length, "characters in all");
```

```
  1.2s  All right, so here we are, in front of the elephants
  5.3s  the cool thing about these guys is that they have really...
  8.0s  really really long trunks
217 characters in all
```

Every video record carries the transcript twice: `transcript` as plain text
and `formatted_transcript` as timed lines, `start_time` and `end_time` in
milliseconds. `transcript_language` lists the languages YouTube offers, and
`chapters` the video's chapters. The text keeps YouTube's line breaks.

### Scrape YouTube search results with filters

```javascript
import { searchFilters } from "@brightdata/youtube-scraper-node";

const found = await searchFilters("python tutorial", {
  limit: 2,
  upload_date: "This month",
  type: "Video",
  duration: "Under 4 minutes",
});
for (const video of found) {
  if (video.error) {
    console.log("error row:", video.error);
    continue;
  }
  console.log(video.date_posted.slice(0, 10), video.video_length, "s |", video.title.slice(0, 50));
}
```

```
error row: Parse error: Cannot read properties of undefined (reading 'runs')
2026-10-21 130 s | Python Tutorial for Beginners 🐍 | Install Python 
```

The filters are YouTube's own labels, checked against fixed lists.
"This month", "Video" and "Under 4 minutes" were accepted; "4-20 minutes" is
an HTTP 400, `["duration", "This value is not allowed"]`.

### Scrape YouTube Shorts by hashtag

```javascript
import { hashtag } from "@brightdata/youtube-scraper-node";

for (const video of await hashtag("baking", { limit: 2 })) {
  if (video.error) {
    console.log("error row:", video.error);
    continue;
  }
  console.log(video.post_type, video.views, video.url);
}
```

```
error row: Parse error: ORIGINAL_LANGUAGE_TO_COUNTRY is not defined
post 361876 https://www.youtube.com/watch?v=bxVrq1cbBmA
```

Pass the tag without the `#`. `start_date` and `end_date`, `MM-DD-YYYY`, narrow
it to a window.

### Scrape YouTube comments from a video

```javascript
import { comments } from "@brightdata/youtube-scraper-node";

for (const comment of await comments("https://www.youtube.com/watch?v=jNQXAC9IVRw", { limit: 3 })) {
  console.log(comment.likes, "|", comment.username, "|", comment.comment_text.slice(0, 50));
}
```

```
4800000 | @SanDiegoZoo | We're so honored that the first ever YouTube video
0 | @boxifed | here before viral ⬇⬇
1 | @roshac995 | 10M comment
```

The limit is the `num_of_comments` input: 3 asked, 3 returned, in 43 seconds.
`sort_by` and `load_replies` go in the options object.

### Scrape YouTube channel data

```javascript
import { channels } from "@brightdata/youtube-scraper-node";

const [channel] = await channels("https://www.youtube.com/@NASA/about");
console.log(channel.name, channel.handle);
console.log(channel.subscribers, "subscribers,", channel.videos_count, "videos,", channel.views, "views");
```

```
NASA @NASA
15100000 subscribers, 6201 videos, 1134859779 views
```

The fastest call: 12 seconds.

### Find YouTube channels by keyword

```javascript
import { channelsSearch } from "@brightdata/youtube-scraper-node";

for (const channel of await channelsSearch("home cooking", { limit: 2 })) {
  console.log(channel.subscribers, channel.name, channel.url);
}
```

```
1380000 집밥요리 Home Cooking https://www.youtube.com/@jibbab_yori
3300000 HomeCookingShow https://www.youtube.com/@homecookingshow
```

### Scrape YouTube podcast episodes

```javascript
import { podcast } from "@brightdata/youtube-scraper-node";

const playlist = "https://www.youtube.com/playlist?list=PLbnMTcZEga8QCKJvxsJVQV4uHD6bENdnP";
for (const episode of await podcast(playlist, { limit: 2 })) {
  console.log(episode.date_posted.slice(0, 10), episode.views, "|", episode.title.slice(0, 60));
}
```

```
2026-11-09 7455 | Are you risking your career if you post about work on social
2026-11-02 16724 | She gave all her employees flexible work. Here’s how she kep
```

A podcast playlist URL or a channel's `/podcasts` URL. Neither SDK has a
method for this one.

### Scrape the YouTube explore and gaming pages

```javascript
import { explore } from "@brightdata/youtube-scraper-node";

for (const video of await explore("https://www.youtube.com/gaming/games", { limit: 2 })) {
  console.log(video.live_status, video.views, "|", video.title.slice(0, 50));
}
```

```
is_live 671 | コントロールネメシス 【シャドバWB/Shadowverse:Worlds Beyond】
is_live 25077 | [Shadowverse]BEYONDふやすぞ～！！！！
```

The gaming page is mostly live streams, so `live_status` is `is_live` and
`views` counts the stream so far.

### Scrape a YouTube channel's videos

```javascript
import { channelVideos } from "@brightdata/youtube-scraper-node";

for (const row of await channelVideos("https://www.youtube.com/@NASA/videos", { limit: 2 })) {
  if (row.error) console.log("error:", row.error_code, row.error);
  else console.log(row.date_posted.slice(0, 10), row.title.slice(0, 60));
}
```

```
error: parse_error Parse error: ORIGINAL_LANGUAGE_TO_COUNTRY is not defined
error: parse_error Parse error: ORIGINAL_LANGUAGE_TO_COUNTRY is not defined
```

That output is real. On 9 Nov 2026 every channel tried, @NASA and @MrBeast,
five runs in all, returned only this error, after about nine minutes. The call
and the input match the live schema, and the weekly check runs this block, so
the badge will show when it comes back. Until then, `search` with the
channel's name, or `videos` on known URLs, gets the same records.

### Trigger now, fetch later

For anything bigger than a few searches, do not hold a process for an hour.
Trigger, keep the snapshot id, fetch when ready. Snapshots stay downloadable
for 30 days.

```javascript
import { CHANNELS, fetchSnapshot, status, trigger } from "@brightdata/youtube-scraper-node";

const snapshot = await trigger(CHANNELS, [{ url: "https://www.youtube.com/@NASA/about" }]);
console.log("snapshot:", snapshot);
let state;
while (!["ready", "failed"].includes((state = await status(snapshot)))) {
  await new Promise((done) => setTimeout(done, 10_000));
}
console.log("status:", state);
console.log("fetched:", (await fetchSnapshot(snapshot))[0].name);
```

```
snapshot: sd_mw95unbndfba3pqds
status: ready
fetched: NASA
```

`trigger` takes any dataset, `discoverBy` and `limitPerInput`, so it reaches
every method in the table. Each input was accepted by the live API on
2026-11-09:

| method | dataset_id | discover_by | input |
| --- | --- | --- | --- |
| Video by URL | `gd_lk56epmy2i5g7lzu0k` | none | `{"url"}`, optional `{"country", "transcription_language"}` |
| Search | `gd_lk56epmy2i5g7lzu0k` | `keyword` | `{"keyword", "num_of_posts"}`, `num_of_posts` as text |
| Search with filters | `gd_lk56epmy2i5g7lzu0k` | `search_filters` | `{"keyword_search"}` plus filter labels |
| Hashtag | `gd_lk56epmy2i5g7lzu0k` | `hashtag` | `{"hashtag", "num_of_posts"}` |
| Channel videos | `gd_lk56epmy2i5g7lzu0k` | `url` | `{"url", "num_of_posts"}`, a `/videos` URL |
| Explore page | `gd_lk56epmy2i5g7lzu0k` | `explore` | `{"url"}`, optional `{"all_tabs"}` |
| Podcast | `gd_lk56epmy2i5g7lzu0k` | `podcast_url` | `{"url"}` |
| Channel by URL | `gd_lk538t2k2p1k3oos71` | none | `{"url"}` |
| Channels by keyword | `gd_lk538t2k2p1k3oos71` | `keyword` | `{"keyword"}` |
| Comments | `gd_lk9q0ew71spt1mxywf` | none | `{"url", "num_of_comments"}` |

`bdata pipelines info <dataset_id> <method>` prints the input fields the API
validates.

## YouTube video data fields (JSON)

The fields most people want from a video:

```
url  title  youtuber  views  likes  num_comments  date_posted  video_length  transcript  tags
```

The code hardcodes no field list. Whatever the API returns lands in each row,
and in the command's file.

<!-- fields:start -->
Regenerated every day from the published schema,
[scrapers-full.json](https://docs.brightdata.com/scrapers-full.json), so they cannot go stale. A record
carries the fields that apply to it, plus `timestamp` and `input`; the
sample file's first video has 51 keys.

<details>
<summary>All 49 video fields, <code>gd_lk56epmy2i5g7lzu0k</code></summary>

| field | type | description |
| --- | --- | --- |
| `url` | url | The full YouTube watch URL of the collected video |
| `title` | text | Title of the YouTube video |
| `youtuber` | text | The channel handle extracted from the channel's browse endpoint |
| `youtuber_md5` | text | MD5 hash of the youtuber field |
| `video_url` | url | Direct streaming URL of the video file, extracted from YouTube's adaptive formats or decoded from signatureCipher |
| `video_length` | number | Duration of the video in seconds |
| `likes` | number | Number of likes received by the video |
| `views` | number | Number of views the video has received |
| `date_posted` | date | Date when the video was published |
| `description` | text | Text description accompanying the video |
| `num_comments` | number | Number of comments on the video, as displayed by YouTube (includes both top-level comments and replies in YouTube's count) |
| `subscribers` | number | Number of subscribers to the YouTube channel |
| `music` | object | Information about the music used in the video. Only present when YouTube's Content ID system has identified music in the video |
| `video_id` | text | Unique identifier for the YouTube video |
| `channel_url` | url | URL-encoded URL of the YouTube channel, derived from the channel's canonical browse endpoint |
| `preview_image` | image | URL of the preview image for the video |
| `shortcode` | text | The unique short identifier of the video, identical to video_id, used across all YouTube video types including regular videos and Shorts |
| `verified` | boolean | Indicates whether the channel is verified |
| `handle_name` | text | The display name of the YouTube channel as shown on the video page |
| `avatar_img_channel` | url | The URL of the avatar image of the YouTube channel |
| `is_sponsored` | boolean | Indicates whether the video contains a paid content overlay as declared by YouTube |
| `related_videos` | array | List of URLs of videos shown in the sidebar alongside the current video |
| `license` | url | URL of the video's license as declared in YouTube's video metadata |
| `viewport_frames` | text | Resolution of the primary video stream format, derived from YouTube's streaming data |
| `current_optimal_res` | text | Current and optimal video resolution with frame rate, from YouTube's streaming format metadata |
| `codecs` | text | Video and audio codec strings formatted as video codec and audio codec, extracted from YouTube's adaptive streaming formats |
| `color` | text | Color primaries of the video stream, extracted from YouTube's adaptive format color info |
| `quality` | text | Quality identifier of the first adaptive streaming format as reported by YouTube |
| `quality_label` | text | Human-readable video quality label as reported by YouTube |
| `post_type` | text | Type of YouTube content inferred from the URL structure. Possible values: post for standard video, short for YouTube Short, or N/A |
| `youtuber_id` | text | YouTube's internal channel ID, distinct from the channel handle |
| `transcript` | text | Full plain-text transcript of the video, compiled from YouTube's caption tracks. English captions are preferred, falls back to the first available language if English is unavailable |
| `formatted_transcript` | array | Timestamped transcript segments from YouTube's caption tracks, each containing start time, end time, and duration in milliseconds, and the caption text |
| `hashtags` | array | List of hashtags found in the video title or description, each with the hashtag text and its YouTube search link |
| `tags` | array | Tags of the video |
| `next_recommended_videos` | array | Videos shown as end-screen cards during the final seconds of the video, including timing in milliseconds and display style |
| `recommended_videos` | array | Videos recommended by YouTube in the sidebar alongside the current video |
| `transcript_language` | array | List of caption and transcript languages available for this video on YouTube, including whether each track was auto-generated |
| `chapters` | array | List of chapter markers defined by the creator, each with a title, start time in milliseconds, and preview image |
| `transcription_language` | text | The language code requested by the caller for transcript retrieval, passed as an input parameter at collection time |
| `is_age_restricted` | boolean | Whether the video is age-restricted, inferred from a non-OK playability status combined with an age-related reason from YouTube |
| `channel_url_decoded` | text | Plain-text percent-decoded version of the channel URL |
| `category` | text | YouTube's content category assigned to the video, from YouTube's predefined category taxonomy |
| `audio_tracks` | array | audio Tracks |
| `made_for_kids` | boolean | Indicates whether the video is designated as made for kids, inferred from the YouTube miniplayer playback mode |
| `player_notification_text` | text | User-facing notification text shown inside the video player |
| `ai_content_label` | boolean | Indicates whether the video has been labeled as AI-generated or significantly AI-altered, either by the creator or auto-detected by YouTube. |
| `live_status` | text | Livestream status of the video, equivalent to yt-dlp's live_status. One of "is_live", "was_live", or "not_live", parsed from YouTube's info string (e.g. "Streamed live 29 minutes ago") or defaulted to "not_live" for regular videos |
| `comments` | array | 10 Most relevant comments of the video |

</details>

<details>
<summary>All 21 channel fields, <code>gd_lk538t2k2p1k3oos71</code></summary>

| field | type | description |
| --- | --- | --- |
| `url` | url | URL that link directly to the YouTube profile |
| `handle` | text | Unique to each user (e.g., @name) |
| `handle_md5` | text | This field stores the MD5 hash of the handle field. |
| `banner_img` | url | URL that links to the banner photo |
| `profile_image` | url | URL that link to the profile picture |
| `name` | text | Profile name |
| `subscribers` | number | How many subscribers the profile have |
| `Description` | text | Brief descriptions or statements that users write to introduce themselves or share their interests and passions on YouTube |
| `videos_count` | number | How many videos the profile have |
| `created_date` | date | The date the profile was created |
| `views` | number | How many views the profile have |
| `Details` | object | channel Details |
| `Links` | array | External websites that users may link to from their YouTube profiles |
| `identifier` | text | identifier |
| `discovery_input` | object | Discovery input value |
| `id` | text | channel id |
| `has_podcast` | boolean | has podcast indicator |
| `top_videos` | array | top videos |
| `featured_video` | url | Featured Video |
| `featured_channels` | array | featured channels |
| `collaborations` | array | Collaborations videos |

</details>

<details>
<summary>All 16 comment fields, <code>gd_lk9q0ew71spt1mxywf</code></summary>

| field | type | description |
| --- | --- | --- |
| `comment_id` | text | Unique identifier for each comment |
| `comment_text` | text | The text content of the comment |
| `likes` | number | Number of likes received by the comment |
| `replies` | number | Number of replies to the comment |
| `username` | text | Username of the commenter |
| `username_md5` | text | This field stores the MD5 hash of the username field. |
| `user_channel` | text | URL of the commenter's YouTube channel |
| `date` | text | Date when the comment was posted |
| `url` | url | Web address of the YouTube video where the comment was posted |
| `video_id` | text | Unique identifier for the YouTube video |
| `replies_value` | array | Array of reply objects associated with this comment |
| `replies_without_names` | array | Array of reply objects with personally identifiable information (usernames) removed, containing only MD5 hashed user identifiers |
| `user_id` | text | Unique identifier for the commenter's YouTube channel |
| `mentioned_timestamps_minutes` | array | Array of timestamps mentioned in the comment, formatted in minutes (e.g., '2:35') |
| `mentioned_timestamps_seconds` | array | Array of timestamps mentioned in the comment, converted to total seconds |
| `date_iso` | date | Date in ISO format |

</details>
<!-- fields:end -->

<details>
<summary>The start of a real output file, from <code>youtube-scraper "python tutorial" --limit 1</code></summary>

```json
{
  "generated_at": "2026-11-09T11:12:32.635Z",
  "keywords": [
    {
      "keyword": "python tutorial",
      "videos": [
        {
          "url": "https://www.youtube.com/watch?v=K5KVEU3aaeQ&t=56s&pp=ygUPcHl0aG9uIHR1dG9yaWFs",
          "title": "Python Full Course for Beginners",
          "youtuber": "@programmingwithmosh",
          "youtuber_md5": "be0da1195f186399397e909dff13d1b6",
          "video_url": "https://rr6---sn-ojq4f5-51.googlevideo.com/videoplayback?expire=1794244289&ei=YarxapufJu2a2_gPk-6TIA&ip=156.248.45.42&id=o-ANdxxaGl38S-b4LNNhkkoAlKjRx-D5QGnn_fMhnUlFF1&source=youtube&requiressl=yes&xpc=EgVo2aDSNQ%3D%3D&cps=617&met=1794222689%2C&mh=g7&mm=18%2C29&mn=sn-ojq4f5-51%2Csn-ojq4f5-cv&ms=aub%2Crdu&mv=u&mvi=6&pl=19&rms=aub%2Caub&pcm2=no&spc=mpRQ__TFYsZSkarIFqog5CLxWX_8YjDkZaBjvQrPfo2ycFX696L_2drt3MZ-uRwGpotVDWA&svpuc=1&ns=8UjBRsyTbGxdj0oYIgVcVW4Z&sabr=1&rqh=1&mt=1794221869&fvip=1&epbp=1&keepalive=yes&fexp=51565115%2C52250119%2C52323638&c=WEB&n=SD9umA7w9UBLw1G-qm&sparams=expire%2Cei%2Cip%2Cid%2Csource%2Crequiressl%2Cxpc%2Cpcm2%2Cspc%2Csvpuc%2Cns%2Csabr%2Crqh&sig=AE0s2JYwRgIhANX5D7K3n3sW41JZ1tgY0iHbP_JZ3lnnuGqxO-x4xItVAiEAvk9FnONA9AniflIAz7ZoVfLMEwYoWi8koXNjX9Gbabk%3D&lsparams=cps%2Cmet%2Cmh%2Cmm%2Cmn%2Cms%2Cmv%2Cmvi%2Cpl%2Crms&lsig=APaTxxMwRAIgfoSm9MRvnEC8uZS3-0Z743lU8ZGTDj10wIhrE6LqR5MCIDGykQLzAy1jzgrofXGX2SZUDruURRCTzC1Rx9fNfb-Y",
          "video_length": 7340,
          "likes": 172884,
          "views": 8099704,
          "date_posted": "2025-02-12T12:30:31.000Z",
          "description": "Master Python from scratch 🚀 No fluff—just clear, practical coding skills to kickstart your journey! \n\n🚀 Want to dive deeper?\n- Check out my complete Python mastery course: https://mosh.link/python-course\n- Subscribe for more awesome Python content: https://goo.gl/6PYaGF\n\n🔗 Related videos \nhttps://youtu.be/yVl_G-F7m8c?si=aoIiT6CyaRRfBsRM\n\n✋ Stay connected:\n- Full Courses: https://codewithmosh.com\n- Twitter: https://twitter.com/moshhamedani\n- Facebook: https://www.facebook.com/programmingwithmosh/\n- Instagram: https://www.instagram.com/codewithmosh.official/\n- LinkedIn: https://www.linkedin.com/school/codewithmosh/\n\n📖 Table of Content\n0:00:00 Introduction\n0:00:56 What is Python?\n0:04:11 Installing Python\n0:05:36 Python Interpreter\n0:07:30 Code Editors\n0:08:49 Your First Python Program\n0:12:25 Python Extension\n0:14:26 Linting Python Code\n0:18:40 Formatting Python Code\n0:22:51 Running Python Code\n0:24:30 Python Implementations\n0:26:59 How Python Code is Executed\n0:29:45 Quiz\n0:31:17 Python Mastery Course\n0:31:44 Variables\n0:34:48 Variable Names\n0:37:51 Strings\n0:43:20 Escape Sequences\n0:46:01 Formatted Strings\n0:48:09 String Methods\n0:54:03 Numbers\n0:56:50 Working With Numbers\n0:58:59 Type Conversion\n1:04:03 Quiz\n1:06:43 Comparison Operators\n1:08:46 Conditional Statements\n1:12:56 Ternary Operator\n1:15:04 Logical Operators\n1:19:07 Short-circuit Evaluations\n1:21:13 Chaining Comparison Operators\n1:22:35 Quiz\n1:24:18 For Loops\n1:27:56 For..Else\n1:30:42 Nested Loops\n1:33:26 Iterables\n1:36:34 While Loops\n1:41:33 Infinite Loops\n1:43:10 Exercise\n1:45:13 Defining Functions\n1:47:37 Arguments\n1:49:57 Types of Functions\n1:53:59 Keyword Arguments\n1:55:59 Default Arguments\n1:57:34 xargs\n\n#Python #AI #MachineLearning #WebDevelopment",
          "num_comments": 4503,
          "subscribers": 5180000,
          "video_id": "K5KVEU3aaeQ",
  ...
```

The whole file, one video with every field, is
[examples/sample_output.json](examples/sample_output.json).

</details>

## YouTube scraper errors

| you see | what it means |
| --- | --- |
| `API token required but not found.` | Exit 2, before any request. Set the token, or run `bdata login`. |
| `failed  "keyword": Parse error: ...` | Exit 1. Every video in that search hit a parsing bug in the scraper. On 9 Nov 2026 it read `ORIGINAL_LANGUAGE_TO_COUNTRY is not defined`, once `Cannot read properties of undefined (reading 'runs')`. Run it again, or use a different keyword. |
| `got     "keyword": 1 videos, 1 error rows: Parse error: ...` | Exit 0. The same bug hit some of the videos; the rest are in the file. |
| `failed  "keyword": timeout: snapshot ... not ready after 900s` | Exit 1. Run it again, or fetch the snapshot later with `fetchSnapshot()`. |
| `failed  "keyword": HTTP 401: ...` | The token is set but wrong. |

Any failure exits 1, so a run is safe to gate a script on.

From the functions, the same conditions look like this:

| you see | what it means |
| --- | --- |
| `TokenMissing` | No `BRIGHTDATA_API_TOKEN` and no `bdata login`. |
| `ApiError: HTTP 400: ...validation_error...` | An input the API does not accept, such as a filter label not on its list. The message names the field. |
| a row with an `error` key | The API's answer for one video or input: `parse_error`, or a dead page. The other rows are fine. |
| `ApiError: timeout: ...` | The job outlived the 900-second wait. Pass `{ timeoutMs }` to `run`, or use `trigger` and fetch later. |

## YouTube MCP server and Claude Code skill

No JavaScript, nothing installed. Paste both lines; the first opens a browser
once, or use `bdata login --device` over SSH and in CI:

```bash
npx -p @brightdata/cli bdata login
npx -p @brightdata/cli bdata pipelines run gd_lk538t2k2p1k3oos71 collect_by_url "https://www.youtube.com/@NASA/about" --pretty
```

1 record, 20 fields, 35 seconds on 9 Nov 2026. The CLI leaves out fields that
are null.

The CLI runs a scraper by its dataset ID, every YouTube one included.
`bdata pipelines search youtube` lists their IDs and methods, and
`--limit-per-input N` caps a discovery, 10 by default.

`npx skills add brightdata/skills` teaches Claude Code, Cursor and Codex these
commands and the docs, so plain language works afterwards. Full guide:
[Bright Data for your coding agent](https://docs.brightdata.com/quickstart-coding-agent).

No terminal, for a hosted assistant? The
[Bright Data MCP server](https://github.com/brightdata/brightdata-mcp#which-tool-to-use)
runs any pre-built scraper, YouTube included, through `search_scrapers` and
`run_scraper` in its `scrapers` group:

    https://mcp.brightdata.com/mcp?token=YOUR_API_TOKEN&groups=scrapers

An agent can also open the account itself, no signup form:
[agent registration](https://brightdata.com/auth.md). Everything else Bright
Data connects to, from LangChain to Zapier and n8n:
[integrations](https://docs.brightdata.com/integrations/introduction).

<details>
<summary>YouTube commands for the CLI, each run on 9 Nov 2026</summary>

Prefix each command with `npx -p @brightdata/cli`, or install once with
`npm i -g @brightdata/cli`. Each prints JSON and is billed per record.

Three scrapers, each run with `bdata pipelines run <dataset_id> <method>`:
videos `gd_lk56epmy2i5g7lzu0k`, channels `gd_lk538t2k2p1k3oos71` and
comments `gd_lk9q0ew71spt1mxywf`.

```bash
bdata pipelines run gd_lk9q0ew71spt1mxywf collect_by_url --url "https://www.youtube.com/watch?v=jNQXAC9IVRw" --num_of_comments 3 --format csv -o comments.csv
```

3 comments, 24 columns, 37 seconds.

```bash
bdata pipelines run gd_lk56epmy2i5g7lzu0k discover_by_keyword --keyword "python tutorial" --num_of_posts 2 --limit-per-input 2 --timeout 900 --pretty
```

2 rows in 599 seconds: one video and one row with the parse error described
under [YouTube scraper errors](#youtube-scraper-errors). Discovery can pass the
CLI's 600-second default, so keep `--timeout 900`, or add `--async` and fetch
later with `bdata pipelines results <snapshot_id>`.

`bdata pipelines info <dataset_id> <method>` shows a scraper's input fields.
`bdata pipelines run --help` shows `--format json|csv|ndjson|jsonl`, `-o FILE`,
`--timeout` and `--async`.

</details>

## Is this YouTube scraper free?

New Bright Data accounts get
[5,000 free credits a month](https://docs.brightdata.com/general/account/billing-and-pricing/free-tier).
Every YouTube scraper bills per record: per video, channel or comment.
[Pricing](https://brightdata.com/pricing/web-scraper) lists the rates.

## Support

Bugs in this repo:
[open an issue](https://github.com/brightdata/youtube-scraper-node/issues), and
[CONTRIBUTING.md](CONTRIBUTING.md) says what to put in it.
Anything about the API, your account or your credits:
[Bright Data support](https://brightdata.zendesk.com/hc/en-us/requests/new).

## License

[Apache 2.0](LICENSE).

## YouTube scraper for Python

The same YouTube scraper is available for Python: [brightdata/youtube-scraper](https://github.com/brightdata/youtube-scraper).
