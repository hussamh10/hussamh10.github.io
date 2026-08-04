# hussamhabib.com — the paper-cards site

Static. No build step, no dependencies. Light and dark, following the system.

    content/      ← the words. One markdown file per card. Edit these.
    index.html    the layout skeleton
    styles.css    all geometry lives here
    app.js        markdown loader, the card morph, the full-page view, the eggs
    res/          fonts, crests, socials, docs, paper scans, eggs

**Double-click `preview.command` to look at the site.** It serves the folder and
opens a browser. Do *not* open `index.html` directly — a page loaded off the disk
is not allowed to read its own `content/*.md` (or its fonts), so you would get
stale text and cards that do nothing. If that happens the page now says so in a
black bar along the bottom rather than failing quietly.

## Writing

Everything you'd want to reword lives in `content/*.md` — one file per card,
named for its `data-card` / `data-md` key in `index.html`.

    hello.md  bio.md  research.md  updates.md      the four masthead cards
    algorithms.md  users.md  moderation.md         the three that open
    brainrot.md  production.md  dysfunction.md     the six that are titles only
    mechanisms.md  better.md  pakistan.md

For a work card, the `# heading` is the title and everything after it is the
body. **A card with a body opens; a card with only a title stays inert.** So the
six title-only cards become clickable the moment you write something under the
heading — nothing else to change.

Papers go under a `## Papers` heading, one per line:

    ## Papers

    - aceap.webp | Characterizing Platform Behaviors: … | https://arxiv.org/pdf/2407.07227

The markdown understood is deliberately small: paragraphs, `# heading`,
`- bullets`, `**bold**`, `*italic*`, links either way round — `[text](url)` or
`(text)[url]` — and one custom thing —

    a researcher at NYU{+, with [Rachel Greenstadt](…) at the PSAL lab}

Bare domains work as links too: `(Tim)[timbooker.net]` gets `https://` added.
A parenthetical that is not followed by a bracket — `(500M)` — is left alone.

`{+ … }` becomes the little `+` you can click to unfold an aside inline. Ordinary
line wrapping in the file is just wrapping; end a line with two spaces to force a
break, which is how the deck stacks its short lines.

`index.html` still carries a copy of the masthead text and the card titles. That
is a no-JS fallback only — the markdown is what wins. If you rewrite a card and
care about JS-off visitors, paste the new text into the fallback too; otherwise
ignore it.

Bullets in `updates.md` get a glyph chosen from the verb the line opens with —
*Thinking* a thought bubble, *Collected* an arrow in, *Submitted* and anything
that got *accepted* a page, *Started* a star. The table is `MARKS` at the top
of `app.js`; a line matching nothing keeps the plain dot. To overrule it, write
the name in braces: `- {star} Moved to Graz.`

`updates.md` can be as long as you like. On the wide layout the card is taken out
of the masthead's flow, so the row is measured by the next-tallest column and the
card fills exactly that and scrolls, title pinned. Add a bullet and nothing else
moves. On the phone it folds instead: the first three show and the rest sit
behind a "+ N more", rebuilt by `refold()` after the markdown lands, so the count
follows the file.

## The geometry

Everything is lifted 1:1 from the deck (A4, 7pt) and expressed in **rem**, so the
whole board scales as one object. The root font-size is the only scale knob:

```css
html { font-size: clamp(11px, 1.1666vw, 18px); }
```

`1.1666vw` is the size at which the board spans the full window — i.e. the page
always looks like the deck zoomed to fill the screen. The 18px cap stops it
growing on very wide monitors; raise it if you want it bigger still.

| token      | value       | deck equivalent                    |
| ---------- | ----------- | ---------------------------------- |
| `--fs`     | 0.945rem    | 7pt body text                      |
| `--line`   | 1.21rem     | one line — the blank-line unit     |
| `--col`    | 17.429rem   | 116.5pt card column                |
| `--gut`    | 2.76rem     | 18.3pt gutter                      |
| `--rail`   | 6.318rem    | 42pt portrait column               |
| `--indent` | 7.117rem    | the deck's left margin             |
| `--micro`  | 0.66rem     | 4pt labels (bumped for legibility) |
| `--wave`   | dashed sine | 7.85pt period, 2.3pt peak-to-peak  |

The rem values are **calibrated, not derived**: they are the ratios at which the
deck's measure survives — 32 characters across a card, 29 across a bullet. Change
`--col` or `--fs` and every card rewraps.

### The typeface

**Iosevka** (SIL OFL), self-hosted in `res/fonts`, subset to the ~120 glyphs this
page actually uses — the full latin cut is ~1 MB per weight, these are ~70 KB.
Weights 200 / 300 / 400 / 700, all four declared as `@font-face` — if a weight
has no face the browser silently renders the nearest one, which is easy to miss.
Body is `--weight: 300`, headings `--weight-bold: 700`. Being monospace its advances are identical across weights,
so bolding reflows nothing and the body weight is a one-token change.

**The body is really set at 350, and 350 does not exist.** Iosevka ships no
SemiLight: the public release has 100–900 in hundreds and no variable font, and
the in-between weights only come out of a custom build. So the half-step is made
rather than downloaded. Iosevka's `H` stem grows from 61 to 78 units per 1000
between Light and Regular; a `-webkit-text-stroke` widens a stem by exactly its
own width and touches no advance, so `--gain: 0.0085em` — half of 17 — lands the
stem where a real 350 would put it and moves not one line break. Measured in
Chrome at 300 px: stems of 60.8 / 70.0 / 77.5 units for 300 / 300+gain / 400,
with all three strings the same width to four decimals. Dial it: `0` is a true
300, `0.017em` a true 400. Real weights reset it (`-webkit-text-stroke-width: 0`
sits next to every `--weight-bold`), since 700 needs no help.

The page was originally set in **Datatype Condensed**, which is still in
`res/fonts`. Be warned if you go back: **the Datatype files we have carry no
weights.** Every cut from Thin to Black is the same outline — identical glyph
areas, identical rendered ink at `font-weight` 400 through 900 — and the variable
font ships with an empty `gvar`, so its `wght` axis does nothing either. No CSS
weight will make it heavier; it has to be faked with `-webkit-text-stroke` (which
at least changes no advances, so no line breaks move). Switching back means:
restore its `@font-face`, re-add the stroke tokens, and set `--fs` to `1rem`.

## The phone

The deck's card measure — **32 monospace characters** — happens to be almost
exactly a phone column. So the phone layout is not a shrunken desktop: one card
becomes the full width and the measure stays identical. The root size is solved
backwards from that:

```
card = 100vw − 1.75rem (the indent the brackets live in) − 0.95rem
text = card − 2×1.089rem padding − 2px rule
want   text ≥ 32 × 0.5em × 0.945rem   ⇒   root ≤ (100vw − 2px) / 20
```

which is `clamp(14px, 4.95vw, 21px)`. Measured: 32.2 characters at 390px, 32.2 at
360px, 32.8 at 430px — the same line breaks the deck has.

Everything else stays: the bracketed group labels keep their gutter, the waves run
edge to edge, the cards keep their rules and shadows. Three things move:

- **Two blocks fold.** The timeline + postdoc bio sit behind `+ where I have
  been`, and the updates card shows three bullets behind `+ 3 more` — otherwise
  the masthead is a long scroll before you reach any work. They use the page's own
  `+` idiom, and `fold()` animates the height between the two measured states.
- **The brick moves** to the tail of desk at the foot of the page (`.col--b` goes
  `position: static` so it anchors to `.board` instead).
- **The portrait centres** and the four social marks stretch the full width of a
  card, picking up the same rhythm as the crests below them.
- **Papers sit under the expanded card**, not beside it. The morph needs to know
  the card's finished height before it gets there, so `open()` hands it over as
  `--papers-top`.

The scientist needs a **double** tap — a single one does nothing — since a
one-tap easter egg on a phone is just something you trip over. One handler covers
mouse and touch (`dblclick` is unreliable on phones), and the portrait carries
`touch-action: manipulation` so the second tap doesn't zoom the page instead.

Two anchoring traps, both already sprung: `.rail` and `.rail--work` are narrow
columns on desktop but full-width rows on the phone, so `left: 50%` centres the
scientist on the *page* rather than on the portrait, and Freud's offset parent
silently becomes `.board`. Both are pinned explicitly in the phone block. If you
touch that layout, check the scientist's head still lands in the frame.

Hover-only affordances are behind `@media (hover: hover) and (pointer: fine)` so
they neither stick nor go missing on touch.

## The groups

Each run of cards carries a bracket and a turned label in the gutter — *Work I
have done*, *Work I am doing*, *Big areas I am working towards*, *Other
ventures*. They are `.group` wrappers: `::before` draws the `[` rule and
`.group__label` is the rotated caption, sitting on the rule with a desk-coloured
background so the line breaks around it. Both are pulled left with negative
offsets, so they cost the grid no width.

## Saying a card opens

Three of the nine work cards open, and nothing about a closed card used to
say so — hover is out (it lies on touch), and so is a shadow. So each of them
carries an **asterisk** in the corner: a footnote mark, the quietest way to
say there is more to this than the line you just read. It is set at a true
300, a shade lighter than the body, and dropped by hand — an asterisk rides
high in its em box, where a footnote wants it, which is not where a corner
mark wants it.

An asterisk still has to be learned, so early on a **hand** says the same
thing in a way nobody has to learn. It fades up in the asterisk's place on the
first card only, at half opacity, and hands the corner back. Three times, five
seconds apart, starting ten seconds in — counted from when the cards actually
exist, not from the first byte. It stops early if you open a card (you clearly
did not need telling), it does not spend one of its three while the tab is in
the background, and it never runs at all under `prefers-reduced-motion`. The
knobs are at the foot of `app.js`.

The hand is drawn rather than typed — no arrow, star or hand is in the font
subset, and a missing glyph would quietly come back in some other typeface.
It is a **mask** tinted by `currentColor` rather than a picture of black
lines, which is why it follows the ink into dark mode with no second copy.

## Opening a card

There is no separate expanded view: the card grows into it. `open()` in `app.js`
does the whole thing:

1. Freeze `.work__stage`'s height so nothing below it jumps.
2. Measure the clicked card's rect and the rect the panel wants (`restingBox()` —
   which reads the width from the stylesheet, so it works at every breakpoint).
3. Float the panel's card and papers absolutely (`.panel.is-morphing`), park the
   card on the clicked card's rect, and animate `left/top/width/height` via WAAPI.

Animating the box rather than transforming it is deliberate: the text **reflows**
every frame instead of being scaled, so it settles into the wider measure rather
than stretching.

Nothing fades out of the way — it gets **shoved**. `shoveAside()` gives every
other element a direction off the clicked card: other columns go sideways, the
clicked card's own siblings split up and down around it, and the source group's
bracket dims in place since it has nowhere sensible to go. 240ms (`SHOVE`), quick
enough to read as being elbowed aside. `shoveBack()` walks them all in again on
close. `.board` carries `overflow: clip` so none of it can grow the scroll area.

The title needs no crossfade: the panel's `<h2>` lands exactly on the collapsed
card's title — same face, same measure, one weight heavier — so it just thickens.
The body fades in at 28%, and the papers arrive in the last 28%, landing as the
box stops growing. Closing reverses it, except the papers leave *first*, so they
don't hang around beside a shrinking card.

The paper fades are WAAPI animations with `fill: "both"`, which outranks inline
styles — so they're held on `papers.__anim` and cancelled on settle. Forget that
and they either linger or blank out.

### The papers

They used to sit in a 6.9rem gutter beside the card — 116px, at which nothing
on a sheet is legible, so the only thing to do with one was click it — while
539px of desk sat empty to their right. Now the card keeps the deck's measure
and the papers get the whole width beneath it.

The row count is not fixed. Each sheet is `flex: 1 1 18rem; max-width: 23rem`,
so a row breaks only when another sheet would drop below readable: three across
on a desktop, two on a tablet, one on a phone. Swept from 1600px down to 360px,
a sheet is never narrower than 289px and never wider than 483px — against 116px
before. At that size the title, the authors and the abstract all read without
opening anything, and clicking still gives you the full page.

The cost is height: a three-paper panel is ~940px on a desktop and taller on a
phone, so it no longer fits in one screen. That is the trade — sheets big enough
to read cannot also be short.

On finish the panel is handed back to normal flow; it lands exactly where the
animation left it, so there is no snap. A full open → close cycle returns the
page to a pixel-identical state. `GROW` (460ms) and `EASE` at the top of `app.js`
are the knobs.

## Clicking

| you click                   | what happens                                |
| --------------------------- | ------------------------------------------- |
| one of the three work cards | it grows into its full self                 |
| a paper, while one is open  | it opens to the full page over a pale scrim |
| anywhere else, while open   | it collapses back                           |
| Escape                      | same, innermost thing first                 |

Each panel also has a deep link (`/#algorithms`), and back/forward work.

Nothing on the board reacts to hover — not the openable cards, not the CV /
research-statement sheets, not the papers. They carry `cursor: pointer` and
nothing else. **The affordance for "this one opens" is still an open question**:
three of the nine cards are clickable and there is currently no visual tell.

## Adding a card

To add a card to the board: drop a `<div class="card" data-card="KEY">Title</div>`
into whichever `.group` in `index.html` it belongs to, and write `content/KEY.md`.
That's it — the panel, its papers and its deep link are all built from the file.

Paper scans live in `res/papers` at 1100px wide, which is what the full-page view
needs. Anything narrower looks soft when opened.

## Weight

First load is **~327 KB** — two font subsets, the portrait, the crests and the two
document thumbnails. Everything else is deferred, which matters on a phone:

- paper scans are `loading="lazy"` inside closed panels, so a card's three arrive
  only when that card is opened (and the other four never do);
- the scientist is 47 KB of easter egg held in `data-src`, fetched the first time
  somebody taps the portrait;
- images are WebP (the portrait went 165 → 15 KB, the scientist 530 → 47 KB).

Before this pass the phone pulled 2.2 MB up front. If you add art, keep it off the
critical path the same way.

## The eggs

| egg           | trigger                                          | behaviour                                                                             |
| ------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| the scientist | **double**-tap the portrait; tap *him* to send him away | zooms up into place, in front of everything, and lends his head to the photo frame     |
| the brick     | hold still for 4.5s — or hover his patch of desk | three 180ms frames fading 0.4 → 0.26 → 0.14; hovering holds him at 0.8 instead          |
| Freud         | open the *Investigating the behaviors…* card     | one 950ms fade up to 75% and back out, once per visit                                   |

The brick has a 22s cooldown so it stays a rumour; `DWELL` and `COOLDOWN` sit at
the top of its block in `app.js`, and the flash is `brick-flash` in the CSS. Freud
is fired by `flashFreud()` and latched by `freudSpent`. All three eggs are
suppressed under `prefers-reduced-motion`, as is the morph.

## Dark

`@media (prefers-color-scheme: dark)` at the foot of `styles.css`, and it is
short on purpose. Four tokens — `--ink`, `--paper`, `--desk`, `--rule` — carry
almost all of it, because almost everything is written in terms of them; the
drawn glyphs are masks tinted by `currentColor`, so they come along for free.
The rest of the block is the handful of places that name a grey outright.

Two decisions worth knowing. The rule is `#6e6e6e`, not white: a white hairline
around every card out-shouts the text it is meant to contain. And the card
shadow is dropped entirely — a drop shadow on a dark desk is a smudge, and the
rule already carries the edge.

The images are the part CSS cannot fix, so they are handled one at a time. The
portrait and the four crests keep their own light: a photograph cannot be
re-lit, and a brand mark should not be. The document and paper thumbnails stay
white, because they are pictures of paper and paper is white. Only the social
badges turn over — they are pure black-and-white, so `invert(0.86)` makes them
light stickers rather than dark holes, stopping short of white so they do not
out-glow the text.

## Loose ends

- The bio says "CS² @ UniGraz" — no link, I didn't have the URL.
- Content moderation ends on "read this piece by us" — no link yet either.
- CV and research statement in `res/docs/` are the ones from the old site, and
  the labels say so.
