> From `8.0.0-rc.4` onward this package is versioned as the Prisma release it targets, and releases are
> documented on the [GitHub Releases page](https://github.com/omar-dulaimi/prisma-orm-extension-zod-json/releases)
> instead of this file. The `2.x`-`4.x` entries below are the retired independent versioning scheme;
> `4.0.0` and `4.0.1` in particular carry no meaningful changes over `3.0.0`.

## [4.0.1](https://github.com/omar-dulaimi/prisma-orm-extension-zod-json/compare/v4.0.0...v4.0.1) (2026-08-21)

## [4.0.0](https://github.com/omar-dulaimi/prisma-orm-extension-zod-json/compare/v3.0.0...v4.0.0) (2026-08-21)

### 🚀 Features

* **breaking:** version this package to track its Prisma dependency ([9cc5008](https://github.com/omar-dulaimi/prisma-orm-extension-zod-json/commit/9cc500859f5bd231fa509b7735548901d6e8d288))

## [3.0.0](https://github.com/omar-dulaimi/prisma-orm-extension-zod-json/compare/v2.0.0...v3.0.0) (2026-08-21)

### 🚀 Features

* **breaking:** rename to prisma-orm-extension-zod-json ([dcc764e](https://github.com/omar-dulaimi/prisma-orm-extension-zod-json/commit/dcc764ea896645894f83b8e97c77fb55c8e9073c))

### ♻️ Code Refactoring

* **e2e:** drop the manual as-never casts for postgres<Contract> ([52c4cb1](https://github.com/omar-dulaimi/prisma-orm-extension-zod-json/commit/52c4cb1f00959485c61d4ce849547c5f778ad771))

## [2.0.0](https://github.com/omar-dulaimi/prisma-zod-json/compare/v1.0.0...v2.0.0) (2026-08-21)

### 🚀 Features

* **breaking:** rename the package from prisma-next-zod-json to prisma-zod-json ([925d05c](https://github.com/omar-dulaimi/prisma-zod-json/commit/925d05c0c85b856dad10711f17d8f2b7c171b3b8))

## [1.0.0](https://github.com/omar-dulaimi/prisma-next-zod-json/compare/v0.1.1...v1.0.0) (2026-08-21)

### 🚀 Features

* **breaking:** migrate the codec to the rc.4 descriptor shape ([e5b1457](https://github.com/omar-dulaimi/prisma-next-zod-json/commit/e5b14579ddd8b3e94a3af32f481afc53753e13e9))

### 📚 Documentation

* add v8 rc.4 migration design spec ([3e658e0](https://github.com/omar-dulaimi/prisma-next-zod-json/commit/3e658e013a3f76e008ac151e4dab737fb0dc945f))
* add v8 rc.4 migration implementation plan ([7b9b154](https://github.com/omar-dulaimi/prisma-next-zod-json/commit/7b9b1543682843748df95d460705c4dfe5679e2d))
* correct v8 migration spec after deeper verification ([9d57980](https://github.com/omar-dulaimi/prisma-next-zod-json/commit/9d57980985b151243055f8758e26f202073f9d14))
* fix dependency block in spec and plan (missing two packages) ([2127caf](https://github.com/omar-dulaimi/prisma-next-zod-json/commit/2127caf90f20c95a326208bb29ae09b6b4812619))
* update registration examples for the rc.4 config shape ([f35a85e](https://github.com/omar-dulaimi/prisma-next-zod-json/commit/f35a85ed384f14bfea6c8923e9c08a285b098610))

## [0.1.1](https://github.com/omar-dulaimi/prisma-next-zod-json/compare/v0.1.0...v0.1.1) (2026-07-27)

### 🐛 Bug Fixes

* stop the failure message repeating the field path ([de80eab](https://github.com/omar-dulaimi/prisma-next-zod-json/commit/de80eabb255c2c36ab1f6755010e39350c36ff2d))

### 📚 Documentation

* reword the design doc for a public audience ([ad97f7c](https://github.com/omar-dulaimi/prisma-next-zod-json/commit/ad97f7caf756179463bc3ee866f559664ae0e8d3))

## [0.1.0](https://github.com/omar-dulaimi/prisma-next-zod-json/compare/v0.0.0...v0.1.0) (2026-07-27)

### 🚀 Features

* build, README, and an end-to-end check against a live database ([ffa6f98](https://github.com/omar-dulaimi/prisma-next-zod-json/commit/ffa6f98531bd43b12d54484112fe2579c0b22c8c))
* detect constraints that JSON Schema silently drops ([184eb5a](https://github.com/omar-dulaimi/prisma-next-zod-json/commit/184eb5a3708afcc75cc032c409e101134f474f02))
* pack, runtime and control entrypoints ([85bb5ad](https://github.com/omar-dulaimi/prisma-next-zod-json/commit/85bb5adb257da68f7d6dfe24494f4d8e3cb0bd80))
* render TypeScript types from the stored JSON Schema ([2beb287](https://github.com/omar-dulaimi/prisma-next-zod-json/commit/2beb287b9d3b39fc25b1a4bcb5e7333bf10d5854))
* the zod/json@1 codec, validating on write as well as read ([a6a0f7b](https://github.com/omar-dulaimi/prisma-next-zod-json/commit/a6a0f7b51416107f6b6300694bb5e9c07088f67c))

### 🐛 Bug Fixes

* **ci:** set repositoryUrl explicitly for semantic-release ([d08698c](https://github.com/omar-dulaimi/prisma-next-zod-json/commit/d08698cd3de277b8109e3c230496c604ae337843))
* **ci:** stop the release-failure issue from masking the real error ([99b2f2a](https://github.com/omar-dulaimi/prisma-next-zod-json/commit/99b2f2ae284803fa011ace6e459a4158e5127521))
* name the offending field when a union fails ([0d13667](https://github.com/omar-dulaimi/prisma-next-zod-json/commit/0d136672d1dbafa44b71fce0dff6946ad92534e9))
* survive the contract emitter, which strips boolean false ([9863bc0](https://github.com/omar-dulaimi/prisma-next-zod-json/commit/9863bc08a2f32352bfb72dba8116fd39422672a3))

### 📚 Documentation

* record what the negative control flushed out ([cf4811d](https://github.com/omar-dulaimi/prisma-next-zod-json/commit/cf4811dc446b2a30e137a4d95e4a164cada59985))
