/* BFS 3D motion layer. Purely additive: it never touches ordering logic, Firebase,
   or the menu data. Everything degrades to the original static page when WebGL,
   motion, or device capacity is limited. */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var conn = navigator.connection || {};
  var lowEnd = conn.saveData === true ||
    (navigator.deviceMemory && navigator.deviceMemory <= 2) ||
    (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeOut(t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 4); }

  /* ---------- Scroll progress through the hero (rAF throttled) ---------- */
  var hero = document.querySelector('.hero');
  var heroInner = hero && hero.querySelector('.hero-inner');
  var scrollP = 0;
  var scrollQueued = false;

  function readScroll() {
    scrollQueued = false;
    if (!hero) return;
    var r = hero.getBoundingClientRect();
    scrollP = clamp(-r.top / Math.max(r.height, 1), 0, 1);
    // Copy drifts back into depth as the hero leaves; at rest it is untouched.
    if (heroInner && !reduceMotion) {
      heroInner.style.transform = scrollP > 0
        ? 'perspective(900px) translate3d(0,' + (scrollP * 70).toFixed(1) + 'px,' + (-scrollP * 120).toFixed(1) + 'px)'
        : '';
      heroInner.style.opacity = scrollP > 0 ? (1 - scrollP * 0.7).toFixed(3) : '';
    }
  }
  window.addEventListener('scroll', function () {
    if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(readScroll); }
  }, { passive: true });

  /* ---------- Menu cards: scroll reveal ---------- */
  var menuContainer = document.getElementById('menuContainer');
  var revealed = new Set(); // keeps cards steady when the menu re-renders for stock updates
  var batch = 0;
  var batchTimer = null;

  function keyFor(el) {
    var name = el.querySelector('.item-name');
    return (name ? name.textContent : el.textContent).trim();
  }

  var revealIO = !reduceMotion && 'IntersectionObserver' in window
    ? new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        el.style.setProperty('--m3d-delay', Math.min(batch * 60, 400) + 'ms');
        batch++;
        el.classList.add('is-in');
        // Once revealed, hand the card back to its original transitions so press feedback stays instant.
        setTimeout(function () {
          el.classList.add('m3d-settled');
          el.classList.remove('m3d-reveal', 'is-in');
          el.style.removeProperty('--m3d-delay');
        }, 1300);
        revealed.add(keyFor(el));
        revealIO.unobserve(el);
      });
      clearTimeout(batchTimer);
      batchTimer = setTimeout(function () { batch = 0; }, 120);
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 })
    : null;

  function prepareReveals() {
    if (!revealIO || !menuContainer) return;
    menuContainer.querySelectorAll('.item-card, .category-header').forEach(function (el) {
      if (el.classList.contains('m3d-reveal') || el.classList.contains('m3d-settled')) return;
      if (revealed.has(keyFor(el))) { el.classList.add('m3d-settled'); return; }
      el.classList.add('m3d-reveal');
      revealIO.observe(el);
    });
  }

  if (menuContainer && revealIO) {
    prepareReveals();
    new MutationObserver(prepareReveals).observe(menuContainer, { childList: true, subtree: true });
    // A deliberate change of category or search replays the reveal.
    var tabs = document.getElementById('categoryTabs');
    var search = document.getElementById('searchInput');
    if (tabs) tabs.addEventListener('click', function () { revealed.clear(); }, true);
    if (search) search.addEventListener('input', function () { revealed.clear(); }, true);
  }

  /* ---------- Product cards: 3D tilt + image parallax (fine pointers only) ---------- */
  if (finePointer && !reduceMotion && menuContainer) {
    root.classList.add('m3d-fine');
    var tiltCard = null;
    var tiltEvt = null;
    var tiltQueued = false;

    function applyTilt() {
      tiltQueued = false;
      if (!tiltCard || !tiltEvt) return;
      var r = tiltCard.getBoundingClientRect();
      var px = clamp((tiltEvt.clientX - r.left) / r.width, 0, 1) - 0.5;
      var py = clamp((tiltEvt.clientY - r.top) / r.height, 0, 1) - 0.5;
      var s = tiltCard.style;
      s.setProperty('--m3d-rx', (-py * 10).toFixed(2) + 'deg');
      s.setProperty('--m3d-ry', (px * 12).toFixed(2) + 'deg');
      s.setProperty('--m3d-shx', (-px * 18).toFixed(1) + 'px');
      s.setProperty('--m3d-shy', (14 - py * 10).toFixed(1) + 'px');
      s.setProperty('--m3d-ix', (-px * 8).toFixed(1) + 'px');
      s.setProperty('--m3d-iy', (-py * 6).toFixed(1) + 'px');
      s.setProperty('--m3d-gx', ((px + 0.5) * 100).toFixed(1) + '%');
      s.setProperty('--m3d-gy', ((py + 0.5) * 100).toFixed(1) + '%');
    }

    function resetTilt(card) {
      ['--m3d-rx', '--m3d-ry', '--m3d-shx', '--m3d-shy', '--m3d-ix', '--m3d-iy'].forEach(function (p) {
        card.style.removeProperty(p);
      });
    }

    menuContainer.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var card = e.target.closest('.item-card');
      if (card && card.classList.contains('out-of-stock')) card = null;
      if (card !== tiltCard && tiltCard) resetTilt(tiltCard);
      tiltCard = card;
      tiltEvt = e;
      if (card && !tiltQueued) { tiltQueued = true; requestAnimationFrame(applyTilt); }
    }, { passive: true });

    menuContainer.addEventListener('pointerleave', function () {
      if (tiltCard) resetTilt(tiltCard);
      tiltCard = null;
    });
  }

  /* ---------- Hero: cinematic floating fruit scene (Three.js r128, already loaded) ---------- */
  function webglAvailable() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  function canvasTexture(size, draw) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    var t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }

  // Citrus peel dimples, used as a bump map.
  function dimpleTexture() {
    return canvasTexture(256, function (g, s) {
      g.fillStyle = '#808080';
      g.fillRect(0, 0, s, s);
      for (var i = 0; i < 2600; i++) {
        var v = 90 + Math.random() * 70 | 0;
        g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
        g.beginPath();
        g.arc(Math.random() * s, Math.random() * s, 0.8 + Math.random() * 1.8, 0, Math.PI * 2);
        g.fill();
      }
    });
  }

  // Shape based geometry uses its x/y (-1..1) as UVs, so map that range onto the texture.
  function fitShapeUV(t) {
    t.repeat.set(0.5, 0.5);
    t.offset.set(0.5, 0.5);
    return t;
  }

  // Watermelon cross section: rind, pale band, juicy flesh and black seeds.
  function watermelonTexture() {
    return fitShapeUV(canvasTexture(256, function (g, s) {
      var c = s / 2;
      g.fillStyle = '#2f6b2a'; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#7fb24a'; g.beginPath(); g.arc(c, c, c * 0.95, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#e9f0c8'; g.beginPath(); g.arc(c, c, c * 0.9, 0, Math.PI * 2); g.fill();
      var grad = g.createRadialGradient(c, c, 0, c, c, c * 0.86);
      grad.addColorStop(0, '#ff5d6c');
      grad.addColorStop(1, '#e2303f');
      g.fillStyle = grad; g.beginPath(); g.arc(c, c, c * 0.86, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1a1310';
      for (var i = 0; i < 46; i++) {
        var a = Math.random() * Math.PI * 2;
        var r = c * (0.42 + Math.random() * 0.24);
        g.save();
        g.translate(c + Math.cos(a) * r, c + Math.sin(a) * r);
        g.rotate(a + Math.PI / 2);
        g.beginPath(); g.ellipse(0, 0, 2.6, 5, 0, 0, Math.PI * 2); g.fill();
        g.restore();
      }
    }));
  }

  // Dragon fruit flesh: white with fine black seeds and a magenta rim.
  function dragonFaceTexture() {
    return canvasTexture(256, function (g, s) {
      var c = s / 2;
      g.fillStyle = '#d61f69'; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f6f1ee'; g.beginPath(); g.arc(c, c, c * 0.93, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#16110f';
      for (var i = 0; i < 700; i++) {
        var a = Math.random() * Math.PI * 2;
        var r = Math.sqrt(Math.random()) * c * 0.86;
        g.beginPath(); g.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 1.1 + Math.random() * 0.8, 0, Math.PI * 2); g.fill();
      }
    });
  }

  // Avocado outline: t=0 is the wide base, t=1 the narrow neck. Returns [halfWidth, y].
  function avocadoProfile(t) {
    return [Math.pow(Math.sin(t * Math.PI), 0.85) * (0.78 - 0.33 * t), -1 + t * 2.1];
  }
  var AVO_PIT_Y = -0.16;

  // Avocado cut face: dark skin edge, green rim fading into creamy yellow flesh.
  function avocadoFaceTexture() {
    return fitShapeUV(canvasTexture(256, function (g, s) {
      function outline(scale) {
        g.beginPath();
        for (var i = 0; i <= 40; i++) {
          var p = avocadoProfile(i / 40);
          var px = (p[0] * scale + 1) / 2 * s;
          var py = (1 - (p[1] * scale + (1 - scale) * AVO_PIT_Y)) / 2 * s;
          if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        for (var j = 40; j >= 0; j--) {
          var q = avocadoProfile(j / 40);
          g.lineTo((-q[0] * scale + 1) / 2 * s, (1 - (q[1] * scale + (1 - scale) * AVO_PIT_Y)) / 2 * s);
        }
        g.closePath();
      }
      g.fillStyle = '#2f4a1e'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#8fb33a'; outline(0.95); g.fill();
      var cy = (1 - AVO_PIT_Y) / 2 * s;
      var grad = g.createRadialGradient(s / 2, cy, s * 0.05, s / 2, cy, s * 0.42);
      grad.addColorStop(0, '#f2ec9c');
      grad.addColorStop(1, '#bcd24e');
      g.fillStyle = grad; outline(0.86); g.fill();
    }));
  }

  // Small studio environment so fruit picks up soft warm reflections in the theme's gold.
  function studioEnv(renderer) {
    var tex = canvasTexture(256, function (g, s) {
      var grad = g.createLinearGradient(0, 0, 0, s);
      grad.addColorStop(0, '#f3d39a');
      grad.addColorStop(0.35, '#3a2a1a');
      grad.addColorStop(1, '#050505');
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
      g.fillStyle = 'rgba(255,240,215,0.9)'; // softbox
      g.fillRect(s * 0.15, s * 0.08, s * 0.25, s * 0.12);
    });
    tex.mapping = THREE.EquirectangularReflectionMapping;
    var pmrem = new THREE.PMREMGenerator(renderer);
    var env = pmrem.fromEquirectangular(tex).texture;
    tex.dispose();
    pmrem.dispose();
    return env;
  }

  function std(color, roughness, extra) {
    var o = { color: color, roughness: roughness };
    for (var k in extra) o[k] = extra[k];
    return new THREE.MeshStandardMaterial(o);
  }
  function glossy(color, roughness, extra) {
    var o = { color: color, roughness: roughness, clearcoat: 1, clearcoatRoughness: 0.2 };
    for (var k in extra) o[k] = extra[k];
    return new THREE.MeshPhysicalMaterial(o);
  }
  function add(group, geo, mat, x, y, z) {
    var m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    group.add(m);
    return m;
  }
  // A ring of parts around the Y axis (crowns, leaves, scales).
  function ring(group, n, make) {
    for (var i = 0; i < n; i++) {
      var pivot = new THREE.Group();
      pivot.rotation.y = (i / n) * Math.PI * 2;
      pivot.add(make(i));
      group.add(pivot);
    }
  }

  var BUILDERS = {
    watermelon: function (g, tex) {
      var shape = new THREE.Shape();
      shape.absarc(0, 0, 1, 0, Math.PI, false);
      shape.lineTo(1, 0);
      var geo = new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 2, curveSegments: 40 });
      geo.translate(0, -0.4, -0.09);
      add(g, geo, [glossy(0xffffff, 0.2, { map: tex.watermelon, envMapIntensity: 1.1 }), std(0x2f6b2a, 0.5)]);
    },
    pomegranate: function (g, tex) {
      var skin = glossy(0x9c1c2b, 0.35, { clearcoat: 0.6, bumpMap: tex.dimple, bumpScale: 0.008 });
      add(g, new THREE.SphereGeometry(1, 40, 28), skin).scale.set(1, 0.92, 1);
      add(g, new THREE.CylinderGeometry(0.2, 0.26, 0.2, 14), skin, 0, 0.92, 0);
      ring(g, 6, function () {
        var c = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 5), skin);
        c.position.set(0.15, 1.1, 0);
        c.rotation.z = -0.55;
        return c;
      });
    },
    aril: function (g) {
      add(g, new THREE.SphereGeometry(1, 16, 12), glossy(0xd3132f, 0.06, { emissive: 0x3a0008, envMapIntensity: 1.4 })).scale.set(0.8, 1.15, 0.8);
    },
    dragonfruit: function (g) {
      add(g, new THREE.SphereGeometry(1, 40, 28), glossy(0xd61f69, 0.35, { clearcoat: 0.5 })).scale.set(0.85, 1.05, 0.85);
      var bract = std(0x9cbf3b, 0.45, { side: THREE.DoubleSide });
      [0.55, 1.05, 1.55, 2.05, 2.5].forEach(function (theta, row) {
        ring(g, 5, function (i) {
          var c = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.62, 3), bract);
          var p = new THREE.Group();
          p.rotation.y = (row % 2) * 0.63 + i * 0.02;
          c.position.set(Math.sin(theta) * 0.86, Math.cos(theta) * 1.04, 0);
          c.rotation.z = 0.5 - theta * 0.7;
          c.scale.set(0.3, 1, 1);
          p.add(c);
          return p;
        });
      });
    },
    dragonHalf: function (g, tex) {
      var half = new THREE.Group();
      add(half, new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), glossy(0xd61f69, 0.35, { clearcoat: 0.5 }));
      add(half, new THREE.CircleGeometry(1, 48), glossy(0xffffff, 0.15, { map: tex.dragonFace, envMapIntensity: 1.1 })).rotation.x = Math.PI / 2;
      half.rotation.x = -Math.PI / 2; // cut face toward the camera
      g.add(half);
    },
    avocado: function (g, tex) {
      var shape = new THREE.Shape();
      for (var i = 0; i <= 40; i++) {
        var p = avocadoProfile(i / 40);
        if (i === 0) shape.moveTo(p[0], p[1]); else shape.lineTo(p[0], p[1]);
      }
      for (var j = 39; j > 0; j--) {
        var q = avocadoProfile(j / 40);
        shape.lineTo(-q[0], q[1]);
      }
      var skin = std(0x2f4a1e, 0.75);
      var body = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.1, bevelSegments: 5, curveSegments: 24 });
      add(g, body, [glossy(0xffffff, 0.3, { map: tex.avocado, clearcoat: 0.4 }), skin], 0, 0, -0.1);
      // Pit sits proud of the front cut face (front cap is at z = depth + bevel - 0.1 = 0.4).
      add(g, new THREE.SphereGeometry(0.32, 28, 20), glossy(0x7a4a26, 0.4), 0, AVO_PIT_Y, 0.4);
    },
    fries: function (g) {
      var carton = add(g, new THREE.CylinderGeometry(0.62, 0.45, 0.9, 4, 1, true), std(0xb8322a, 0.55, { side: THREE.DoubleSide }));
      carton.rotation.y = Math.PI / 4;
      var fry = std(0xe9b54a, 0.55);
      for (var i = 0; i < 11; i++) {
        var f = add(g, new THREE.BoxGeometry(0.11, 1.05, 0.11), fry, (Math.random() - 0.5) * 0.55, 0.45 + Math.random() * 0.25, (Math.random() - 0.5) * 0.55);
        f.rotation.set((Math.random() - 0.5) * 0.35, Math.random(), (Math.random() - 0.5) * 0.35);
      }
    },
    fry: function (g) {
      add(g, new THREE.BoxGeometry(0.14, 1.1, 0.14), std(0xe9b54a, 0.55));
    },
    burger: function (g) {
      var bun = glossy(0xc9813a, 0.45, { clearcoat: 0.5 });
      add(g, new THREE.SphereGeometry(1, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2), bun).scale.set(1, 0.6, 1);
      add(g, new THREE.CylinderGeometry(1.1, 1.08, 0.06, 28), std(0x6aa338, 0.6), 0, -0.04, 0);
      add(g, new THREE.BoxGeometry(1.6, 0.05, 1.6), std(0xf2b630, 0.4), 0, -0.1, 0).rotation.y = Math.PI / 4;
      add(g, new THREE.CylinderGeometry(1.02, 1.02, 0.25, 32), std(0x5a3220, 0.85), 0, -0.25, 0);
      add(g, new THREE.CylinderGeometry(1, 0.94, 0.3, 32), bun, 0, -0.53, 0);
      var seed = std(0xf3e6c8, 0.5);
      for (var i = 0; i < 16; i++) {
        var th = 0.2 + Math.random() * 0.9;
        var ph = Math.random() * Math.PI * 2;
        var s = add(g, new THREE.SphereGeometry(0.05, 8, 6), seed, Math.sin(th) * Math.cos(ph), Math.cos(th) * 0.6, Math.sin(th) * Math.sin(ph));
        s.scale.set(1, 0.5, 1.8);
        s.rotation.y = ph;
      }
    },
    puff: function (g) {
      [0xcf8d34, 0xe6b05a, 0xd99a3e].forEach(function (c, i) {
        var layer = add(g, new THREE.BoxGeometry(1.3 - i * 0.04, 0.13, 0.9 - i * 0.03), std(c, 0.6), (i - 1) * 0.03, (i - 1) * 0.13, 0);
        layer.rotation.y = (i - 1) * 0.04;
      });
    }
  };

  function buildFruit(kind, tex) {
    var group = new THREE.Group();
    BUILDERS[kind](group, tex);
    return group;
  }

  // nx/ny are viewport-relative (-1..1), z is depth, s is scale. Desktop and mobile layouts
  // keep the fruit in the margins and behind the copy so text always stays readable.
  // The hero logo occupies the right side on desktop, so the right edge stays light.
  var LAYOUT_WIDE = [
    { k: 'watermelon', nx: -0.8, ny: 0.4, z: -1, s: 1.1 },
    { k: 'pomegranate', nx: -0.5, ny: -0.58, z: 1.2, s: 0.62 },
    { k: 'dragonfruit', nx: 0.14, ny: 0.8, z: -3, s: 0.72 },
    { k: 'avocado', nx: 0.4, ny: -0.74, z: 0.4, s: 0.7 },
    { k: 'burger', nx: -0.22, ny: -0.88, z: -4, s: 0.85 },
    { k: 'fries', nx: -0.93, ny: -0.12, z: 2.2, s: 0.6 },
    { k: 'dragonHalf', nx: -0.4, ny: 0.76, z: 1, s: 0.5 },
    { k: 'puff', nx: 0.52, ny: 0.58, z: -2, s: 0.55 },
    { k: 'aril', nx: -0.66, ny: 0.05, z: 3, s: 0.1 },
    { k: 'aril', nx: 0.24, ny: -0.42, z: 2.6, s: 0.08 },
    { k: 'fry', nx: 0.3, ny: 0.4, z: 2, s: 0.4 },
    { k: 'watermelon', nx: 0.06, ny: 0.1, z: -7, s: 1 }
  ];
  var LAYOUT_NARROW = [
    { k: 'watermelon', nx: -0.95, ny: 0.5, z: -1, s: 0.85 },
    { k: 'dragonHalf', nx: 0.92, ny: 0.22, z: 0.5, s: 0.5 },
    { k: 'pomegranate', nx: -0.85, ny: -0.62, z: 1, s: 0.45 },
    { k: 'avocado', nx: 0.82, ny: -0.72, z: 1.2, s: 0.5 },
    { k: 'fries', nx: -0.72, ny: 0.02, z: 2, s: 0.42 },
    { k: 'aril', nx: 0.6, ny: -0.2, z: 2.8, s: 0.08 },
    { k: 'burger', nx: 0.1, ny: 0.05, z: -7, s: 0.85 }
  ];

  function initHeroScene() {
    if (!hero || !window.THREE || reduceMotion || lowEnd || !webglAvailable()) return;

    var canvas = document.createElement('canvas');
    canvas.className = 'hero-3d';
    canvas.setAttribute('aria-hidden', 'true');
    hero.insertBefore(canvas, hero.firstChild);

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch (e) { canvas.remove(); return; }

    var mobile = window.matchMedia('(max-width: 680px)').matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    var scene = new THREE.Scene();
    scene.environment = studioEnv(renderer);
    scene.fog = new THREE.Fog(0x050505, 12, 24); // far fruit sinks into the existing dark backdrop

    var camera = new THREE.PerspectiveCamera(35, 1, 0.1, 60);
    var CAM_Z = 12;

    // Warm key, gold rim and a cool fill: realistic shading that stays in the theme's palette.
    scene.add(new THREE.HemisphereLight(0xf7efe2, 0x0d0b09, 0.35));
    var key = new THREE.DirectionalLight(0xfff1dc, 2.2);
    key.position.set(-5, 6, 8);
    scene.add(key);
    var rim = new THREE.DirectionalLight(0xd9a441, 2.4);
    rim.position.set(6, 2, -6);
    scene.add(rim);
    var fill = new THREE.PointLight(0xc96f4a, 1.2, 30);
    fill.position.set(4, -4, 6);
    scene.add(fill);

    var tex = {
      dimple: dimpleTexture(),
      watermelon: watermelonTexture(),
      dragonFace: dragonFaceTexture(),
      avocado: avocadoFaceTexture()
    };
    [tex.watermelon, tex.dragonFace, tex.avocado].forEach(function (t) { t.encoding = THREE.sRGBEncoding; });

    var layout = mobile ? LAYOUT_NARROW : LAYOUT_WIDE;
    var fruits = layout.map(function (spec, i) {
      var obj = buildFruit(spec.k, tex);
      obj.scale.setScalar(spec.s);
      obj.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      scene.add(obj);
      return {
        obj: obj, spec: spec,
        phase: Math.random() * Math.PI * 2,
        spin: new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.2),
        delay: 0.12 * i,
        base: new THREE.Vector3()
      };
    });

    function layoutFruit() {
      var w = hero.clientWidth;
      var h = hero.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      var tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      fruits.forEach(function (f) {
        var viewH = 2 * tanHalf * (CAM_Z - f.spec.z);
        var viewW = viewH * camera.aspect;
        f.base.set(f.spec.nx * viewW * 0.46, f.spec.ny * viewH * 0.44, f.spec.z);
      });
    }
    layoutFruit();
    var resizeQueued = false;
    window.addEventListener('resize', function () {
      if (resizeQueued) return;
      resizeQueued = true;
      requestAnimationFrame(function () { resizeQueued = false; layoutFruit(); });
    });

    // Cursor (or device tilt) parallax target, smoothed every frame.
    var pointer = { x: 0, y: 0, sx: 0, sy: 0 };
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });

    // Only render while the hero is visible, the tab is active and no sheet is covering it.
    var visible = true;
    var overlay = document.getElementById('overlay');
    var confirmScreen = document.getElementById('confirmScreen');
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; wake(); }).observe(hero);
    }
    document.addEventListener('visibilitychange', wake);
    function blocked() {
      return document.hidden || !visible ||
        (overlay && overlay.classList.contains('active')) ||
        (confirmScreen && !confirmScreen.classList.contains('hidden'));
    }
    var sheetWatch = new MutationObserver(wake);
    if (overlay) sheetWatch.observe(overlay, { attributes: true, attributeFilter: ['class'] });
    if (confirmScreen) sheetWatch.observe(confirmScreen, { attributes: true, attributeFilter: ['class'] });

    var running = false;
    var start = performance.now();
    var last = start;
    var slowFrames = 0;

    function wake() {
      if (!running && !blocked()) {
        running = true;
        last = performance.now();
        requestAnimationFrame(frame);
      }
    }

    // The deep center slice is the object the camera dives toward on scroll.
    var focus = fruits.reduce(function (a, b) { return b.spec.z < a.spec.z ? b : a; });
    var lookAt = new THREE.Vector3();

    function frame(now) {
      if (blocked()) { running = false; return; }
      var dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      var t = (now - start) / 1000;

      // Adaptive quality: drop resolution, then bow out to the static hero if the device struggles.
      if (dt > 0.034) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
      if (slowFrames > 90) {
        var pr = renderer.getPixelRatio();
        if (pr > 1) { renderer.setPixelRatio(Math.max(1, pr - 0.5)); layoutFruit(); slowFrames = 0; }
        else { canvas.classList.remove('is-ready'); running = false; return; }
      }

      var k = 1 - Math.pow(0.0015, dt);
      pointer.sx += (pointer.x - pointer.sx) * k;
      pointer.sy += (pointer.y - pointer.sy) * k;

      // Camera: cinematic dolly in on load, then scroll drives a push toward the focus fruit.
      // Timing is tuned to the reference reel: a slow push in on load, a gentle handheld drift
      // and a slow "breathing" zoom while idle, and very little roll.
      var intro = easeOut(t / 3.2);
      var sp = easeOut(scrollP * 1.15);
      var driftX = Math.sin(t * 0.31) * 0.12 + Math.sin(t * 0.73 + 2) * 0.04;
      var driftY = Math.sin(t * 0.23 + 1) * 0.08 + Math.sin(t * 0.61) * 0.03;
      camera.position.x = pointer.sx * 0.9 + driftX + focus.base.x * sp * 0.6;
      camera.position.y = -pointer.sy * 0.6 + driftY + focus.base.y * sp * 0.6 - sp * 0.4;
      camera.position.z = CAM_Z + (1 - intro) * 5 - Math.sin(t * 0.12) * 0.25 - sp * 9;
      lookAt.set(focus.base.x * sp, focus.base.y * sp, focus.base.z * sp * 0.5);
      camera.lookAt(lookAt);
      camera.rotation.z += (1 - intro) * 0.05 + Math.sin(t * 0.17) * 0.006 - sp * 0.04;

      fruits.forEach(function (f) {
        var appear = easeOut((t - f.delay) / 1.6);
        var depth = (f.spec.z + 8) / 11; // 0 = far, 1 = near
        var o = f.obj;
        // Float, depth parallax (near fruit travels further with scroll) and entrance rise.
        o.position.set(
          f.base.x + Math.sin(t * 0.5 + f.phase) * 0.12 + f.base.x * sp * 0.35 * depth,
          f.base.y + Math.sin(t * 0.8 + f.phase) * 0.22 + sp * 3.2 * depth - (1 - appear) * 2.5,
          f.base.z + sp * 2 * depth
        );
        o.rotation.x += f.spin.x * dt * (1 + sp * 2.5);
        o.rotation.y += f.spin.y * dt * (1 + sp * 2.5);
        o.rotation.z += f.spin.z * dt;
        var s = f.spec.s * (0.6 + 0.4 * appear);
        o.scale.setScalar(s);
      });

      renderer.render(scene, camera);
      if (!canvas.classList.contains('is-ready')) canvas.classList.add('is-ready');
      requestAnimationFrame(frame);
    }

    wake();
  }

  /* ---------- Boot ---------- */
  if (!reduceMotion) root.classList.add('m3d');
  readScroll();

  // Defer the WebGL scene until the page and ordering UI are interactive.
  function bootScene() {
    var go = function () { try { initHeroScene(); } catch (e) { console.warn('3D hero fallback:', e); } };
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 1500 });
    else setTimeout(go, 300);
  }
  if (document.readyState === 'complete') bootScene();
  else window.addEventListener('load', bootScene);
})();
