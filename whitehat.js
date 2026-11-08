// Okabe-Ito based, colorblind-safe
const COLORS = {
  'Sub-Saharan Africa': '#E69F00',
  'Middle East & North Africa': '#D55E00',
  'South Asia': '#CC79A7',
  'East Asia & Pacific': '#009E73',
  'Europe & Central Asia': '#0072B2',
  'Latin America & Caribbean': '#9467bd',
  'North America': '#56B4E9',
};
const REGIONS = Object.keys(COLORS);
const IND = {
  F: 'Labor force participation rate, female (% of female population ages 15+) (modeled ILO estimate)',
  M: 'Labor force participation rate, male (% of male population ages 15+) (modeled ILO estimate)',
  W: 'Women Business and the Law Index Score (scale 1-100)',
};
const Y0 = 1990, Y1 = 2019;
const stripBom = s => s.replace(/^﻿/, '');

const tip = d3.select('#tip');
const showTip = (ev, html) => tip.html(html).style('opacity', 1)
  .style('left', Math.min(ev.clientX + 14, innerWidth - 270) + 'px').style('top', ev.clientY + 14 + 'px');
const hideTip = () => tip.style('opacity', 0);

// Shared state: a region picked in the legend, or hovered on either chart.
const state = { year: Y1, selected: null, hover: null, listeners: [] };
const focus = () => state.hover || state.selected;
const update = () => state.listeners.forEach(f => f());

Promise.all([
  d3.text('gender-raw-2021.csv'),
  d3.text('Metadata_Country_API_17_DS2_en_csv_v2_3058240.csv'),
]).then(([rawText, metaText]) => {
  // Real countries have a Region; aggregates ("World", "Arab World", ...) do not.
  const meta = new Map(d3.csvParse(stripBom(metaText)).filter(d => d.Region).map(d => [d['Country Code'], d]));

  const rows = d3.csvParseRows(stripBom(rawText));
  const hi = rows.findIndex(r => r[0] === 'Country Name');
  const head = rows[hi];
  const yearCols = d3.range(4, head.length).filter(j => /^\d{4}$/.test(head[j]));
  const byInd = { F: new Map(), M: new Map(), W: new Map() };
  for (const r of rows.slice(hi + 1)) {
    const k = Object.keys(IND).find(k => IND[k] === r[2]);
    if (!k || !meta.has(r[1])) continue;
    const s = new Map();
    for (const j of yearCols) if (r[j] !== '' && r[j] !== undefined) s.set(+head[j], +r[j]);
    byInd[k].set(r[1], s);
  }

  // Per-country, per-year gap; regional median and quartiles per year.
  const gapByRegion = new Map(REGIONS.map(r => [r, []]));
  for (const reg of REGIONS) {
    for (let y = Y0; y <= Y1; y++) {
      const vals = [];
      for (const [code, m] of meta) {
        if (m.Region !== reg) continue;
        const f = byInd.F.get(code)?.get(y), mm = byInd.M.get(code)?.get(y);
        if (f !== undefined && mm !== undefined) vals.push(mm - f);
      }
      vals.sort(d3.ascending);
      gapByRegion.get(reg).push({ year: y, n: vals.length, gap: d3.median(vals),
        q1: d3.quantile(vals, .25), q3: d3.quantile(vals, .75) });
    }
  }

  document.getElementById('loading').remove();
  const drawLine = drawGap(gapByRegion);
  drawScatter(meta, byInd);
});

function drawGap(gapByRegion) {
  const W = 880, H = 420, m = { t: 12, r: 300, b: 40, l: 56 };
  const svg = d3.select('#chart-gap').append('svg').attr('viewBox', [0, 0, W, H]).attr('role', 'img')
    .attr('aria-label', 'Line chart of the median male minus female labor force participation gap by region, 1990 to 2019');
  const x = d3.scaleLinear([Y0, Y1], [m.l, W - m.r]);
  const y = d3.scaleLinear([0, 60], [H - m.b, m.t]);

  svg.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(6).tickSize(-(W - m.r - m.l)).tickFormat(''));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`)
    .call(d3.axisBottom(x).tickFormat(d3.format('d')).ticks(7));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6));
  svg.append('text').attr('class', 'muted').attr('transform', 'rotate(-90)').attr('x', -(H - m.b + m.t) / 2).attr('y', 14)
    .attr('text-anchor', 'middle').text('Male minus female participation rate (percentage points)');
  svg.append('text').attr('class', 'muted').attr('x', m.l + 4).attr('y', y(0) - 6).text('0 = equal participation');

  const line = d3.line().x(d => x(d.year)).y(d => y(d.gap));
  const area = d3.area().x(d => x(d.year)).y0(d => y(d.q1)).y1(d => y(d.q3));
  const regs = [...gapByRegion];

  const band = svg.append('path').attr('opacity', .18);
  const marker = svg.append('line').attr('y1', m.t).attr('y2', H - m.b).attr('stroke', 'currentColor')
    .attr('stroke-dasharray', '2 3').attr('opacity', .5);

  // Direct labels with simple collision avoidance
  const labels = regs.map(([name, v]) => ({ name, last: v[v.length - 1], y: y(v[v.length - 1].gap) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 15);

  const g = svg.selectAll('.reg').data(regs).join('g').attr('class', 'reg');
  const paths = g.append('path').attr('d', ([, v]) => line(v)).attr('fill', 'none')
    .attr('stroke', ([k]) => COLORS[k]).attr('stroke-width', 2.5);
  g.append('path').attr('d', ([, v]) => line(v)).attr('fill', 'none').attr('stroke', 'transparent').attr('stroke-width', 14)
    .on('mousemove', (ev, [k, v]) => {
      state.hover = k; update();
      const yr = Math.round(Math.max(Y0, Math.min(Y1, x.invert(d3.pointer(ev)[0]))));
      const p = v.find(d => d.year === yr);
      showTip(ev, `<b>${k}</b><br>${yr}: median gap ${p.gap.toFixed(1)} points<br>middle 50% of countries: ${p.q1.toFixed(1)}&ndash;${p.q3.toFixed(1)}<br>${p.n} countries`);
    }).on('mouseleave', () => { state.hover = null; hideTip(); update(); });
  const labs = svg.selectAll('.lab').data(labels).join('text').attr('class', 'lab')
    .attr('x', x(Y1) + 8).attr('y', d => d.y + 4).attr('font-size', 12.5)
    .style('fill', d => COLORS[d.name]).style('font-weight', 600)
    .text(d => `${d.name} (${d.last.gap.toFixed(0)} pts, n=${d.last.n})`);

  // The spread band is only drawn for regions with enough countries for meaningful quartiles.
  const MIN_N_BAND = 10;
  const tooSmall = k => d3.min(gapByRegion.get(k), d => d.n) < MIN_N_BAND;
  const smallRegions = REGIONS.filter(tooSmall);
  d3.select('#band-rule').text(`The band is not drawn for regions with fewer than ${MIN_N_BAND} countries (${smallRegions.map(k => `${k}, n=${d3.min(gapByRegion.get(k), d => d.n)}`).join('; ')}), because quartiles of so few countries are not meaningful; their median lines are still shown.`);

  state.listeners.push(() => {
    const f = focus();
    const op = k => (!f || f === k ? 1 : .15);
    paths.attr('opacity', ([k]) => op(k));
    labs.attr('opacity', d => op(d.name));
    marker.attr('x1', x(state.year)).attr('x2', x(state.year));
    const sel = state.selected;
    const drawBand = sel && !tooSmall(sel);
    band.attr('display', drawBand ? null : 'none');
    if (drawBand) band.attr('d', area(gapByRegion.get(sel))).attr('fill', COLORS[sel]);
    d3.select('#band-note').text(sel && !drawBand
      ? `Spread band not shown for ${sel}: only ${d3.min(gapByRegion.get(sel), d => d.n)} countries.` : '');
  });
}

function drawScatter(meta, byInd) {
  const W = 880, H = 520, m = { t: 12, r: 16, b: 48, l: 56 };
  const svg = d3.select('#chart-scatter').append('svg').attr('viewBox', [0, 0, W, H]).attr('role', 'img')
    .attr('aria-label', 'Scatterplot of Women Business and the Law score against female labor force participation');
  const x = d3.scaleLinear([15, 100], [m.l, W - m.r]);
  const y = d3.scaleLinear([0, 100], [H - m.b, m.t]);

  svg.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(''));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(8));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d => d + '%'));
  svg.append('text').attr('class', 'muted').attr('x', (m.l + W - m.r) / 2).attr('y', H - 10).attr('text-anchor', 'middle')
    .text('Legal equality score, Women, Business and the Law index (100 = equal rights in the law)');
  svg.append('text').attr('class', 'muted').attr('transform', 'rotate(-90)').attr('x', -(H - m.b + m.t) / 2).attr('y', 14)
    .attr('text-anchor', 'middle').text('Women aged 15+ in the labor force (%)');

  const trend = svg.append('line').attr('stroke', 'currentColor').attr('stroke-dasharray', '5 4').attr('opacity', .6);
  const trendLabel = svg.append('text').attr('class', 'muted').attr('text-anchor', 'start');
  const dotLayer = svg.append('g');

  const pointsFor = yr => [...meta].map(([code, c]) => {
    const w = byInd.W.get(code)?.get(yr), f = byInd.F.get(code)?.get(yr);
    return w === undefined || f === undefined ? null
      : { code, name: c.TableName, region: c.Region, income: c.IncomeGroup, wbl: w, lfp: f };
  }).filter(Boolean);

  const legend = d3.select('#legend').selectAll('button').data(REGIONS).join('button')
    .attr('type', 'button').on('click', (_ev, d) => { state.selected = state.selected === d ? null : d; update(); })
    .on('mouseenter', (_ev, d) => { state.hover = d; update(); })
    .on('mouseleave', () => { state.hover = null; update(); });

  function render() {
    const pts = pointsFor(state.year);
    const f = focus();
    const op = d => (!f || f === d.region ? .75 : .08);

    dotLayer.selectAll('circle').data(pts, d => d.code).join(
      enter => enter.append('circle').attr('r', 5).attr('cx', d => x(d.wbl)).attr('cy', d => y(d.lfp))
        .attr('fill', d => COLORS[d.region]).attr('stroke', d => COLORS[d.region])
        .on('mousemove', (ev, d) => showTip(ev, `<b>${d.name}</b><br>${d.region}<br>${d.income}<br>Legal score: ${d.wbl.toFixed(1)}<br>Women in labor force: ${d.lfp.toFixed(1)}%`))
        .on('mouseleave', hideTip),
      update => update,
      exit => exit.remove()
    ).attr('cx', d => x(d.wbl)).attr('cy', d => y(d.lfp))
      .attr('fill-opacity', op).attr('stroke-opacity', d => (!f || f === d.region ? 1 : .15))
      .style('pointer-events', d => (!f || f === d.region ? null : 'none'));

    // least-squares fit over all dots shown (not only the focused region)
    const mx = d3.mean(pts, d => d.wbl), my = d3.mean(pts, d => d.lfp);
    const sxy = d3.sum(pts, d => (d.wbl - mx) * (d.lfp - my));
    const sxx = d3.sum(pts, d => (d.wbl - mx) ** 2), syy = d3.sum(pts, d => (d.lfp - my) ** 2);
    const slope = sxy / sxx, icpt = my - slope * mx, r = sxy / Math.sqrt(sxx * syy);
    const [x0, x1] = d3.extent(pts, d => d.wbl);
    trend.attr('x1', x(x0)).attr('x2', x(x1)).attr('y1', y(icpt + slope * x0)).attr('y2', y(icpt + slope * x1));
    trendLabel.attr('x', x(x0) + 4).attr('y', y(icpt + slope * x0) + 18).text(`Overall trend (r = ${r.toFixed(2)})`);

    legend.classed('off', d => f && f !== d)
      .html(d => `<i style="background:${COLORS[d]}"></i>${d} (${pts.filter(p => p.region === d).length})`);
    // Disclose who is missing: only countries with BOTH measures in the chosen year are plotted.
    const codes = [...meta.keys()];
    const has = (k, c) => byInd[k].get(c)?.has(state.year);
    const lfp = codes.filter(c => has('F', c) && has('M', c));
    const lfpNoWbl = lfp.filter(c => !has('W', c)).length;
    const wblNoLfp = codes.filter(c => has('W', c) && !(has('F', c) && has('M', c))).length;
    d3.select('#scatter-note').html(`<b>${state.year}:</b> ${pts.length} of the ${codes.length} countries in the World Bank country metadata are plotted: those with both a legal score and a labor force estimate. ${lfp.length} countries have labor force estimates; ${lfpNoWbl} of them have no legal score and are excluded. A further ${wblNoLfp} countries have a legal score but no labor force estimate and are also excluded. The regional counts in the legend are therefore smaller than the n shown on the line chart. The dashed line is a least-squares fit across the dots shown; r is the correlation. This is an association, not proof that laws cause higher participation. Click a region name to isolate it, or hover over a region name or a line in the first chart to preview it.`);
    d3.select('#year-out').text(state.year);
  }
  state.listeners.push(render);

  const slider = d3.select('#year').on('input', function () { state.year = +this.value; update(); });
  let timer = null;
  const stop = () => { clearInterval(timer); timer = null; d3.select('#play').html('&#9654; Play'); };
  d3.select('#play').on('click', () => {
    if (timer) return stop();
    if (state.year >= Y1) { state.year = Y0; slider.property('value', Y0); update(); }
    d3.select('#play').html('&#10073;&#10073; Pause');
    timer = setInterval(() => {
      if (state.year >= Y1) return stop();
      state.year++; slider.property('value', state.year); update();
    }, 450);
  });
  update();
}
