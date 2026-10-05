/*
	cosmos.js: a live protoplanetary disk behind the Dimension layout.

	Two canvases are added inside #bg (no HTML changes needed):
	  1. a static sky: stars, molecular-cloud glow, the protostar, and a bipolar
	     outflow (wide blue- and redshifted cavities around a narrow jet)
	  2. the disk: dust particles on Keplerian orbits (omega ~ r^-1.5), with gaps
	     carved by two embedded planets and an icy tint beyond the snow line.

	The disk is tilted on screen (PA_DEG) and centred on the name box; the outflow
	runs perpendicular to it. If JavaScript is off, the original
	background image in main.css is shown instead.
*/
(function () {
	'use strict';

	var bg = document.getElementById('bg');
	if (!bg || !document.createElement('canvas').getContext) return;

	var reduceMotion = window.matchMedia &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	// ---- Tunables ---------------------------------------------------------
	var COS_I = 0.26;            // disk inclination (cos i): ~75 degrees
	var PA_DEG = -24;            // tilt of the disk on screen, degrees (0 = level)
	var PA = PA_DEG * Math.PI / 180;
	var COS_PA = Math.cos(PA), SIN_PA = Math.sin(PA);
	var OUTFLOW_WIDTH = 0.42;    // outflow cavity half-width at its far end, as a fraction of its length
	var SIN_I = Math.sqrt(1 - COS_I * COS_I);
	var R_IN = 0.07;             // inner edge, in units of outer radius
	var OUTER_PERIOD = 260;      // seconds per orbit at the outer edge
	var SNOW_LINE = 0.55;        // beyond this, some grains look icy
	var FADE = 0.16;             // trail fade per frame (lower = longer streaks)

	// Gaps opened by planets: centre, half-width, depth (0..1)
	var GAPS = [
		{ r: 0.30, w: 0.022, d: 0.85 },
		{ r: 0.48, w: 0.034, d: 0.95 },
		{ r: 0.71, w: 0.030, d: 0.90 }
	];
	// Bright rings just outside the gaps (pressure bumps trap dust)
	var RINGS = [
		{ r: 0.355, w: 0.018, n: 0.10 },
		{ r: 0.545, w: 0.022, n: 0.12 },
		{ r: 0.775, w: 0.026, n: 0.10 }
	];
	var PLANETS = [
		{ r: 0.48, phase: 1.9, size: 1.8 },
		{ r: 0.71, phase: 4.4, size: 2.4 }
	];

	// Palette (matches cosmos.css)
	var CORE = [255, 241, 214];
	var EMBER = [242, 166, 90];
	var RUST = [196, 90, 58];
	var DUST = [134, 88, 100];
	var ICE = [156, 199, 220];
	var JET = [207, 230, 255];
	var BLUE_LOBE = [110, 160, 255];  // blueshifted outflow lobe
	var RED_LOBE = [255, 105, 85];    // redshifted outflow lobe

	// ---- Canvas setup -----------------------------------------------------
	function makeLayer(cls) {
		var c = document.createElement('canvas');
		c.className = 'cosmos-layer ' + cls;
		c.setAttribute('aria-hidden', 'true');
		bg.appendChild(c);
		return c;
	}
	var sky = makeLayer('cosmos-sky');
	var disk = makeLayer('cosmos-disk');
	var sctx = sky.getContext('2d');
	var dctx = disk.getContext('2d');
	document.documentElement.classList.add('cosmos-on');

	var W = 0, H = 0, DPR = 1, R = 0, cx = 0, cy = 0;
	var particles = [];

	function lerp(a, b, t) { return a + (b - a) * t; }
	function mix(c1, c2, t) {
		return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
	}
	function gauss() {
		var u = 1 - Math.random(), v = Math.random();
		return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
	}
	function rgba(c, a) {
		return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')';
	}

	// Temperature falls with radius, so colour runs hot core -> ember -> rust -> dust
	function grainColor(r) {
		if (r < 0.14) return mix(CORE, EMBER, r / 0.14);
		if (r < 0.36) return mix(EMBER, RUST, (r - 0.14) / 0.22);
		if (r < SNOW_LINE) return mix(RUST, DUST, (r - 0.36) / (SNOW_LINE - 0.36));
		return Math.random() < 0.22 ? ICE : DUST;
	}

	function gapKeep(r) {
		var keep = 1;
		for (var i = 0; i < GAPS.length; i++) {
			var g = GAPS[i], x = (r - g.r) / g.w;
			keep *= 1 - g.d * Math.exp(-x * x);
		}
		return keep;
	}

	function buildParticles() {
		var area = W * H;
		var n = Math.max(1400, Math.min(7000, Math.round(area / 210)));
		particles = [];
		var tries = 0;
		while (particles.length < n && tries < n * 6) {
			tries++;
			var r;
			var u = Math.random(), acc = 0, ringed = false;
			for (var k = 0; k < RINGS.length; k++) {
				acc += RINGS[k].n;
				if (u < acc) { r = RINGS[k].r + gauss() * RINGS[k].w; ringed = true; break; }
			}
			// Sigma ~ r^-1 means particle count is uniform in r
			if (!ringed) r = lerp(R_IN, 1, Math.random());
			if (r < R_IN || r > 1.02) continue;
			if (!ringed && Math.random() > gapKeep(r)) continue;

			var bright = Math.min(1, 0.8 * Math.pow(r, -0.5)) * (ringed ? 1.3 : 1);
			particles.push({
				r: r,
				phi: Math.random() * Math.PI * 2,
				omega: (2 * Math.PI / OUTER_PERIOD) * Math.pow(r, -1.5),
				// flared disk: scale height grows faster than r
				z: gauss() * 0.045 * Math.pow(r, 1.25),
				size: 0.7 + Math.random() * (r < 0.2 ? 1.5 : 1.2),
				col: grainColor(r),
				a: Math.min(0.95, bright * (0.5 + Math.random() * 0.5))
			});
		}
	}

	function locateCenter() {
		var box = document.querySelector('#header .content');
		if (box) {
			var rect = box.getBoundingClientRect();
			if (rect.height > 0 && rect.width > 0) {
				cx = rect.left + rect.width / 2;
				cy = rect.top + rect.height / 2;
				return;
			}
		}
		if (!cx) { cx = W / 2; cy = H / 2; }
	}

	// ---- Static sky -------------------------------------------------------
	function drawSky() {
		var s = sctx;
		s.setTransform(DPR, 0, 0, DPR, 0, 0);
		s.clearRect(0, 0, W, H);

		// Deep space base
		s.fillStyle = '#070816';
		s.fillRect(0, 0, W, H);

		// Parent molecular cloud: a few soft, off-centre glows
		var clouds = [
			{ x: 0.18, y: 0.22, r: 0.55, c: [74, 32, 58], a: 0.55 },
			{ x: 0.86, y: 0.78, r: 0.60, c: [58, 26, 40], a: 0.50 },
			{ x: 0.75, y: 0.15, r: 0.35, c: [30, 52, 74], a: 0.35 }
		];
		var D = Math.max(W, H);
		clouds.forEach(function (c) {
			var g = s.createRadialGradient(c.x * W, c.y * H, 0, c.x * W, c.y * H, c.r * D);
			g.addColorStop(0, rgba(c.c, c.a));
			g.addColorStop(1, rgba(c.c, 0));
			s.fillStyle = g;
			s.fillRect(0, 0, W, H);
		});

		// Field stars, a few with a slight colour
		var nStars = Math.round(W * H / 2600);
		for (var i = 0; i < nStars; i++) {
			var x = Math.random() * W, y = Math.random() * H;
			var m = Math.pow(Math.random(), 3);
			var tint = Math.random();
			var col = tint < 0.15 ? [255, 214, 180] : tint < 0.3 ? [190, 214, 255] : [255, 255, 255];
			s.fillStyle = rgba(col, 0.25 + m * 0.75);
			var sz = 0.4 + m * 1.4;
			s.fillRect(x, y, sz, sz);
			if (m > 0.85) {
				var gl = s.createRadialGradient(x, y, 0, x, y, 6);
				gl.addColorStop(0, rgba(col, 0.35));
				gl.addColorStop(1, rgba(col, 0));
				s.fillStyle = gl;
				s.fillRect(x - 6, y - 6, 12, 12);
			}
		}

		s.globalCompositeOperation = 'lighter';

		// Outflow, perpendicular to the tilted disk. A wide-angle wind carves two
		// cavities; the blueshifted lobe tilts toward us, so on the sky it sits on
		// the disk's far side, and the redshifted lobe on the near side.
		var L = Math.max(H * 0.7, R * 0.95);
		s.save();
		s.translate(cx, cy);
		s.rotate(PA);
		[{ dir: -1, col: BLUE_LOBE }, { dir: 1, col: RED_LOBE }].forEach(function (lobe) {
			var dir = lobe.dir, col = lobe.col;
			var wMax = L * OUTFLOW_WIDTH;
			var steps = 40, right = [], left = [];
			for (var k = 0; k <= steps; k++) {
				var t = k / steps;
				var w = wMax * Math.sqrt(t);        // parabolic cavity wall
				right.push([w, dir * L * t]);
				left.push([-w, dir * L * t]);
			}

			// Faint fill inside the cavity (scattered light)
			var fill = s.createLinearGradient(0, 0, 0, dir * L);
			fill.addColorStop(0, rgba(col, 0.10));
			fill.addColorStop(0.45, rgba(col, 0.04));
			fill.addColorStop(1, rgba(col, 0));
			s.fillStyle = fill;
			s.beginPath();
			s.moveTo(0, 0);
			right.forEach(function (pt) { s.lineTo(pt[0], pt[1]); });
			for (var m = left.length - 1; m >= 0; m--) s.lineTo(left[m][0], left[m][1]);
			s.closePath();
			s.fill();

			// Limb-brightened cavity walls, layered strokes to stay soft without ctx.filter
			[[10, 0.025], [5, 0.05], [1.6, 0.16]].forEach(function (pass) {
				var edge = s.createLinearGradient(0, 0, 0, dir * L);
				edge.addColorStop(0, rgba(col, pass[1]));
				edge.addColorStop(0.6, rgba(col, pass[1] * 0.45));
				edge.addColorStop(1, rgba(col, 0));
				s.strokeStyle = edge;
				s.lineWidth = pass[0];
				s.lineCap = 'round';
				[right, left].forEach(function (side) {
					s.beginPath();
					s.moveTo(0, 0);
					side.forEach(function (pt) { s.lineTo(pt[0], pt[1]); });
					s.stroke();
				});
			});

			// Collimated jet down the middle
			var jg = s.createLinearGradient(0, 0, 0, dir * L);
			jg.addColorStop(0, rgba(JET, 0.22));
			jg.addColorStop(0.5, rgba(JET, 0.07));
			jg.addColorStop(1, rgba(JET, 0));
			s.fillStyle = jg;
			s.beginPath();
			s.moveTo(-0.8, 0);
			s.lineTo(-4, dir * L);
			s.lineTo(4, dir * L);
			s.lineTo(0.8, 0);
			s.closePath();
			s.fill();

			// Herbig-Haro knots: shocks where the jet ploughs into the cloud
			[0.3, 0.52, 0.78].forEach(function (f, j) {
				var ky = dir * L * f, kr = 14 + j * 9;
				var kg = s.createRadialGradient(0, ky, 0, 0, ky, kr);
				kg.addColorStop(0, rgba(JET, 0.12 - j * 0.03));
				kg.addColorStop(1, rgba(JET, 0));
				s.fillStyle = kg;
				s.fillRect(-kr, ky - kr, kr * 2, kr * 2);
			});
		});
		s.restore();

		// Protostar: small hot core inside a wide, faint scattered-light halo
		var halo = s.createRadialGradient(cx, cy, 0, cx, cy, R * 0.42);
		halo.addColorStop(0, rgba(CORE, 0.5));
		halo.addColorStop(0.2, rgba(EMBER, 0.2));
		halo.addColorStop(1, rgba(RUST, 0));
		s.fillStyle = halo;
		s.fillRect(cx - R, cy - R, R * 2, R * 2);

		var core = s.createRadialGradient(cx, cy, 0, cx, cy, 14);
		core.addColorStop(0, 'rgba(255,255,255,0.95)');
		core.addColorStop(0.4, rgba(CORE, 0.6));
		core.addColorStop(1, rgba(CORE, 0));
		s.fillStyle = core;
		s.fillRect(cx - 14, cy - 14, 28, 28);

		s.globalCompositeOperation = 'source-over';
	}

	// ---- Disk -------------------------------------------------------------
	function project(r, phi, z) {
		var dx = r * R * Math.cos(phi);
		var dy = r * R * Math.sin(phi) * COS_I - z * R * SIN_I;
		// rotate onto the sky by the disk's tilt
		return [cx + dx * COS_PA - dy * SIN_PA, cy + dx * SIN_PA + dy * COS_PA];
	}

	function drawDisk(dt) {
		var c = dctx;
		c.setTransform(DPR, 0, 0, DPR, 0, 0);

		if (reduceMotion) {
			c.clearRect(0, 0, W, H);
		} else {
			// Fade the previous frame to leave short orbital streaks,
			// which makes the Keplerian shear (inner grains outrun outer ones) visible
			c.globalCompositeOperation = 'destination-out';
			c.fillStyle = 'rgba(0,0,0,' + FADE + ')';
			c.fillRect(0, 0, W, H);
		}

		c.globalCompositeOperation = 'lighter';
		for (var i = 0; i < particles.length; i++) {
			var p = particles[i];
			p.phi += p.omega * dt;
			var pos = project(p.r, p.phi, p.z);
			// near side (sin phi > 0) is forward-scattering, so slightly brighter
			var a = p.a * (0.75 + 0.25 * Math.sin(p.phi));
			c.fillStyle = rgba(p.col, a.toFixed(3));
			c.fillRect(pos[0], pos[1], p.size, p.size);
		}

		// Embedded planets, each with a small circumplanetary glow
		for (var j = 0; j < PLANETS.length; j++) {
			var pl = PLANETS[j];
			pl.phase += (2 * Math.PI / OUTER_PERIOD) * Math.pow(pl.r, -1.5) * dt;
			var pp = project(pl.r, pl.phase, 0);
			var gr = pl.size * 5;
			var g = c.createRadialGradient(pp[0], pp[1], 0, pp[0], pp[1], gr);
			g.addColorStop(0, 'rgba(255,255,255,0.55)');
			g.addColorStop(0.35, rgba(ICE, 0.18));
			g.addColorStop(1, rgba(ICE, 0));
			c.fillStyle = g;
			c.fillRect(pp[0] - gr, pp[1] - gr, gr * 2, gr * 2);
		}
		c.globalCompositeOperation = 'source-over';
	}

	// ---- Lifecycle --------------------------------------------------------
	function resize() {
		DPR = Math.min(window.devicePixelRatio || 1, 1.5);
		W = window.innerWidth;
		H = window.innerHeight;
		[sky, disk].forEach(function (cv) {
			cv.width = Math.round(W * DPR);
			cv.height = Math.round(H * DPR);
		});
		R = Math.hypot(W, H) * 0.37;
		if (W < 737) R = Math.max(W * 0.75, H * 0.38);
		locateCenter();
		buildParticles();
		drawSky();
		drawDisk(0);
	}

	var last = 0, frame = 0, running = false;
	function tick(t) {
		if (!running) return;
		var dt = last ? Math.min((t - last) / 1000, 0.05) : 0;
		last = t;
		frame++;
		// While a card is open the disk is blurred behind it; spend less effort
		var articleOpen = document.body.classList.contains('is-article-visible');
		if (!articleOpen || frame % 3 === 0) drawDisk(articleOpen ? dt * 3 : dt);
		requestAnimationFrame(tick);
	}
	function start() {
		if (reduceMotion || running) return;
		running = true;
		last = 0;
		requestAnimationFrame(tick);
	}
	function stop() { running = false; }

	var resizeTimer;
	window.addEventListener('resize', function () {
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(resize, 150);
	});
	document.addEventListener('visibilitychange', function () {
		if (document.hidden) stop(); else start();
	});

	// The name box grows open during the intro, so re-centre once it settles
	window.addEventListener('load', function () {
		setTimeout(function () { locateCenter(); drawSky(); }, 1200);
	});

	resize();
	start();
})();
