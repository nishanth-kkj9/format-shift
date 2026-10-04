# Format Conversion Matrix

> **Generated file — do not edit by hand.** This document is produced from
> `src/core/conversionRegistry.ts` (the single source of truth) by
> `npm run matrix:docs`. `src/core/consistency.test.ts` asserts the summary
> numbers against the registry, so any drift fails the test suite.

## Summary

| Category  | Sources | Advertised pairs | Browser engine | Server engine | Excluded pairs |
| --------- | ------: | ---------------: | -------------: | ------------: | -------------: |
| image     |       9 |               77 |             45 |            32 |              4 |
| audio     |       7 |               42 |              7 |            35 |              0 |
| video     |       6 |               72 |              0 |            72 |              0 |
| data      |       3 |               15 |             15 |             0 |              0 |
| document  |       4 |               10 |             10 |             0 |              2 |
| **Total** |       — |          **216** |         **77** |       **139** |          **6** |

## image

Sources: `png`, `jpg`, `jpeg`, `webp`, `gif`, `bmp`, `ico`, `svg`, `avif`

| Source | Available targets                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `png`  | jpg (browser), jpeg (browser), png (browser), webp (browser), svg (browser), gif (server), bmp (server), ico (server), avif (server) |
| `jpg`  | jpg (browser), jpeg (browser), png (browser), webp (browser), svg (browser), gif (server), bmp (server), ico (server), avif (server) |
| `jpeg` | jpg (browser), jpeg (browser), png (browser), webp (browser), svg (browser), gif (server), bmp (server), ico (server), avif (server) |
| `webp` | jpg (browser), jpeg (browser), png (browser), webp (browser), svg (browser), gif (server), bmp (server), ico (server), avif (server) |
| `gif`  | jpg (browser), jpeg (browser), png (browser), webp (browser), svg (browser), gif (server), bmp (server), ico (server), avif (server) |
| `bmp`  | jpg (browser), jpeg (browser), png (browser), webp (browser), svg (browser), gif (server), bmp (server), ico (server), avif (server) |
| `ico`  | jpg (browser), jpeg (browser), png (browser), webp (browser), svg (browser), gif (server), bmp (server), ico (server), avif (server) |
| `svg`  | jpg (browser), jpeg (browser), png (browser), webp (browser), svg (browser)                                                          |
| `avif` | jpg (browser), jpeg (browser), png (browser), webp (browser), svg (browser), gif (server), bmp (server), ico (server), avif (server) |

## audio

Sources: `mp3`, `wav`, `ogg`, `aac`, `m4a`, `flac`, `weba`

| Source | Available targets                                                                    |
| ------ | ------------------------------------------------------------------------------------ |
| `mp3`  | wav (browser), mp3 (server), ogg (server), aac (server), m4a (server), flac (server) |
| `wav`  | wav (browser), mp3 (server), ogg (server), aac (server), m4a (server), flac (server) |
| `ogg`  | wav (browser), mp3 (server), ogg (server), aac (server), m4a (server), flac (server) |
| `aac`  | wav (browser), mp3 (server), ogg (server), aac (server), m4a (server), flac (server) |
| `m4a`  | wav (browser), mp3 (server), ogg (server), aac (server), m4a (server), flac (server) |
| `flac` | wav (browser), mp3 (server), ogg (server), aac (server), m4a (server), flac (server) |
| `weba` | wav (browser), mp3 (server), ogg (server), aac (server), m4a (server), flac (server) |

## video

Sources: `mp4`, `webm`, `mov`, `avi`, `mkv`, `flv`

| Source | Available targets                                                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mp4`  | mp4 (server), webm (server), mov (server), mkv (server), avi (server), gif (server), mp3 (server), wav (server), ogg (server), aac (server), flac (server), m4a (server) |
| `webm` | mp4 (server), webm (server), mov (server), mkv (server), avi (server), gif (server), mp3 (server), wav (server), ogg (server), aac (server), flac (server), m4a (server) |
| `mov`  | mp4 (server), webm (server), mov (server), mkv (server), avi (server), gif (server), mp3 (server), wav (server), ogg (server), aac (server), flac (server), m4a (server) |
| `avi`  | mp4 (server), webm (server), mov (server), mkv (server), avi (server), gif (server), mp3 (server), wav (server), ogg (server), aac (server), flac (server), m4a (server) |
| `mkv`  | mp4 (server), webm (server), mov (server), mkv (server), avi (server), gif (server), mp3 (server), wav (server), ogg (server), aac (server), flac (server), m4a (server) |
| `flv`  | mp4 (server), webm (server), mov (server), mkv (server), avi (server), gif (server), mp3 (server), wav (server), ogg (server), aac (server), flac (server), m4a (server) |

## data

Sources: `json`, `csv`, `tsv`

| Source | Available targets                                                           |
| ------ | --------------------------------------------------------------------------- |
| `json` | json (browser), csv (browser), tsv (browser), xml (browser), yaml (browser) |
| `csv`  | json (browser), csv (browser), tsv (browser), xml (browser), yaml (browser) |
| `tsv`  | json (browser), csv (browser), tsv (browser), xml (browser), yaml (browser) |

## document

Sources: `txt`, `md`, `html`, `htm`

| Source | Available targets                           |
| ------ | ------------------------------------------- |
| `txt`  | txt (browser), md (browser), html (browser) |
| `md`   | txt (browser), md (browser), html (browser) |
| `html` | txt (browser), html (browser)               |
| `htm`  | txt (browser), html (browser)               |
