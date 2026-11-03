/* BFS menu wall. Presentation only: it reads products from the menu cards the existing code
   renders, and every ordering action is handed back to that code (card click, quantity and
   stepper buttons, cart bar). Cart, Firebase, order submission and counter sync are untouched. */
(function () {
  'use strict';

  var root = document.documentElement;
  var menuContainer = document.getElementById('menuContainer');
  var header = document.querySelector('.page-header');
  var tableBadge = document.getElementById('tableBadge');
  var cartBar = document.getElementById('cartBar');
  var cartCount = document.getElementById('cartCount');
  var itemSheet = document.getElementById('itemSheet');
  var overlay = document.getElementById('overlay');
  if (!menuContainer || !header || !cartBar || !itemSheet) return;

  root.classList.add('bfs-wall');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var PER_WALL = 10;
  var DRINK = /juice|shake|mojito|cold|hot|beverage|drink|tea|coffee|lassi|soda/i;

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function priceNum(text) { var m = String(text).replace(/,/g, '').match(/\d+(\.\d+)?/); return m ? parseFloat(m[0]) : 0; }
  function money(n) { return '\u20B9' + Math.round(n); }

  /* ---------- Wall surface ---------- */
  var grid = document.getElementById('gridScanBackground');
  var texture = el('div', 'bw-texture');
  var light = el('div', 'bw-light');
  texture.setAttribute('aria-hidden', 'true');
  light.setAttribute('aria-hidden', 'true');
  (grid && grid.nextSibling ? grid.parentNode.insertBefore(texture, grid.nextSibling) : document.body.prepend(texture));
  texture.after(light);

  // Spotlight follows the cursor on mouse devices; touch keeps the fixed gentle default.
  var lx = 0, ly = 0, lightQueued = false;
  if (finePointer && !reduceMotion) {
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      lx = e.clientX; ly = e.clientY;
      if (!lightQueued) {
        lightQueued = true;
        requestAnimationFrame(function () {
          lightQueued = false;
          root.style.setProperty('--bw-lx', lx + 'px');
          root.style.setProperty('--bw-ly', ly + 'px');
        });
      }
    }, { passive: true });
  }

  /* ---------- Wall markup ---------- */
  var wall = el('section', 'bw');
  wall.setAttribute('aria-labelledby', 'bwTitle');
  wall.innerHTML =
    '<div class="bw-head">' +
      '<div><p class="bw-kicker bw-mono">Best Fruits Stall \u00B7 Menu</p>' +
      '<h1 class="bw-title bw-display" id="bwTitle">Menu</h1></div>' +
      '<p class="bw-hint bw-mono"><span class="bw-hint-mouse">Point at an item to light it. Click to look closer.</span>' +
      '<span class="bw-hint-touch">Tap an item to look closer.</span></p>' +
    '</div>' +
    '<div class="bw-tools"></div>' +
    '<ul class="bw-grid" aria-live="polite"></ul>' +
    '<nav class="bw-pager" aria-label="Walls">' +
      '<button class="bw-btn" type="button" data-wall="-1" aria-label="Previous wall">\u2190 Prev</button>' +
      '<span class="bw-pager-label bw-mono"></span>' +
      '<button class="bw-btn" type="button" data-wall="1" aria-label="Next wall">Next \u2192</button>' +
    '</nav>';
  var main = document.querySelector('.app-layout');
  main.insertBefore(wall, main.firstChild);
  // Reuse the existing search and category tabs (their listeners move with them).
  var tools = wall.querySelector('.bw-tools');
  var search = document.querySelector('.search-wrap');
  var tabs = document.getElementById('categoryTabs');
  if (search) tools.appendChild(search);
  if (tabs) tools.appendChild(tabs);

  var gridEl = wall.querySelector('.bw-grid');
  var titleEl = wall.querySelector('.bw-title');
  var pagerLabel = wall.querySelector('.bw-pager-label');
  var prevWall = wall.querySelector('[data-wall="-1"]');
  var nextWall = wall.querySelector('[data-wall="1"]');

  /* ---------- Top bar: table + bag ---------- */
  var barRight = el('div', 'bw-bar-right');
  tableBadge.parentNode.insertBefore(barRight, tableBadge);
  barRight.appendChild(tableBadge);
  var bag = el('button', 'bw-bag', '<span class="bw-bag-label">Bag</span><span class="bw-bag-count">0</span>');
  bag.type = 'button';
  bag.setAttribute('aria-label', 'Open bag, 0 items');
  barRight.appendChild(bag);
  var bagCount = bag.querySelector('.bw-bag-count');
  var lastCount = 0;
  function syncBag() {
    var n = parseInt(cartCount.textContent, 10) || 0;
    bagCount.textContent = n;
    bag.setAttribute('aria-label', 'Open bag, ' + n + (n === 1 ? ' item' : ' items'));
    if (n > lastCount && !reduceMotion) { bag.classList.remove('bump'); void bag.offsetWidth; bag.classList.add('bump'); }
    lastCount = n;
  }
  new MutationObserver(syncBag).observe(cartCount, { childList: true, characterData: true, subtree: true });
  syncBag();
  bag.addEventListener('click', function () {
    cartBar.click(); // existing handler renders and opens the cart (it ignores an empty cart)
    if (!(parseInt(cartCount.textContent, 10) > 0)) showNote('Your bag is empty');
  });
  function showNote(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.remove('visible'); void t.offsetWidth; t.classList.add('visible');
  }

  /* ---------- Read products from the rendered menu ---------- */
  function readMenu() {
    var walls = [];
    var group = null;
    Array.prototype.forEach.call(menuContainer.children, function (node) {
      if (node.classList.contains('category-header') || node.classList.contains('search-results-title')) {
        group = { title: node.classList.contains('search-results-title') ? 'Results' : node.textContent.trim(), items: [] };
        walls.push(group);
      } else if (node.classList.contains('menu-grid')) {
        if (!group) { group = { title: 'Menu', items: [] }; walls.push(group); }
        node.querySelectorAll('.item-card').forEach(function (card) {
          var img = card.querySelector('.item-img');
          var badge = card.querySelector('.item-badge');
          group.items.push({
            name: card.querySelector('.item-name').textContent.trim(),
            price: card.querySelector('.item-price').textContent.trim(),
            cat: badge ? badge.textContent.trim() : group.title,
            img: img ? img.getAttribute('src') : '',
            out: card.classList.contains('out-of-stock')
          });
        });
      }
    });
    // Split long categories into walls of ten.
    var out = [];
    walls.forEach(function (w) {
      if (!w.items.length) return;
      var pages = Math.ceil(w.items.length / PER_WALL);
      for (var p = 0; p < pages; p++) {
        out.push({ title: w.title, part: pages > 1 ? (p + 1) + ' of ' + pages : '', items: w.items.slice(p * PER_WALL, (p + 1) * PER_WALL) });
      }
    });
    return out;
  }

  function findCard(name) {
    return Array.prototype.find.call(menuContainer.querySelectorAll('.item-card'), function (c) {
      return c.querySelector('.item-name').textContent.trim() === name;
    });
  }

  /* ---------- Accent colour from each image (cached, computed off the hot path) ---------- */
  var accents = {};
  var sampler = document.createElement('canvas');
  sampler.width = sampler.height = 24;
  var sctx = sampler.getContext('2d', { willReadFrequently: true });
  function accentFor(img, done) {
    var key = img.currentSrc || img.src;
    if (accents[key]) return done(accents[key]);
    try {
      sctx.drawImage(img, 0, 0, 24, 24);
      var d = sctx.getImageData(0, 0, 24, 24).data;
      var best = null, bestScore = 0, r = 0, g = 0, b = 0, n = 0;
      for (var i = 0; i < d.length; i += 4) {
        var mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
        var sat = mx ? (mx - mn) / mx : 0;
        if (sat > 0.35 && mx > 70) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
        if (sat * mx > bestScore) { bestScore = sat * mx; best = [d[i], d[i + 1], d[i + 2]]; }
      }
      var c = n > 8 ? [r / n, g / n, b / n] : best;
      accents[key] = c ? 'rgb(' + c.map(Math.round).join(',') + ')' : '';
    } catch (e) { accents[key] = ''; }
    done(accents[key]);
  }
  function applyAccent(node, img) {
    function run() { accentFor(img, function (c) { if (c) node.style.setProperty('--accent', c); }); }
    if (img.complete && img.naturalWidth) run(); else img.addEventListener('load', run, { once: true });
  }

  /* ---------- Render a wall ---------- */
  var walls = [];
  var wallIndex = 0;
  var renderedKey = '';

  function renderWall(animate) {
    var w = walls[wallIndex];
    gridEl.innerHTML = '';
    if (!w) {
      titleEl.textContent = 'Menu';
      pagerLabel.textContent = '';
      prevWall.disabled = nextWall.disabled = true;
      gridEl.appendChild(el('li', 'bw-empty bw-mono', menuContainer.querySelector('.spinner') ? 'Loading the menu' : 'No items match your search'));
      return;
    }
    titleEl.textContent = w.title;
    pagerLabel.textContent = 'Wall ' + (wallIndex + 1) + ' / ' + walls.length + (w.part ? ' \u00B7 ' + w.part : '');
    prevWall.disabled = wallIndex === 0;
    nextWall.disabled = wallIndex === walls.length - 1;
    w.items.forEach(function (item, i) {
      var li = el('li');
      var btn = el('button', 'bw-item' + (item.out ? ' is-out' : ''));
      btn.type = 'button';
      btn.style.setProperty('--i', i);
      btn.setAttribute('aria-label', item.name + ', ' + item.price + (item.out ? ', out of stock' : ''));
      if (item.out) btn.setAttribute('aria-disabled', 'true');
      btn.innerHTML =
        '<span class="bw-media"></span><span class="bw-shelf" aria-hidden="true"></span>' +
        '<span class="bw-meta bw-mono"><span class="bw-name"></span><span class="bw-price"></span></span>';
      btn.querySelector('.bw-name').textContent = item.name;
      btn.querySelector('.bw-price').textContent = item.price;
      if (item.img) {
        var img = new Image();
        img.src = item.img;
        img.alt = '';
        img.decoding = 'async';
        if (i > 4) img.loading = 'lazy';
        btn.querySelector('.bw-media').appendChild(img);
        applyAccent(btn, img);
      }
      if (item.out) btn.appendChild(el('span', 'bw-out bw-mono', 'Out of stock'));
      btn.addEventListener('click', function () {
        if (item.out) { showNote(item.name + ' is out of stock'); return; }
        openFocus(i, btn);
      });
      li.appendChild(btn);
      gridEl.appendChild(li);
    });
    if (animate && !reduceMotion) {
      gridEl.classList.remove('is-entering'); void gridEl.offsetWidth; gridEl.classList.add('is-entering');
    }
    preloadWall(w);
  }

  // Warm every image on this wall and the next so the focus view and paging never flash.
  function preloadWall(w) {
    var next = walls[wallIndex + 1];
    var list = w.items.concat(next ? next.items : []);
    var go = function () { list.forEach(function (it) { if (it.img) { var p = new Image(); p.decoding = 'async'; p.src = it.img; } }); };
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 2000 }); else setTimeout(go, 400);
  }

  function refresh() {
    var fresh = readMenu();
    var key = JSON.stringify(fresh);
    if (key === renderedKey) return;
    var sameTitles = walls.length && fresh.length && walls.map(function (w) { return w.title; }).join() === fresh.map(function (w) { return w.title; }).join();
    renderedKey = key;
    walls = fresh;
    // Stock updates keep the customer on the same wall; a new category or search starts over.
    if (!sameTitles) wallIndex = 0;
    wallIndex = Math.min(wallIndex, Math.max(0, walls.length - 1));
    renderWall(!sameTitles);
    if (focusOpen) refreshFocus();
  }
  // MutationObserver already batches each buildMenu() into one callback; no frame timing needed.
  new MutationObserver(refresh).observe(menuContainer, { childList: true, subtree: true });

  function goWall(d) {
    var n = wallIndex + d;
    if (n < 0 || n >= walls.length) return;
    wallIndex = n;
    renderWall(true);
    wall.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }
  prevWall.addEventListener('click', function () { goWall(-1); });
  nextWall.addEventListener('click', function () { goWall(1); });

  /* ---------- Hover state and the View cursor chip ---------- */
  var chip = el('div', 'bw-chip', 'View');
  chip.setAttribute('aria-hidden', 'true');
  document.body.appendChild(chip);
  if (finePointer) {
    var cx = 0, cy = 0, chipQueued = false;
    gridEl.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var item = e.target.closest('.bw-item');
      var on = !!item && !item.classList.contains('is-out');
      gridEl.classList.toggle('is-pointing', !!item);
      chip.classList.toggle('is-on', on);
      cx = e.clientX; cy = e.clientY;
      if (!chipQueued) {
        chipQueued = true;
        requestAnimationFrame(function () { chipQueued = false; chip.style.transform = 'translate3d(' + cx + 'px,' + cy + 'px,0)'; });
      }
    }, { passive: true });
    gridEl.addEventListener('pointerleave', function () {
      gridEl.classList.remove('is-pointing');
      chip.classList.remove('is-on');
    });
  }

  /* ---------- Focus view ---------- */
  var focus = el('div', 'bw-focus');
  focus.setAttribute('role', 'dialog');
  focus.setAttribute('aria-modal', 'true');
  focus.setAttribute('aria-labelledby', 'bwFocusName');
  focus.innerHTML =
    '<div class="bw-focus-top">' +
      '<div><div class="bw-focus-count bw-mono"></div>' +
      '<h2 class="bw-focus-name bw-display" id="bwFocusName"></h2>' +
      '<div class="bw-focus-cat bw-mono"></div></div>' +
      '<div class="bw-focus-hint bw-mono">Click anywhere around the item to put it back</div>' +
      '<button class="bw-btn bw-focus-back" type="button">\u2190 Back to the wall</button>' +
    '</div>' +
    '<div class="bw-focus-stage"><div class="bw-focus-stage-inner">' +
      '<div class="bw-focus-product"></div><div class="bw-focus-platform" aria-hidden="true"></div>' +
    '</div></div>' +
    '<div class="bw-panel">' +
      '<div class="bw-panel-info">' +
        '<div class="bw-panel-label bw-mono">Price per item</div>' +
        '<div class="bw-panel-price bw-display"></div>' +
        '<p class="bw-panel-desc"></p>' +
      '</div>' +
      '<div class="bw-qty-big" role="group" aria-label="Quantity">' +
        '<button type="button" data-q="-1" aria-label="Decrease quantity">\u2212</button>' +
        '<output aria-live="polite">1</output>' +
        '<button type="button" data-q="1" aria-label="Increase quantity">+</button>' +
      '</div>' +
      '<div class="bw-panel-cta">' +
        '<button class="bw-add" type="button"></button>' +
        '<div class="bw-note bw-mono">Served at your table \u00B7 Pay at the counter</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(focus);

  var fCount = focus.querySelector('.bw-focus-count');
  var fName = focus.querySelector('.bw-focus-name');
  var fCat = focus.querySelector('.bw-focus-cat');
  var fProduct = focus.querySelector('.bw-focus-product');
  var fStage = focus.querySelector('.bw-focus-stage');
  var fPrice = focus.querySelector('.bw-panel-price');
  var fDesc = focus.querySelector('.bw-panel-desc');
  var fQty = focus.querySelector('output');
  var fAdd = focus.querySelector('.bw-add');
  var fBack = focus.querySelector('.bw-focus-back');
  var focusOpen = false;
  var focusItem = null;
  var focusIdx = 0;
  var focusQty = 1;
  var returnTo = null;

  function setQty(n) {
    focusQty = Math.max(1, Math.min(20, n));
    fQty.textContent = focusQty;
    var each = priceNum(focusItem ? focusItem.price : 0);
    fAdd.textContent = 'Add to bag \u00B7 ' + money(each * focusQty);
  }

  function fillFocus() {
    var w = walls[wallIndex];
    fCount.textContent = pad(focusIdx + 1) + ' / ' + pad(w.items.length);
    fName.textContent = focusItem.name;
    fCat.textContent = focusItem.cat;
    fPrice.textContent = focusItem.price;
    var drink = DRINK.test(focusItem.cat);
    fDesc.textContent = drink
      ? 'Prepared fresh for your table. You choose ice and sugar on the next step.'
      : 'Prepared fresh for your table. Add a note for the kitchen on the next step if you need one.';
    fProduct.innerHTML = '';
    if (focusItem.img) {
      var img = new Image();
      img.src = focusItem.img;
      img.alt = focusItem.name;
      fProduct.appendChild(img);
      applyAccent(focus, img);
    }
    fAdd.disabled = focusItem.out;
    setQty(1);
    if (focusItem.out) fAdd.textContent = 'Out of stock';
  }

  function openFocus(i, from) {
    focusIdx = i;
    focusItem = walls[wallIndex].items[i];
    returnTo = from || null;
    focus.style.removeProperty('--accent');
    var src = from && from.style.getPropertyValue('--accent');
    if (src) focus.style.setProperty('--accent', src);
    fillFocus();
    focusOpen = true;
    root.classList.add('bfs-focus-open');
    focus.classList.add('is-open');
    chip.classList.remove('is-on');
    fAdd.focus({ preventScroll: true });
  }

  function closeFocus(restore) {
    if (!focusOpen) return;
    focusOpen = false;
    focus.classList.remove('is-open');
    root.classList.remove('bfs-focus-open');
    if (restore !== false && returnTo && returnTo.isConnected) returnTo.focus({ preventScroll: true });
  }

  // Stock can change while the focus view is open (Firebase menuStock).
  function refreshFocus() {
    var w = walls[wallIndex];
    var match = w && w.items.filter(function (it) { return it.name === focusItem.name; })[0];
    if (!match) { closeFocus(); return; }
    focusIdx = w.items.indexOf(match);
    focusItem = match;
    fAdd.disabled = match.out;
    if (match.out) fAdd.textContent = 'Out of stock'; else setQty(focusQty);
  }

  focus.querySelector('.bw-qty-big').addEventListener('click', function (e) {
    var b = e.target.closest('[data-q]');
    if (b) setQty(focusQty + parseInt(b.getAttribute('data-q'), 10));
  });
  fBack.addEventListener('click', function () { closeFocus(); });
  // Clicking the empty space around the product puts it back.
  focus.addEventListener('click', function (e) {
    if (e.target === focus || e.target === fStage || e.target.classList.contains('bw-focus-stage-inner') || e.target.classList.contains('bw-focus-top')) closeFocus();
  });

  /* Add to bag: drive the existing customize sheet so cart lines, ice and sugar rules,
     notes, toast and stock checks all come from the original code. */
  function click(id) { var b = document.getElementById(id); if (b) b.click(); }
  fAdd.addEventListener('click', function () {
    if (!focusItem || focusItem.out) return;
    var card = findCard(focusItem.name);
    if (!card) { showNote('This item is no longer available'); return; }
    var qty = focusQty;
    closeFocus(false);
    card.click(); // openItemSheet: resets qty to 1 and picks the right steps
    if (!itemSheet.classList.contains('active')) return; // out of stock: the original toast explains
    for (var i = 1; i < qty; i++) click('qtyPlus');
    // The original code decides whether this item needs ice and sugar. If it does, the sheet
    // stays open on that step (quantity already set); otherwise quantity then review are
    // confirmed, adding the line exactly as a manual order would.
    if (!document.querySelector('#stepPaneOptions.active')) {
      click('stepperNextBtn');
      click('stepperNextBtn');
    }
  });

  /* ---------- Keyboard ---------- */
  document.addEventListener('keydown', function (e) {
    if (!focusOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); closeFocus(); return; }
    if (e.key === 'Tab') {
      var f = Array.prototype.filter.call(focus.querySelectorAll('button'), function (b) { return !b.disabled; });
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  // If the cart or a sheet opens over the wall, the focus view steps aside.
  if (overlay) new MutationObserver(function () { if (overlay.classList.contains('active')) closeFocus(false); })
    .observe(overlay, { attributes: true, attributeFilter: ['class'] });

  refresh();
})();
