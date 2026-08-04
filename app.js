/* ═══════════════════════════════════════════════════════════════════
   Hussam Habib — behaviour.

   Four things happen here: inline "+" asides, a card growing into its
   full self, a paper opening to its full page, and three easter eggs.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var GROW = reduced ? 0 : 460; /* how long a card takes to become itself */
  var SHOVE = reduced ? 0 : 240; /* how quickly the others get out of the way */
  var ZOOM = reduced ? 0 : 340;
  var EASE = "cubic-bezier(0.22, 0.85, 0.28, 1)";

  var $ = function (s, r) {
    return (r || document).querySelector(s);
  };
  var $$ = function (s, r) {
    return Array.prototype.slice.call((r || document).querySelectorAll(s));
  };

  /* ── folds: the phone hides a couple of things behind a "+" ─────── */
  function fold(el, apply) {
    var from = el.offsetHeight;
    apply();
    var to = el.offsetHeight;
    if (!GROW || from === to) return;
    el.style.overflow = "hidden";
    var a = el.animate([{ height: from + "px" }, { height: to + "px" }], {
      duration: 300,
      easing: EASE,
    });
    a.finished.then(function () {
      el.style.overflow = "";
    });
  }

  function bindReveal(btn) {
    var target = document.getElementById(btn.getAttribute("aria-controls"));
    var mark = $(".reveal__mark", btn);
    var text = $(".reveal__text", btn);
    if (!target) return;
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open;
      fold(target, function () {
        open = target.classList.toggle("is-open");
      });
      btn.setAttribute("aria-expanded", String(open));
      mark.textContent = open ? "\u2212" : "+";
      var swap = text.dataset.alt;
      text.dataset.alt = text.textContent;
      text.textContent = swap;
    });
  }

  $$(".reveal").forEach(bindReveal);

  /* ── what kind of thing happened ──────────────────────────────────
     The bullet follows the verb the line opens with, falling through to
     anything that got accepted. Add a row here plus a rule in styles.css
     to extend it; a line that matches nothing keeps the plain dot.
     ─────────────────────────────────────────────────────────────────── */
  var MARKS = [
    [/^thinking\b/i, "think"],
    [/^collected\b/i, "in"],
    [/^submitted\b/i, "paper"],
    [/^started\b/i, "star"],
    [/\baccepted\b/i, "paper"],
  ];

  function markBullets(card) {
    $$("li", card).forEach(function (li) {
      if (li.dataset.mark) return; /* the markdown already said so */
      var text = li.textContent.trim();
      for (var i = 0; i < MARKS.length; i++) {
        if (MARKS[i][0].test(text)) {
          li.dataset.mark = MARKS[i][1];
          return;
        }
      }
    });
  }

  /* The updates list is rewritten from markdown, which takes the phone's fold
     with it. Put it back, however many bullets the file happens to have. */
  var SHOWN = 3;

  function refold(card) {
    var list = $("ul", card);
    if (!list) return;
    var items = $$("li", list);
    if (items.length <= SHOWN) return;

    list.className = "folds";
    list.id = "updates-list";
    items.slice(SHOWN).forEach(function (li) {
      li.classList.add("later");
    });

    var btn = document.createElement("button");
    btn.className = "reveal reveal--in";
    btn.type = "button";
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", "updates-list");
    btn.innerHTML =
      '<span class="reveal__mark">+</span><span class="reveal__text" data-alt="less">' +
      (items.length - SHOWN) +
      " more</span>";
    card.appendChild(btn);
    bindReveal(btn);
  }

  /* ═══════════════════ a card grows into itself ═══════════════════ */
  var work = $(".work__stage");
  var grid = document.getElementById("grid");
  var stage = document.getElementById("stage");
  var panels = {};

  /* ═══════════════ the cards are written in content/*.md ═══════════════
     One file per card. The `# heading` is the title; anything after it is the
     body. A card with a body opens; a card with only a title stays inert.
     A "## Papers" list takes lines of:  file.webp | Title | url
     ══════════════════════════════════════════════════════════════════════ */

  function esc(t) {
    return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* the small slice of markdown this site speaks:
     **bold**  *italic*  [text](url)  and  word{+ the aside behind the + }  */
  var asideSeq = 0;

  function inline(t) {
    var held = [];
    t = t.replace(/\{\+([\s\S]+?)\}/g, function (_, body) {
      held.push(body);
      return "\u0002" + (held.length - 1) + "\u0002";
    });

    var link = function (text, url) {
      /* a bare domain still deserves to be a link */
      if (!/^([a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(url)) url = "https://" + url;
      return '<a href="' + url + '" target="_blank" rel="noopener">' + text + "</a>";
    };

    var html = esc(t)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, text, url) {
        return link(text, url);
      })
      /* the other way round reads just as naturally, so accept it too */
      .replace(/\(([^()\n]+)\)\s*\[([^\]\s]+)\]/g, function (whole, text, url) {
        return /[.:\/]/.test(url) ? link(text, url) : whole;
      })
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>")
      .replace(/_([^_\n]+)_/g, "<i>$1</i>");

    return html.replace(/\u0002(\d+)\u0002/g, function (_, i) {
      var id = "aside-" + asideSeq++;
      return (
        '<button class="more" type="button" aria-expanded="false" aria-controls="' + id + '">+</button>' +
        '<span class="aside" id="' + id + '">' + inline(held[+i]) + "</span>"
      );
    });
  }

  /* a whole markdown block: paragraphs, a heading, bullet lists */
  function renderBlock(src) {
    src = src.replace(/<!--[\s\S]*?-->/g, "").replace(/\r/g, "");
    var out = [];
    src.split(/\n\s*\n/).forEach(function (chunk) {
      chunk = chunk.trim();
      if (!chunk) return;

      if (/^#\s+/.test(chunk)) {
        out.push('<p class="updates__head">' + inline(chunk.replace(/^#\s+/, "")) + "</p>");
        return;
      }
      if (/^-\s+/.test(chunk)) {
        out.push(
          "<ul>" +
            chunk
              .split(/\n(?=\s*-\s)/)
              .map(function (li) {
                var text = li.trim().replace(/^-\s+/, "").replace(/\s*\n\s*/g, " ");
                /* `- {star} …` forces the bullet's glyph; otherwise markBullets picks */
                var mark = "";
                text = text.replace(/^\{([a-z-]+)\}\s*/i, function (_, name) {
                  mark = name.toLowerCase();
                  return "";
                });
                return "<li" + (mark ? ' data-mark="' + mark + '"' : "") + ">" + inline(text) + "</li>";
              })
              .join("") +
            "</ul>"
        );
        return;
      }
      var marked = chunk.replace(/(?:  +|\\)\n/g, "\u0001").replace(/\s*\n\s*/g, " ");
      out.push("<p>" + inline(marked).replace(/\u0001/g, "<br />") + "</p>");
    });
    return out.join("\n");
  }

  function parseCard(src) {
    var out = { title: "", body: "", papers: [] };
    src = src.replace(/<!--[\s\S]*?-->/g, "").replace(/\r/g, "");

    var papers = src.split(/^##\s+Papers\s*$/m);
    src = papers[0];
    if (papers[1]) {
      papers[1].split("\n").forEach(function (line) {
        var m = line.match(/^\s*-\s*(.+)$/);
        if (!m) return;
        var bits = m[1].split("|").map(function (x) {
          return x.trim();
        });
        if (bits.length >= 3) out.papers.push({ img: bits[0], title: bits[1], href: bits[2] });
      });
    }

    var head = src.match(/^#\s+(.+)$/m);
    if (head) {
      out.title = head[1].trim();
      src = src.slice(src.indexOf(head[0]) + head[0].length);
    }

    /* blank line = new paragraph. Ordinary wrapping in the file is just
       wrapping; end a line with two spaces (or a backslash) to force a break,
       which is how the deck stacks its short lines. */
    out.body = src
      .split(/\n\s*\n/)
      .map(function (para) {
        return para.trim();
      })
      .filter(Boolean)
      .map(function (para) {
        var marked = para.replace(/(?:  +|\\)\n/g, "\u0001").replace(/\s*\n\s*/g, " ");
        return "<p>" + inline(marked).replace(/\u0001/g, "<br />") + "</p>";
      })
      .join("\n");

    return out;
  }

  function buildPanel(key, card) {
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.dataset.panel = key;
    panel.hidden = true;

    var art = document.createElement("article");
    art.className = "card card--panel";
    art.innerHTML = "<h2>" + esc(card.title) + '</h2><div class="card__body">' + card.body + "</div>";
    panel.appendChild(art);

    if (card.papers.length) {
      var wrap = document.createElement("div");
      wrap.className = "papers";
      card.papers.forEach(function (p) {
        var b = document.createElement("button");
        b.className = "paper";
        b.type = "button";
        b.dataset.href = p.href;
        b.dataset.title = p.title;
        b.innerHTML = '<img src="res/papers/' + encodeURI(p.img) + '" alt="' + esc(p.title) + '" />';
        wrap.appendChild(b);
      });
      panel.appendChild(wrap);
    }
    return panel;
  }

  /* A browser will not let a page opened straight off the disk read its own
     sibling files. Rather than fail silently — stale text, dead cards — say so. */
  var contentBroken = false;

  function warnAboutContent() {
    if (contentBroken) return;
    contentBroken = true;
    var bar = document.createElement("div");
    bar.className = "warnbar";
    bar.innerHTML =
      "<b>This page cannot read its own text.</b> Opened straight off the disk, the browser blocks " +
      "<code>content/*.md</code> (and the fonts), so the words are stale and no card will open. " +
      "Double-click <code>preview.command</code> in the project folder instead.";
    document.body.appendChild(bar);
  }

  function loadMd(key) {
    return fetch("content/" + key + ".md").then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.text();
    });
  }

  /* the masthead blocks. Their markup in index.html is a no-JS fallback;
     the markdown is what actually wins. */
  var blocksReady = Promise.all(
    $$("[data-md]").map(function (el) {
      return loadMd(el.dataset.md)
        .then(function (text) {
          el.innerHTML = renderBlock(text);
          if (el.dataset.md === "updates") {
            markBullets(el);
            refold(el);
          }
        })
        .catch(warnAboutContent);
    })
  );

  var contentReady = Promise.all(
    $$("[data-card]").map(function (el) {
      var key = el.dataset.card;
      return loadMd(key)
        .then(function (text) {
          var card = parseCard(text);
          if (card.title) el.textContent = card.title;
          if (!card.body) return; /* title only — the card stays put */

          el.classList.add("card--open");
          el.dataset.open = key;
          el.setAttribute("role", "button");
          el.tabIndex = 0;

          var panel = buildPanel(key, card);
          stage.appendChild(panel);
          panels[key] = panel;
        })
        .catch(warnAboutContent);
    })
  );

  var current = null; /* key of the open panel */
  var busy = false;
  var everOpened = false; /* once you have opened one, the hand stops offering */

  /* The panel opens below the masthead, so on a tall window the papers can
     land entirely under the fold — and nobody scrolls looking for something
     they have no reason to think is there. So the page goes to it. Only when
     it does not already fit: no lurch when there is nothing to reveal. */
  function bringIntoView(panel) {
    var box = panel.getBoundingClientRect();
    var room = window.innerHeight;
    if (box.top >= 0 && box.bottom <= room) return;
    var margin = 1.2 * root();
    var top = window.scrollY + box.top - margin;
    /* if it is taller than the window, its top is the part worth showing */
    window.scrollTo({ top: Math.max(0, top), behavior: reduced ? "auto" : "smooth" });
  }

  /* geometry of `el` relative to the stage's padding box */
  function boxIn(el, host) {
    var a = el.getBoundingClientRect();
    var b = host.getBoundingClientRect();
    return { left: a.left - b.left, top: a.top - b.top, width: a.width, height: a.height };
  }

  function px(v) {
    return v + "px";
  }

  function place(el, box) {
    el.style.left = px(box.left);
    el.style.top = px(box.top);
    el.style.width = px(box.width);
    el.style.height = px(box.height);
  }

  function frames(el, from, to) {
    var key = function (b) {
      return { left: px(b.left), top: px(b.top), width: px(b.width), height: px(b.height) };
    };
    return el.animate([key(from), key(to)], { duration: GROW, easing: EASE, fill: "both" });
  }

  /* ── everything that is not the clicked card gets pushed out of frame ── */
  var shoves = [];

  function root() {
    return parseFloat(getComputedStyle(document.documentElement).fontSize);
  }

  function shoveAside(trigger) {
    var srcGroup = trigger.closest(".group");
    var srcCol = trigger.closest(".col");
    var tr = trigger.getBoundingClientRect();
    var u = root();
    var items = [];

    /* other groups travel whole, bracket and label with them */
    $$(".group", grid).forEach(function (g) {
      if (g !== srcGroup) items.push(g);
    });
    $$(".wave--short", grid).forEach(function (w) {
      items.push(w);
    });
    /* the clicked card's own siblings split around it */
    if (srcGroup) {
      $$(".card", srcGroup).forEach(function (c) {
        if (c !== trigger) items.push(c);
      });
      srcGroup.classList.add("is-source");
    }

    shoves = items.map(function (el) {
      var r = el.getBoundingClientRect();
      var to;
      if (el.closest(".col") !== srcCol) to = "translateX(" + 8 * u + "px)"; /* sideways */
      else if (r.top >= tr.bottom - 1) to = "translateY(" + 6 * u + "px)"; /* downwards */
      else to = "translateY(" + -5 * u + "px)"; /* upwards */

      return {
        el: el,
        to: to,
        anim: el.animate([{ transform: "none", opacity: 1 }, { transform: to, opacity: 0 }], {
          duration: SHOVE,
          easing: "cubic-bezier(0.36, 0, 0.28, 1)",
          fill: "both",
        }),
      };
    });
  }

  function shoveBack() {
    shoves.forEach(function (s) {
      s.anim.cancel();
      s.anim = s.el.animate([{ transform: s.to, opacity: 0 }, { transform: "none", opacity: 1 }], {
        duration: SHOVE,
        easing: "cubic-bezier(0.36, 0, 0.28, 1)",
        fill: "both",
      });
    });
  }

  function shovesClear() {
    shoves.forEach(function (s) {
      s.anim.cancel();
    });
    shoves = [];
    $$(".group.is-source", grid).forEach(function (g) {
      g.classList.remove("is-source");
    });
  }

  /* the rect this panel's card wants, once the grid is out of the way.
     Call it while the card still sits in the panel's own grid, so the
     width comes from the stylesheet rather than a magic number. */
  function restingBox(panel) {
    var card = $(".card--panel", panel);
    var w = card.getBoundingClientRect().width;
    var prev = card.getAttribute("style") || "";
    card.style.cssText = prev + ";position:absolute;visibility:hidden;left:0;top:0;width:" + px(w) + ";height:auto";
    var h = card.offsetHeight;
    card.setAttribute("style", prev);
    return { left: 0, top: 0, width: w, height: h };
  }

  function open(key, push) {
    if (busy || current === key || !panels[key]) return;
    var panel = panels[key];
    var card = $(".card--panel", panel);
    var papers = $(".papers", panel);
    var trigger = $('[data-open="' + key + '"]');
    busy = true;

    /* freeze the section so nothing below it jumps while we animate */
    var hold = work.offsetHeight;
    work.style.height = px(hold);

    var gridBox = boxIn(grid, work);
    var from = boxIn(trigger, work);
    from.left -= gridBox.left;
    from.top -= gridBox.top;

    stage.hidden = false;
    panel.hidden = false;
    panel.style.position = "absolute";
    panel.style.left = px(gridBox.left);
    panel.style.top = px(gridBox.top);
    panel.style.width = px(gridBox.width);

    var to = restingBox(panel); /* measured while the grid still governs the width */
    /* on a phone the papers sit under the card, so they need to know how tall
       it will end up before the box has finished growing */
    panel.style.setProperty("--papers-top", px(to.height + 0.8 * root()));
    panel.classList.add("is-morphing");

    place(card, from);
    card.style.overflow = "hidden";
    /* the title needs no crossfade: it lands exactly on the one underneath,
       same face and measure, only heavier */
    $(".card__body", card).style.opacity = 0;

    /* let the browser see the start state before we move */
    void card.offsetWidth;

    grid.classList.add("is-hushed");
    shoveAside(trigger);

    var anim = frames(card, from, to);
    setTimeout(function () {
      $(".card__body", card).style.opacity = 1;
    }, GROW * 0.28);
    if (papers) {
      papers.__anim = papers.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: Math.max(1, GROW * 0.28),
        delay: GROW * 0.72, /* they land exactly as the box stops growing */
        easing: "ease",
        fill: "both",
      });
    }

    var settle = function () {
      /* hand the panel back to normal flow — it lands exactly where it is */
      grid.hidden = true;
      panel.classList.remove("is-morphing");
      panel.style.position = panel.style.left = panel.style.top = panel.style.width = "";
      panel.style.removeProperty("--papers-top");
      card.style.cssText = "";
      if (papers) {
        if (papers.__anim) papers.__anim.cancel();
        papers.__anim = null;
        papers.style.opacity = "";
      }
      work.style.height = "";
      current = key;
      everOpened = true;
      busy = false;
      bringIntoView(panel); /* now that it is in flow, its box is real */
      if (key === "algorithms") flashFreud();
    };

    if (!GROW) settle();
    else
      anim.finished.then(function () {
        anim.cancel();
        settle();
      });

    if (push !== false && location.hash.slice(1) !== key) {
      history.pushState({ panel: key }, "", "#" + key);
    }
  }

  function close(push) {
    if (busy || !current) return;
    var key = current;
    var panel = panels[key];
    var card = $(".card--panel", panel);
    var papers = $(".papers", panel);
    var trigger = $('[data-open="' + key + '"]');
    busy = true;
    current = null;

    var hold = work.offsetHeight;
    work.style.height = px(hold);

    /* pin the panel where it sits, then let the grid back into the flow */
    var panelBox = boxIn(panel, work);
    var from = boxIn(card, work);
    from.left -= panelBox.left;
    from.top -= panelBox.top;

    panel.classList.add("is-morphing");
    panel.style.position = "absolute";
    panel.style.left = px(panelBox.left);
    panel.style.top = px(panelBox.top);
    panel.style.width = px(panelBox.width);
    place(card, from);
    card.style.overflow = "hidden";

    grid.hidden = false;
    void grid.offsetWidth;

    var to = boxIn(trigger, work);
    to.left -= panelBox.left;
    to.top -= panelBox.top;

    $(".card__body", card).style.opacity = 0;
    if (papers) {
      if (papers.__anim) papers.__anim.cancel();
      papers.__anim = papers.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: Math.max(1, GROW * 0.3),
        easing: "ease",
        fill: "both",
      });
    }

    var anim = frames(card, from, to);
    shoveBack();

    var settle = function () {
      grid.classList.remove("is-hushed");
      shovesClear();
      panel.hidden = true;
      stage.hidden = true;
      panel.classList.remove("is-morphing");
      panel.style.position = panel.style.left = panel.style.top = panel.style.width = "";
      card.style.cssText = "";
      $(".card__body", card).style.opacity = "";
      if (papers) {
        if (papers.__anim) papers.__anim.cancel();
        papers.__anim = null;
        papers.style.opacity = "";
      }
      work.style.height = "";
      busy = false;
      /* deliberately no scroll back — you stay where you were reading */
    };

    if (!GROW) settle();
    else
      anim.finished.then(function () {
        anim.cancel();
        settle();
      });

    if (push !== false && location.hash) {
      history.pushState({ panel: null }, "", location.pathname + location.search);
    }
  }

  /* ═══════════════════ a paper opens to its full page ═══════════════ */
  var lightbox = document.getElementById("lightbox");
  var lightboxImg = document.getElementById("lightboxImg");
  var lightboxLink = document.getElementById("lightboxLink");
  var lightboxOpen = false;

  function openPaper(paper) {
    var img = $("img", paper);
    lightboxImg.src = img.src;
    lightboxImg.alt = img.alt;
    lightboxLink.textContent = paper.dataset.title + " ↗";
    lightboxLink.href = paper.dataset.href;
    lightbox.hidden = false;
    lightboxOpen = true;

    var from = paper.getBoundingClientRect();
    var to = lightboxImg.getBoundingClientRect();
    var scale = from.width / to.width;
    lightboxImg.animate(
      [
        {
          transform:
            "translate(" + (from.left - to.left) + "px," + (from.top - to.top) + "px) scale(" + scale + ")",
          boxShadow: "0 0 0 rgba(0,0,0,0)",
        },
        { transform: "none" },
      ],
      { duration: ZOOM, easing: EASE }
    );
    requestAnimationFrame(function () {
      lightbox.classList.add("is-open");
    });
  }

  function closePaper() {
    if (!lightboxOpen) return;
    lightboxOpen = false;
    lightbox.classList.remove("is-open");
    setTimeout(
      function () {
        lightbox.hidden = true;
      },
      reduced ? 0 : 220
    );
  }

  /* ═══════════════════ one click handler to rule them ═══════════════ */
  document.addEventListener("click", function (e) {
    /* inline "+" asides — delegated, since the markdown makes them */
    var more = e.target.closest(".more");
    if (more) {
      e.stopPropagation();
      var aside = document.getElementById(more.getAttribute("aria-controls"));
      if (aside) {
        var shown = aside.classList.toggle("is-open");
        more.setAttribute("aria-expanded", String(shown));
        more.textContent = shown ? "−" : "+";
      }
      return;
    }

    if (lightboxOpen) {
      if (!e.target.closest("a")) closePaper();
      return;
    }

    var paper = e.target.closest(".paper");
    if (paper) {
      openPaper(paper);
      return;
    }

    var trigger = e.target.closest(".card--open");
    if (trigger && !current) {
      open(trigger.dataset.open);
      return;
    }

    /* anywhere else, while something is open, puts it back */
    if (current && !e.target.closest("a") && !e.target.closest(".more")) close();
  });

  document.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && !current) {
      var c = e.target.closest && e.target.closest(".card--open");
      if (c) {
        e.preventDefault();
        open(c.dataset.open);
        return;
      }
    }
    if (e.key !== "Escape") return;
    if (lightboxOpen) closePaper();
    else close();
  });

  window.addEventListener("popstate", function () {
    var key = location.hash.slice(1);
    if (panels[key]) open(key, false);
    else close(false);
  });

  Promise.all([contentReady, blocksReady]).then(function () {
    var key = location.hash.slice(1);
    if (panels[key]) open(key, false);
  });

  /* ══ the hand — the asterisk says there is more here; three times, early
        on, a hand says it without anyone having to work it out ═════════ */
  if (!reduced) {
    var HAND_FIRST = 10000; /* long enough to have read the page first */
    var HAND_EVERY = 5000;
    var handsLeft = 3;
    var handTimer = null;

    var laterHand = function (delay) {
      clearTimeout(handTimer);
      handTimer = setTimeout(showHand, delay);
    };

    var showHand = function () {
      handTimer = null;
      if (!handsLeft || everOpened) return;
      /* nobody is watching — keep the three for when they are */
      if (document.hidden) return;

      handsLeft--;
      /* just the first card. One hand is an offer; three at once is a demand */
      var c = $(".card--open");
      if (c) {
        c.classList.remove("is-nudging");
        void c.offsetWidth; /* so the animation restarts rather than continues */
        c.classList.add("is-nudging");
      }
      if (handsLeft) laterHand(HAND_EVERY);
    };

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && handsLeft && !handTimer && !everOpened) laterHand(HAND_EVERY);
    });

    /* counted from when the cards actually exist, not from the first byte */
    contentReady.then(function () {
      laterHand(HAND_FIRST);
    });
  }

  /* ══ easter egg 1 — the portrait grows a scientist ═══════════════ */
  var portrait = document.getElementById("portrait");
  var scientist = document.getElementById("scientist");

  function toggleScientist(on) {
    document.body.classList.toggle("egg-scientist", on);
    if (portrait) portrait.setAttribute("aria-pressed", String(on));
  }

  if (portrait) {
    /* two taps, so a stray finger never summons him. One handler for mouse and
       touch alike — dblclick is unreliable on phones. */
    var lastTap = 0;
    portrait.addEventListener("click", function (e) {
      e.stopPropagation();
      var now = Date.now();
      var isDouble = now - lastTap < 420;
      lastTap = isDouble ? 0 : now;
      if (!isDouble) return;
      /* he is only fetched the first time somebody asks for him */
      if (scientist && !scientist.src) scientist.src = scientist.dataset.src;
      toggleScientist(!document.body.classList.contains("egg-scientist"));
    });
  }
  if (scientist) {
    /* click him anywhere and he goes back where he came from */
    scientist.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleScientist(false);
    });
  }

  /* ══ easter egg 2 — a brick, for anyone who sits still ══════════ */
  var brick = document.getElementById("brick");
  if (brick && !reduced) {
    var DWELL = 4500; /* how long you have to hold still */
    var COOLDOWN = 22000; /* it does not want to be a habit */
    var timer = null;
    var last = 0;
    var stirred = true;

    var flashBrick = function () {
      if (document.hidden) return;
      last = Date.now();
      stirred = false;
      brick.classList.remove("is-flash");
      void brick.offsetWidth;
      brick.classList.add("is-flash");
    };

    var arm = function () {
      clearTimeout(timer);
      if (!stirred) return;
      /* wait out the dwell, and whatever is left of the cooldown */
      timer = setTimeout(flashBrick, Math.max(DWELL, COOLDOWN - (Date.now() - last)));
    };

    var stir = function () {
      stirred = true;
      arm();
    };

    ["mousemove", "pointerdown", "keydown", "wheel", "scroll", "touchstart"].forEach(function (ev) {
      window.addEventListener(ev, stir, { passive: true });
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) clearTimeout(timer);
      else stir();
    });
    brick.addEventListener("animationend", function () {
      brick.classList.remove("is-flash");
    });
    arm();
  }

  /* ══ easter egg 3 — Freud drops in on the algorithms, once ══════ */
  var freud = document.getElementById("freud");
  var freudSpent = false;
  function flashFreud() {
    if (!freud || reduced || freudSpent) return;
    freudSpent = true; /* once per visit */
    setTimeout(function () {
      freud.classList.add("is-flash");
    }, 300);
  }
  if (freud) {
    freud.addEventListener("animationend", function () {
      freud.classList.remove("is-flash");
    });
  }
})();
