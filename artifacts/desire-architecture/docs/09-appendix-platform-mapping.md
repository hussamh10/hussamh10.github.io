# Appendix: Platform Mapping

This appendix is the "Rosetta Stone" of the documentation. It maps every concept in the generic social media platform to its concrete implementation in Bluesky (AT Protocol), Twitter/X, and Reddit. Use this when you want to understand how a generic concept was derived, or when you're reading platform-specific documentation and need to translate it to the generic model.

---

## Component Mapping

| Generic Platform | Bluesky (AT Protocol) | Twitter/X | Reddit |
|------------------|-----------------------|-----------|--------|
| **API Gateway** | XRPC routing layer | Edge service tier | Web tier (HAProxy, nginx) |
| **Content Service** | PDS repo operations (`com.atproto.repo.*`) | Tweet Service | Application tier (Pylons framework) |
| **Identity Service** | PDS identity + PLC Directory | User Service | Account Service |
| **Social Graph Service** | PDS graph records (`app.bsky.graph.*`) | Social Graph Service (FlockDB) | PostgreSQL relations / subscriptions |
| **Timeline / Feed Service** | AppView (`app.bsky.feed.*`) | Timeline Service + Fanout Service | Listing builder |
| **Notification Service** | AppView notifications (`app.bsky.notification.*`) | Notification Service | Message/notification system |
| **Event Bus** | Relay + Firehose (`com.atproto.sync.subscribeRepos`) | Apache Kafka + internal EventBus | Apache Kafka (via Debezium CDC) |
| **Moderation Service** | Labelers + Ozone (`tools.ozone.*`, `com.atproto.label.*`) | Trust & Safety (centralized) | AutoModerator + community mod tools |
| **Media Service** | Blob store + CDN (`com.atproto.sync.getBlob`) | Media upload service | Image hosting (Imgur → native) |
| **Search Service** | AppView search | Search Service (Earlybird/Lucene) | Search (Elasticsearch/Lucene) |

### Notes on Architectural Differences

**Bluesky's split is unique**: The PDS handles writes and personal storage, while the AppView handles reads and aggregation. In the generic model, both are combined into service-specific modules (Content Service handles both reads and writes). The Relay is a Bluesky-specific concept for federation — in the generic model it maps to the Event Bus + Firehose combination.

**Twitter's fanout architecture is distinctive**: Twitter has a dedicated Fanout Service separate from the Timeline Service. In the generic model, fanout is a responsibility of the Timeline Service (triggered by event consumption).

**Reddit's architecture is more monolithic**: Reddit's original architecture had less service separation — most logic lived in the Application Tier (a Python/Pylons monolith). The generic model represents what Reddit's architecture has evolved toward.

---

## Data Model Mapping

| Generic Entity | Bluesky | Twitter/X | Reddit |
|----------------|---------|-----------|--------|
| **User / Actor** | DID + handle + `app.bsky.actor.profile` record | User object (user ID + @username) | Account (Thing type t2, u/username) |
| **Post** | `app.bsky.feed.post` record in user repo | Tweet object | Link or Self post (Thing type t3) |
| **Comment / Reply** | `app.bsky.feed.post` with `reply` field | Reply tweet (tweet with `in_reply_to`) | Comment (Thing type t1) |
| **Community** | List (`app.bsky.graph.list`) / custom feed | Community | Subreddit (Thing type t5) |
| **Like** | `app.bsky.feed.like` record | Favorite / Like | — (no separate like, just upvote) |
| **Upvote/Downvote** | — (not supported natively) | — (not supported) | Vote on Thing |
| **Vote/Reaction** (generic) | Like record | Like/Favorite | Upvote/Downvote |
| **Repost** | `app.bsky.feed.repost` record | Retweet | Crosspost |
| **Follow** | `app.bsky.graph.follow` record | Follow edge in Social Graph | Subscribe to subreddit |
| **Block** | `app.bsky.graph.block` record | Block via API | Block user |
| **Mute** | `app.bsky.graph.mute` (private, on PDS) | Mute via API | Mute user/subreddit |
| **Notification** | `app.bsky.notification.listNotifications` | Notification objects | Message/notification inbox |
| **Label** | `com.atproto.label.defs#label` | Content warning (internal) | Post flair, NSFW tag |
| **Media Blob** | Blob reference (CID-based) | Media entity (media_key) | Image/video upload |
| **Direct Message** | — (separate DM system, not in AT Protocol) | DM object | Private message (Thing type t4) |

### Notes on Data Model Differences

**Comments vs Posts**: Bluesky and Twitter treat replies as a subtype of posts (same schema, just with a parent reference). Reddit treats them as completely different entity types (Thing t1 vs t3). The generic model follows the Bluesky/Twitter approach — comments are posts with `reply_to` set.

**Voting models are incompatible**: Twitter and Bluesky have binary likes (liked/not liked). Reddit has directional votes (+1/-1). The generic model's Vote/Reaction entity supports both via the `direction` field and `type` field.

**Communities map differently**: Reddit's subreddits are fundamental to the platform — all content exists within a subreddit. Twitter's Communities and Bluesky's lists are secondary features. The generic model makes communities optional (posts can exist with or without a `community_id`).

---

## Storage Mapping

| Generic Storage | Bluesky | Twitter/X | Reddit |
|-----------------|---------|-----------|--------|
| **Content Store** | ScyllaDB (AppView index) + user repos (SQLite in PDS) | Manhattan (custom distributed KV) | PostgreSQL (ThingDB) + Cassandra |
| **Identity DB** | PDS SQLite + PLC Directory (PostgreSQL) | User storage in Manhattan | PostgreSQL |
| **Timeline Cache** | AppView computed feeds | Redis sorted sets (3× replicated per DC) | Memcache (54 instances, 3.3 TB) |
| **Social Graph Store** | Records in user repos (PDS) | FlockDB → Social Graph Service (custom) | PostgreSQL (follows/subscriptions table) |
| **Interaction Store** | Records in user repos (likes, reposts) | Manhattan (counters + records) | PostgreSQL Thing table (votes) |
| **Counter Cache** | ScyllaDB counters (AppView) | Redis (engagement counters) | Memcache + PostgreSQL |
| **Search Index** | AppView search (custom) | Earlybird (custom Lucene) | Elasticsearch / Lucene |
| **Blob/Media Store** | CDN + blob storage | Proprietary media storage + CDN | S3 + CDN |
| **Event Bus** | WebSocket firehose (CBOR over WS) | Apache Kafka | Apache Kafka (via Debezium) |

### Notes on Storage Differences

**Reddit's ThingDB is unique**: Reddit's schemaless key-value pattern (Thing table + Data table) lets them store any entity type without schema migrations. The generic model uses typed schemas instead, but the concept of a universal entity wrapper (Record Envelope) is inspired by Reddit's Thing.

**Bluesky's per-user storage is unique**: Each user's data lives in their own repository (SQLite on their PDS). The AppView is a read-only index built by consuming the firehose. In the generic model, this maps to the Content Store (centralized index) with the Data Repository Layer (per-user storage in federated mode).

**Twitter's Manhattan is custom**: Manhattan is a proprietary distributed KV store purpose-built for Twitter's scale. The generic model uses standard technologies (ScyllaDB, PostgreSQL, Redis) that approximate Manhattan's capabilities.

---

## API Pattern Mapping

| Generic Pattern | Bluesky | Twitter/X | Reddit |
|-----------------|---------|-----------|--------|
| **Protocol** | XRPC (HTTP + Lexicon schemas) | REST (HTTP + JSON) | REST (HTTP + JSON) |
| **Endpoint naming** | Reverse-DNS NSID: `com.atproto.repo.createRecord` | Resource paths: `/2/tweets` | Resource paths: `/api/v1/me` |
| **Auth: Login** | `com.atproto.server.createSession` | OAuth 2.0 token grant | OAuth 2.0 password grant |
| **Auth: Third-party** | OAuth 2.0 + DPoP | OAuth 2.0 + PKCE | OAuth 2.0 |
| **Token type** | JWT (accessJwt + refreshJwt) | OAuth 2.0 Bearer token | OAuth 2.0 Bearer token |
| **Pagination** | Cursor-based (`cursor` param) | Cursor-based (`pagination_token`) | Cursor-based (`after`/`before`) |
| **Rate limiting** | Per-PDS limits | Per-project, per-endpoint | 100 req/min (OAuth), 10 (no auth) |
| **Create post** | `com.atproto.repo.createRecord` (collection: `app.bsky.feed.post`) | `POST /2/tweets` | `POST /api/submit` |
| **Like/vote** | `com.atproto.repo.createRecord` (collection: `app.bsky.feed.like`) | `POST /2/users/:id/likes` | `POST /api/vote` |
| **Follow** | `com.atproto.repo.createRecord` (collection: `app.bsky.graph.follow`) | `POST /2/users/:id/following` | `POST /api/subscribe` |
| **Timeline** | `app.bsky.feed.getTimeline` | `GET /2/users/:id/timelines/reverse_chronological` | `GET /` (hot) or `GET /best` |
| **Error format** | `{ "error": "...", "message": "..." }` | `{ "errors": [{ "message": "...", "type": "..." }] }` | `{ "json": { "errors": [...] } }` |
| **Real-time stream** | WebSocket firehose (`com.atproto.sync.subscribeRepos`) | Filtered Stream API (deprecated) | — (no public firehose) |
| **ID format** | TID (timestamp-based, base32-sortable) | Snowflake (64-bit integer) | Base36 sequential (e.g., `t3_abc123`) |
| **Content reference** | AT-URI: `at://did:plc:.../app.bsky.feed.post/tid` | Tweet ID (integer) | Thing fullname: `t3_abc123` |
| **Rich text** | Facets array (byte-range annotations) | Entities (indices into text) | Markdown |
| **Serialization** | CBOR (network/storage), JSON (API) | JSON | JSON |

---

## Event System Mapping

| Generic Concept | Bluesky | Twitter/X | Reddit |
|-----------------|---------|-----------|--------|
| **Event Bus** | Relay (aggregates PDS firehoses) | Apache Kafka | Apache Kafka (via Debezium CDC) |
| **Event format** | CBOR-encoded commits with MST blocks | Protobuf/Thrift on Kafka | JSON/Avro on Kafka |
| **Public stream** | Firehose (WebSocket, CBOR) + JetStream (WebSocket, JSON) | Filtered Stream API v2 (deprecated) | — |
| **Event trigger** | Repository commit (any record write) | Application-level event emission | Database change capture (Debezium) |
| **Ordering** | Sequence number per PDS | Partition-key ordering in Kafka | Offset-based in Kafka |
| **Reconnection** | Cursor (sequence number) | — | Kafka consumer offset |
| **Event volume** | ~200 GB/day raw firehose | Billions of events/day | — (not public) |

### Notes on Event System Differences

**Trigger mechanism is the key difference**:
- Bluesky: Events are triggered at the repository level — any record write (post, like, follow) creates a commit that emits to the firehose. This is inherent to the data structure (MST commits).
- Twitter: Events are explicitly emitted by application code. Each service decides what events to publish.
- Reddit: Events are captured from database transaction logs (CDC). This captures ALL changes, even those made outside normal application flows.

The generic model uses application-level events (like Twitter) as the primary mechanism, with CDC (like Reddit) as a supplementary capture for database-level changes.

---

## Moderation Mapping

| Generic Concept | Bluesky | Twitter/X | Reddit |
|-----------------|---------|-----------|--------|
| **Labeling** | Independent labeler services (`com.atproto.label.*`) | Internal content classification | Post flair + NSFW tag |
| **Label subscription** | Client header: `atproto-accept-labelers` (up to 20) | — (platform decides) | — (platform decides) |
| **Reporting** | `com.atproto.moderation.createReport` | Report tweet/user | Report post/comment |
| **Moderation tool** | Ozone (`tools.ozone.*`) | Internal Trust & Safety tools | Mod tools + AutoModerator |
| **Community mods** | — (limited, via lists) | Community admins | Subreddit moderators |
| **Automated rules** | Labeler services (external) | Internal ML classifiers | AutoModerator (regex rules) |
| **Appeal** | — (contact moderation team) | Appeal form | — (modmail to mods) |

---

## Identity Mapping

| Generic Concept | Bluesky | Twitter/X | Reddit |
|-----------------|---------|-----------|--------|
| **Internal ID** | DID: `did:plc:u5cwb2mwiv2bfq53cjufe6yn` | User ID: `123456789` (Snowflake) | Thing ID: `t2_abc123` |
| **Handle** | Domain-based: `alice.bsky.social` or `alice.custom.com` | @username | u/username |
| **Handle mutability** | Mutable (change domain) | Mutable (change @handle) | Immutable (username permanent) |
| **Account migration** | Full migration between PDS servers (DID stays same) | Not supported | Not supported |
| **Handle resolution** | DNS TXT or HTTPS `.well-known/atproto-did` | API lookup by username | API lookup by username |
| **Key management** | Signing keypair per account, key rotation supported | — (centralized auth) | — (centralized auth) |

---

## Key Architectural Divergences

### 1. Centralized vs. Federated

The most fundamental divergence. Twitter and Reddit are fully centralized — one organization operates all infrastructure. Bluesky is federated — users can run their own PDS, and multiple relays and AppViews can coexist.

**Impact on the generic model**: The service boundaries (Content Service, Identity Service, etc.) work the same way in both modes. The difference is deployment: in centralized mode, one entity runs everything; in federated mode, the PDS (Content + Identity) can be run by different operators, and the AppView (Timeline + Feed) independently aggregates data from multiple PDSes.

### 2. Timeline Assembly Strategy

| Platform | Strategy | Trade-off |
|----------|----------|-----------|
| Twitter | Fanout-on-write (pre-compute) | Fast reads, expensive writes |
| Bluesky | Compute-on-read (AppView queries) | Flexible, higher read latency |
| Reddit | Query-on-read (hot/new/top sorted queries) | Simple, scales with caching |

**Generic model choice**: Fanout-on-write as default (fast reads for the common case), with compute-on-read fallback for celebrity accounts and inactive users.

### 3. Data Ownership

| Platform | Who owns user data? |
|----------|---------------------|
| Twitter | Platform owns all data |
| Reddit | Platform owns all data |
| Bluesky | User owns their repository (self-certifying, portable) |

**Generic model choice**: Supports both — centralized mode has platform-owned storage; federated mode has user-owned repositories with platform-operated indexes.

### 4. Content Addressing

| Platform | How is content referenced? |
|----------|---------------------------|
| Twitter | Opaque integer IDs |
| Reddit | Opaque base36 thing fullnames (t3_abc123) |
| Bluesky | Content-addressed (CID hash) + AT-URI |

**Generic model choice**: Snowflake IDs for primary keys, platform URIs for cross-references. Content hashing (CIDs) available in federated mode for data integrity verification.

### 5. Schema Approach

| Platform | Schema strategy |
|----------|----------------|
| Twitter | Strict internal schemas, versioned API (v1.1 → v2) |
| Reddit | Schemaless KV (ThingDB) — maximum flexibility |
| Bluesky | Lexicon schemas — strict, versioned, machine-readable |

**Generic model choice**: Typed record schemas with a stable envelope. Closer to Bluesky's Lexicon approach than Reddit's schemaless model, but without the immutability constraint.

---

## Further Reading

### Bluesky / AT Protocol
- [AT Protocol Overview](https://atproto.com/guides/overview)
- [AT Protocol Specifications](https://atproto.com/specs)
- [Bluesky API Reference](https://docs.bsky.app/docs/api/)
- [atproto GitHub](https://github.com/bluesky-social/atproto)
- [Bluesky Federation Architecture](https://docs.bsky.app/docs/advanced-guides/federation-architecture)

### Twitter/X
- [X API v2 Documentation](https://developer.x.com/en/docs/x-api)
- [Manhattan: Real-time Distributed Database](https://blog.x.com/engineering/en_us/a/2014/manhattan-our-real-time-multi-tenant-distributed-database-for-twitter-scale)
- [The Infrastructure Behind Twitter: Scale](https://blog.x.com/engineering/en_us/topics/infrastructure/2017/the-infrastructure-behind-twitter-scale)
- [Processing Billions of Events at Twitter](https://blog.x.com/engineering/en_us/topics/infrastructure/2021/processing-billions-of-events-in-real-time-at-twitter-)

### Reddit
- [Reddit Architecture Overview (archived)](https://github.com/reddit-archive/reddit/wiki/architecture-overview)
- [Reddit's Architecture Evolution (ByteByteGo)](https://blog.bytebytego.com/p/reddits-architecture-the-evolutionary)
- [Reddit Data API Wiki](https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki)
