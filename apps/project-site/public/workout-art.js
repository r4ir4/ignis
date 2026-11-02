// How-to animations for exercises: a small red-on-pink line-art figure (like the illustrations) drawn with joints and two-bone IK, looping forever.
// window.WkArt.has(name) tells whether a movement is known; WkArt.mount(el, name) draws it into el and returns { stop, tips, title }.
(() => {
  'use strict';
  const W = 400, H = 300, G = 262;
  const RED = '#d04848', PINK = '#f7dce1', DARK = '#b53a3a';
  const L = { thigh: 62, shin: 62, torso: 72, upper: 40, fore: 40 };
  const rad = (d) => (d * Math.PI) / 180;
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerp2 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  const f1 = (n) => n.toFixed(1);
  const pt = (p) => f1(p[0]) + ',' + f1(p[1]);

  // two-bone IK: the middle joint of a limb from root to target; sign picks which side it bends toward
  function ik(root, tg, l1, l2, s) {
    const dx = tg[0] - root[0], dy = tg[1] - root[1];
    const d = Math.min(Math.max(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.01);
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
    const ux = dx / Math.hypot(dx, dy || 1e-6), uy = dy / Math.hypot(dx, dy || 1e-6);
    const bx = root[0] + ux * a, by = root[1] + uy * a;
    return [bx - uy * h * s, by + ux * h * s];
  }
  const line = (a, b, w, c, extra) => '<line x1="' + f1(a[0]) + '" y1="' + f1(a[1]) + '" x2="' + f1(b[0]) + '" y2="' + f1(b[1]) + '" stroke="' + c + '" stroke-width="' + w + '" stroke-linecap="round"' + (extra || '') + '/>';
  const circ = (c, r, fill, stroke, sw) => '<circle cx="' + f1(c[0]) + '" cy="' + f1(c[1]) + '" r="' + r + '" fill="' + fill + '"' + (stroke ? ' stroke="' + stroke + '" stroke-width="' + (sw || 3) + '"' : '') + '/>';

  // --- props ---------------------------------------------------------------------------------------------------------------------------------------
  const plate = (c, r) => circ(c, r, RED) + circ(c, r * 0.62, 'none', PINK, 2) + circ(c, 3.2, PINK);
  const kettle = (c) => '<path d="M' + f1(c[0] - 11) + ' ' + f1(c[1] - 12) + 'C' + f1(c[0] - 14) + ' ' + f1(c[1] - 32) + ' ' + f1(c[0] + 14) + ' ' + f1(c[1] - 32) + ' ' + f1(c[0] + 11) + ' ' + f1(c[1] - 12) + '" fill="none" stroke="' + RED + '" stroke-width="4" stroke-linecap="round"/>' + circ(c, 19, RED) + '<ellipse cx="' + f1(c[0] - 2) + '" cy="' + f1(c[1] - 6) + '" rx="8" ry="4.5" fill="' + PINK + '"/>';
  const dumbbell = (c, ang) => {
    const dx = Math.cos(ang) * 11, dy = Math.sin(ang) * 11;
    return line([c[0] - dx, c[1] - dy], [c[0] + dx, c[1] + dy], 5, RED) + circ([c[0] - dx * 1.3, c[1] - dy * 1.3], 8, RED) + circ([c[0] + dx * 1.3, c[1] + dy * 1.3], 8, RED);
  };
  const decor = '<path d="M268 74H372V82H268Z" fill="none" stroke="' + RED + '" stroke-width="2.5"/>' + kettle([292, 54]).replace(/stroke-width="4"/g, 'stroke-width="3"') + kettle([344, 54]).replace(/stroke-width="4"/g, 'stroke-width="3"') +
    '<path d="M24 ' + G + 'H376" stroke="' + RED + '" stroke-width="2.5" stroke-linecap="round"/>';

  // --- the figure ------------------------------------------------------------------------------------------------------------------------------------
  function figure(f) {
    const t = rad(f.torso);
    const hip = f.hip;
    const sh = [hip[0] + L.torso * Math.sin(t), hip[1] - L.torso * Math.cos(t)];
    const nt = rad((f.torso || 0) + (f.neck || 0));
    const head = [sh[0] + 33 * Math.sin(nt), sh[1] - 33 * Math.cos(nt)];
    const knee = ik(hip, f.ankle, L.thigh, L.shin, -1);
    const knee2 = ik(hip, f.ankle2 || f.ankle, L.thigh, L.shin, -1);
    const hand = f.hand ? (typeof f.hand === 'function' ? f.hand(sh, hip) : f.hand) : [sh[0] + 6, sh[1] + 78];
    const elbow = f.elbow ? (typeof f.elbow === 'function' ? f.elbow(sh, hand) : f.elbow) : ik(sh, hand, L.upper, L.fore, f.es == null ? 1 : f.es);
    const foot = (a, tilt) => '<g transform="rotate(' + (tilt || 0) + ' ' + f1(a[0]) + ' ' + f1(a[1]) + ')"><path d="M' + f1(a[0] - 7) + ' ' + f1(a[1] - 4) + 'L' + f1(a[0] + 14) + ' ' + f1(a[1] - 4) + 'Q' + f1(a[0] + 26) + ' ' + f1(a[1] - 2) + ' ' + f1(a[0] + 26) + ' ' + f1(a[1] + 8) + 'H' + f1(a[0] - 8) + 'Q' + f1(a[0] - 10) + ' ' + f1(a[1] + 2) + ' ' + f1(a[0] - 7) + ' ' + f1(a[1] - 4) + 'Z" fill="' + PINK + '" stroke="' + RED + '" stroke-width="3" stroke-linejoin="round"/></g>';
    let s = '';
    s += (f.under || '');
    // far leg (a little lighter), torso, near leg, head, near arm
    s += '<g opacity=".72">' + line(hip, knee2, 22, RED) + line(knee2, f.ankle2 || f.ankle, 18, RED) + '</g>';
    s += foot(f.ankle2 || f.ankle, f.footTilt2 == null ? f.footTilt : f.footTilt2);
    s += line(hip, sh, 40, RED);
    s += line(hip, knee, 24, RED) + line(knee, f.ankle, 20, RED);
    s += foot(f.ankle, f.footTilt);
    // head: pink face, red outline, bun, bangs, cheek, brow
    const ang = (nt * 180) / Math.PI;
    s += '<g transform="rotate(' + f1(ang - 12) + ' ' + f1(head[0]) + ' ' + f1(head[1]) + ')">' + circ([head[0] - 11, head[1] - 20], 10, PINK, RED, 3) + '<path d="M' + f1(head[0] - 14) + ' ' + f1(head[1] - 12) + 'a14 14 0 0 1 28 0v3H' + f1(head[0] - 14) + 'Z" fill="' + RED + '" transform="translate(0 -3)"/>' + circ(head, 19, PINK, RED, 3) +
      '<path d="M' + f1(head[0] - 19) + ' ' + f1(head[1] - 2) + 'a19 19 0 0 1 38 0V' + f1(head[1] - 8) + 'H' + f1(head[0] - 19) + 'Z" fill="' + RED + '"/>' + circ([head[0] + 9, head[1] + 6], 4.4, RED) + '<path d="M' + f1(head[0] + 4) + ' ' + f1(head[1] - 3) + 'l10 3" stroke="' + RED + '" stroke-width="2.6" stroke-linecap="round"/><path d="M' + f1(head[0] + 6) + ' ' + f1(head[1] + 13) + 'h7" stroke="' + RED + '" stroke-width="2.4" stroke-linecap="round"/></g>';
    s += line(sh, elbow, 17, RED) + line(sh, elbow, 11, PINK) + line(elbow, hand, 15, RED) + line(elbow, hand, 9, PINK);
    s += circ(hand, 7, PINK, RED, 3);
    s += (f.over ? f.over(sh, hand, elbow, hip) : '');
    return s;
  }

  // --- movements -------------------------------------------------------------------------------------------------------------------------------------
  // each returns the pose for u in [0, 1] (0 = start, 1 = the hard part)
  const standLegs = (ax) => ({ ankle: [ax, G - 8], ankle2: [ax - 14, G - 8] });
  const squat = (kind) => (u) => {
    const hip = lerp2([181, 132], [133, 200], u);
    const torso = lerp(6, 38, u);
    const base = { hip, torso, ...standLegs(188), neck: -6 };
    if (kind === 'goblet') return { ...base, hand: (sh) => [sh[0] + 28, sh[1] + 28], over: (sh, h) => kettle([h[0] + 2, h[1] + 4]) };
    if (kind === 'front') return { ...base, hand: (sh) => [sh[0] + 22, sh[1] + 8], es: -1, under: '', over: (sh) => plate([sh[0] + 14, sh[1] + 2], 21) };
    if (kind === 'back') return { ...base, hand: (sh) => [sh[0] + 10, sh[1] - 8], es: 1, under: '', over: (sh) => plate([sh[0] - 4, sh[1] - 4], 21) };
    return { ...base, hand: (sh) => [sh[0] + 50, sh[1] + 4] };
  };
  const pushup = (u) => {
    const toes = [92, G - 6], th = rad(lerp(25, 7, u)), Lb = L.thigh + L.shin;
    const hip = [toes[0] + Lb * Math.cos(th), toes[1] - Lb * Math.sin(th)];
    return { hip, torso: 90 - (th * 180) / Math.PI, ankle: [toes[0] - 4, toes[1] - 4], ankle2: [toes[0] - 4, toes[1] - 4], footTilt: -70, neck: -24, hand: [282, G - 4], es: 1 };
  };
  const plank = (u) => {
    const toes = [92, G - 6], th = rad(9 + u * 0.8), Lb = L.thigh + L.shin;
    const hip = [toes[0] + Lb * Math.cos(th), toes[1] - Lb * Math.sin(th)];
    const sh = [hip[0] + L.torso * Math.cos(th), hip[1] - L.torso * Math.sin(th)];
    return { hip, torso: 90 - (th * 180) / Math.PI, ankle: [toes[0] - 4, toes[1] - 4], ankle2: [toes[0] - 4, toes[1] - 4], footTilt: -70, neck: -22, elbow: [sh[0] + 4, G - 8], hand: [sh[0] + 44, G - 8] };
  };
  const deadlift = (u) => {
    const hip = lerp2([128, 186], [181, 134], u);
    const torso = lerp(68, 5, u);
    const hand = lerp2([192, G - 28], [196, 176], u);
    return { hip, torso, ...standLegs(188), neck: -14, hand, es: 1, over: (sh, h) => plate(h, 26) };
  };
  const press = (u) => ({ hip: [181, 132], torso: 2, ...standLegs(188), neck: 0, hand: (sh) => [sh[0] + lerp(16, 6, u), sh[1] + lerp(-8, -76, u)], es: 1, over: (sh, h) => plate(h, 20) });
  const bench = (u) => ({
    hip: [128, 192], torso: 90, ankle: [102, G - 8], ankle2: [90, G - 8], neck: -2,
    hand: (sh) => [sh[0], sh[1] + lerp(-16, -80, u)], es: -1, under: '<rect x="84" y="200" width="170" height="14" rx="6" fill="' + PINK + '" stroke="' + RED + '" stroke-width="3"/><path d="M110 214V' + G + 'M228 214V' + G + '" stroke="' + RED + '" stroke-width="3"/>',
    over: (sh, h) => plate(h, 20),
  });
  const curl = (u) => {
    const a = rad(lerp(0, 150, u));
    return { hip: [181, 132], torso: 2, ...standLegs(188), neck: 0,
      elbow: (sh) => [sh[0] + 6, sh[1] + 38],
      hand: (sh) => { const e = [sh[0] + 6, sh[1] + 38]; return [e[0] + 38 * Math.sin(a), e[1] + 38 * Math.cos(a)]; },
      over: (sh, h) => dumbbell(h, rad(lerp(0, 150, u)) + Math.PI / 2) };
  };
  const lunge = (u) => ({
    hip: lerp2([180, 133], [172, 192], u), torso: 4, neck: 0,
    ankle: lerp2([188, G - 8], [226, G - 8], u), ankle2: lerp2([172, G - 8], [116, G - 8], u),
    hand: (sh) => [sh[0] + 4, sh[1] + 78], es: 1, over: (sh, h) => dumbbell(h, Math.PI / 2),
  });
  const bulgarian = (u) => ({
    hip: lerp2([180, 140], [174, 186], u), torso: 4, neck: 0, ankle: [222, G - 8], ankle2: [104, G - 58], footTilt2: 40,
    hand: (sh) => [sh[0] + 4, sh[1] + 78], es: 1,
    under: '<rect x="74" y="' + (G - 52) + '" width="70" height="14" rx="6" fill="' + PINK + '" stroke="' + RED + '" stroke-width="3"/><path d="M86 ' + (G - 38) + 'V' + G + 'M132 ' + (G - 38) + 'V' + G + '" stroke="' + RED + '" stroke-width="3"/>',
    over: (sh, h) => dumbbell(h, Math.PI / 2),
  });
  const pullup = (u) => {
    const shy = lerp(142, 86, u);
    const hip = [196, shy + 70];
    return { hip, torso: 3, ankle: [hip[0] - 22, hip[1] + 104], ankle2: [hip[0] - 34, hip[1] + 98], neck: -6, footTilt: 60, footTilt2: 60, hand: [204, 62], es: -1,
      under: '<path d="M150 62H262" stroke="' + RED + '" stroke-width="7" stroke-linecap="round"/><path d="M150 62V28M262 62V28" stroke="' + RED + '" stroke-width="3" stroke-linecap="round"/>' };
  };
  const row = (u) => ({ hip: [128, 172], torso: 66, ...standLegs(186), neck: -22, ankle: [186, G - 8],
    hand: (sh) => [sh[0] + lerp(10, -22, u), sh[1] + lerp(78, 42, u)], es: -1, over: (sh, h) => plate(h, 22) });

  const MOVES = {
    squat: { fn: squat('back'), title: 'Squat', period: 2.8, tips: ['Feet about shoulder width, toes slightly out.', 'Sit down and back, knees follow your toes.', 'Chest up, push the floor away to stand.'] },
    bodysquat: { fn: squat('body'), title: 'Bodyweight squat', period: 2.4, tips: ['Reach your arms forward for balance.', 'Sit back like onto a chair.', 'Keep your heels on the floor.'] },
    goblet: { fn: squat('goblet'), title: 'Goblet squat', period: 2.8, tips: ['Hold the weight close to your chest.', 'Elbows track inside your knees at the bottom.', 'Stay tall, drive up through your heels.'] },
    front: { fn: squat('front'), title: 'Front squat', period: 2.8, tips: ['Bar rests on the front of your shoulders.', 'Keep elbows high and the chest tall.', 'Stand up straight, bar path stays vertical.'] },
    pushup: { fn: pushup, title: 'Push-up', period: 2.2, tips: ['Hands under shoulders, body in one straight line.', 'Lower your chest to just above the floor.', 'Press away without letting your hips sag.'] },
    plank: { fn: plank, title: 'Plank', period: 3.6, tips: ['Elbows under shoulders, forearms on the floor.', 'Squeeze glutes and belly, body in a line.', 'Breathe slowly and hold.'] },
    deadlift: { fn: deadlift, title: 'Deadlift', period: 3, tips: ['Bar over your mid-foot, shoulders just in front of it.', 'Push the floor away, keep the bar close to your legs.', 'Finish tall, hips and knees locked together.'] },
    press: { fn: press, title: 'Overhead press', period: 2.6, tips: ['Weight starts at your shoulders, ribs down.', 'Press straight up, head moves through.', 'Finish with arms by your ears and a tight belly.'] },
    bench: { fn: bench, title: 'Bench press', period: 2.8, tips: ['Shoulder blades pinched, feet planted.', 'Lower the bar to your chest with control.', 'Press up and slightly back over your shoulders.'] },
    curl: { fn: curl, title: 'Biceps curl', period: 2.4, tips: ['Elbows stay by your sides.', 'Curl up without swinging your body.', 'Lower slowly all the way down.'] },
    lunge: { fn: lunge, title: 'Lunge', period: 2.8, tips: ['Take a long step, torso upright.', 'Lower until both knees are about 90 degrees.', 'Push through the front heel to come back.'] },
    bulgarian: { fn: bulgarian, title: 'Bulgarian split squat', period: 2.8, tips: ['Back foot on the bench, front foot well ahead.', 'Drop straight down, front knee over the toes.', 'Drive up through the front heel.'] },
    pullup: { fn: pullup, title: 'Pull-up', period: 2.8, tips: ['Start from a dead hang, shoulders away from your ears.', 'Pull your elbows down toward your ribs.', 'Chin over the bar, then lower slowly.'] },
    row: { fn: row, title: 'Bent-over row', period: 2.6, tips: ['Hinge forward with a flat back.', 'Pull the bar to your lower ribs.', 'Squeeze your shoulder blades, lower with control.'] },
  };

  // which movement an exercise name means
  function match(name) {
    const n = String(name || '').toLowerCase();
    if (/bulgarian|split squat/.test(n)) return 'bulgarian';
    if (/goblet/.test(n)) return 'goblet';
    if (/front squat/.test(n)) return 'front';
    if (/body ?weight squat|air squat|^squat jump/.test(n)) return 'bodysquat';
    if (/squat/.test(n)) return 'squat';
    if (/push[ -]?up|press[ -]?up/.test(n)) return 'pushup';
    if (/plank/.test(n)) return 'plank';
    if (/deadlift|rdl|romanian/.test(n)) return 'deadlift';
    if (/bench|chest press/.test(n)) return 'bench';
    if (/overhead|shoulder press|military|ohp/.test(n)) return 'press';
    if (/curl/.test(n)) return 'curl';
    if (/lunge/.test(n)) return 'lunge';
    if (/pull[ -]?up|chin[ -]?up/.test(n)) return 'pullup';
    if (/row/.test(n)) return 'row';
    return null;
  }

  function mount(el, name) {
    const key = match(name);
    if (!key) return null;
    const mv = MOVES[key];
    el.replaceChildren();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'wk-art-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Animation: how to do a ' + mv.title.toLowerCase());
    svg.innerHTML = '<rect width="' + W + '" height="' + H + '" fill="' + PINK + '"/><g class="decor">' + decor + '</g><g class="fig"></g>';
    el.appendChild(svg);
    const fig = svg.querySelector('.fig');
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, t0 = performance.now(), stopped = false;
    const draw = (u) => { fig.innerHTML = figure(mv.fn(u)); };
    if (reduce) { draw(1); } else {
      const frame = (now) => {
        if (stopped) return;
        if (!svg.isConnected) { stopped = true; return; }
        const p = ((now - t0) / 1000 / mv.period) % 1;
        draw(0.5 - 0.5 * Math.cos(2 * Math.PI * p));
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }
    return { stop: () => { stopped = true; cancelAnimationFrame(raf); }, tips: mv.tips, title: mv.title };
  }

  // draw one still frame (u from 0 to 1) into el; handy for previews and for exporting frames
  function frame(el, name, u) {
    const key = match(name);
    if (!key) return false;
    el.replaceChildren();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.innerHTML = '<rect width="' + W + '" height="' + H + '" fill="' + PINK + '"/><g>' + decor + '</g><g>' + figure(MOVES[key].fn(u)) + '</g>';
    el.appendChild(svg);
    return true;
  }

  window.WkArt = { has: (name) => !!match(name), mount, match, frame };
})();
