(() => {
  let SHOW_HONEST = false;
  const START = 2000, END = 2020, TOP_N = 15;
  const INDICATOR = 'SG.GEN.PARL.ZS';
  const AGGREGATES = new Set([
    'AFE', 'AFW', 'ARB', 'CEB', 'CSS', 'EAP', 'EAR', 'EAS', 'ECA', 'ECS',
    'EMU', 'EUU', 'FCS', 'HIC', 'HPC', 'IBD', 'IBT', 'IDA', 'IDB', 'IDX',
    'INX', 'LAC', 'LCN', 'LDC', 'LIC', 'LMC', 'LMY', 'LTE', 'MEA', 'MIC',
    'MNA', 'NAC', 'OED', 'OSS', 'PRE', 'PSS', 'PST', 'SAS', 'SSA', 'SSF',
    'SST', 'TEA', 'TEC', 'TLA', 'TMN', 'TSA', 'TSS', 'UMC', 'WLD',
  ]);
  const svg = d3.select('#blackhat-svg');
  const chartNode = document.getElementById('blackhat-chart');
  const tooltip = d3.select('.bh-tooltip');
  const resetButton = d3.select('#blackhat-reset');
  const backButton = d3.select('#blackhat-back');
  const detailNav = d3.select('#blackhat-detail-nav');
  const previousButton = d3.select('#blackhat-prev');
  const nextButton = d3.select('#blackhat-next');
  const sparklineContainer = d3.select('#blackhat-sparklines');
  const legend = d3.select('#blackhat-legend');
  let countries = [];
  let ranked = [];
  let colorFor = () => 'var(--accent)';
  let width = 880;
  let view = 'main';
  let selectedCountry = null;
  let updateMainScroll = () => {};
  const formatPct = d3.format('.0f');
  const formatShare = d3.format('.1f');
  const formatChange = d3.format('+.1f');
  const formatPctLabel = d3.format('+.0f');

  function showTip(event, html) {
    const pointerX = Number.isFinite(event.clientX) ? event.clientX : 0;
    const pointerY = Number.isFinite(event.clientY) ? event.clientY : 0;
    tooltip.html(html).style('opacity', 1).style('visibility', 'visible')
      .style('left', `${Math.max(8, Math.min(pointerX + 14, innerWidth - 270))}px`)
      .style('top', `${Math.max(8, pointerY + 14)}px`);
  }

  function showBarTip(event, country, rank) {
    const rect = event.currentTarget.getBoundingClientRect();
    const pointer = event.type === 'focus' || !Number.isFinite(event.clientX)
      ? { clientX: rect.left + rect.width / 2, clientY: rect.top }
      : event;
    const change = SHOW_HONEST ? country.absoluteChange : country.pctChange;
    const metric = SHOW_HONEST ? 'percentage-point change' : 'percent change';
    showTip(pointer,
      `<b>${country.country}</b><br>Rank: ${rank}<br>${metric}: ${formatChange(change)}${SHOW_HONEST ? ' pp' : '%'}<br>${START}: ${formatShare(country.start)}% → ${END}: ${formatShare(country.end)}%`);
  }

  function hideTip() {
    tooltip.style('opacity', 0).style('visibility', 'hidden').html('');
  }

  function setViewBox(height) {
    svg.attr('viewBox', `0 0 ${width} ${height}`);
  }

  function setError(error) {
    console.error('Black hat visualization failed to load or render.', error);
    svg.selectAll('*').remove();
    setViewBox(120);
    svg.append('text').attr('x', 16).attr('y', 40).attr('class', 'muted')
      .text('The visualization could not be loaded. Check the console for details.');
  }

  // Load
  svg.append('text').attr('x', 16).attr('y', 40).attr('class', 'muted')
    .text('Loading parliamentary data…');
  d3.text('gender-raw-2021.csv').then(raw => {
    const header = '"Country Name","Country Code","Indicator Name","Indicator Code"';
    const headerOffset = raw.indexOf(header);
    if (headerOffset < 0) throw new Error('Could not find the country data header in gender-raw-2021.csv.');
    const rows = d3.csvParse(raw.slice(headerOffset));

    // Transform
    const zeroBaseline = [];
    countries = rows
      .filter(row => row['Indicator Code'] === INDICATOR && !AGGREGATES.has(row['Country Code']))
      .map(row => {
        const start = Number(row[String(START)]);
        const end = Number(row[String(END)]);
        if (row[String(START)] === '' || row[String(END)] === '' ||
            !Number.isFinite(start) || !Number.isFinite(end)) return null;
        const series = rows.columns
          .filter(name => /^\d{4}$/.test(name))
          .map(Number)
          .filter(year => year >= 1997 && year <= END && row[String(year)] !== '' && Number.isFinite(Number(row[String(year)])))
          .map(year => ({ year, value: Number(row[String(year)]) }))
          .sort((a, b) => a.year - b.year);
        const record = {
          country: row['Country Name'],
          countryCode: row['Country Code'],
          start,
          end,
          absoluteChange: end - start,
          series,
        };
        if (start === 0) {
          // BLACK HAT: Countries with zero starting share are omitted from percent-change ranking; the write-up log exposes which cases this removes.
          zeroBaseline.push({ country: record.country, countryCode: record.countryCode, start, end });
          return record;
        }
        record.pctChange = (end / start - 1) * 100;
        return record;
      })
      .filter(Boolean);

    console.table(zeroBaseline);
    const colorOrder = countries.slice().sort((a, b) => d3.ascending(a.country, b.country));
    const colorCount = Math.max(colorOrder.length, 1);
    const countryColors = d3.quantize(d3.interpolateRainbow, colorCount + 1).slice(0, colorCount);
    const colors = d3.scaleOrdinal(colorOrder.map(country => country.countryCode), countryColors);
    colorFor = country => colors(country.countryCode);
    const defaultRanked = countries.filter(country => country.start !== 0)
      .sort((a, b) => d3.descending(a.pctChange, b.pctChange));
    const topDefault = defaultRanked.slice(0, TOP_N);
    // BLACK HAT: Compare the selected top 15's average starting/ending values with the all-country starting average.
    console.table([{
      measure: 'Top 15 average starting level',
      value: d3.mean(topDefault, country => country.start),
    }, {
      measure: 'All-country average starting level',
      value: d3.mean(countries, country => country.start),
    }, {
      measure: 'Top 15 average ending level',
      value: d3.mean(topDefault, country => country.end),
    }]);
    updateRanking();
    render();
  }).catch(setError);

  function updateRanking() {
    // BLACK HAT: Ranking by relative change favors countries that started near zero; honest mode instead orders by absolute percentage-point gain.
    ranked = countries.filter(country => SHOW_HONEST || country.start !== 0).sort((a, b) => SHOW_HONEST
      ? d3.descending(a.absoluteChange, b.absoluteChange)
      : d3.descending(a.pctChange, b.pctChange));
  }

  // Scales
  function xScaleFor(plotWidth) {
    const change = country => SHOW_HONEST ? country.absoluteChange : country.pctChange;
    const minChange = d3.min(ranked, change) ?? 0;
    const maxChange = d3.max(ranked, change) ?? 0;
    return d3.scaleLinear()
      .domain([Math.min(0, minChange), maxChange * 1.12 || 1])
      .range([0, plotWidth]);
  }

  // Draw
  function render() {
    hideTip();
    svg.selectAll('*').remove();
    d3.select(chartNode).select('.bh-scroll-spacer').remove();
    resetButton.property('hidden', view !== 'main');
    backButton.property('hidden', view !== 'detail');
    detailNav.property('hidden', view !== 'detail');
    chartNode.classList.toggle('bh-main-scroll', view === 'main');
    sparklineContainer.selectAll('*').remove();
    if (view === 'main') {
      chartNode.scrollTop = 0;
      drawMain();
    } else {
      updateMainScroll = () => {};
      drawDetail();
    }
  }

  function updateLegend(items) {
    legend.selectAll('.bh-legend-item').data(items, country => country.countryCode)
      .join(enter => {
        const item = enter.append('span').attr('class', 'bh-legend-item').attr('role', 'listitem');
        item.append('i').attr('class', 'bh-swatch').attr('aria-hidden', 'true');
        item.append('span');
        return item;
      })
      .each(function (country) {
        const item = d3.select(this);
        item.select('.bh-swatch').style('background-color', colorFor(country));
        item.select('span').text(country.country);
      });
  }

  function openCountry(country) {
    selectedCountry = country;
    view = 'detail';
    render();
  }

  function drawMain() {
    const height = 460;
    const margin = { top: 16, right: 32, bottom: 52, left: 164 };
    const plotWidth = Math.max(140, width - margin.left - margin.right);
    const plotHeight = height - margin.top - margin.bottom;
    const rowHeight = plotHeight / TOP_N;
    // BLACK HAT: The viewport begins with only the highest-ranked 15 countries; the rest of the distribution is below the fold.
    const contentHeight = Math.max(plotHeight, ranked.length * rowHeight);
    setViewBox(height);

    const x = xScaleFor(plotWidth);
    const initialY = d3.scaleLinear().domain([0, ranked.length]).range([0, contentHeight]);
    const chart = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const clipId = 'bh-ranked-clip';
    const defs = svg.append('defs');
    defs.append('clipPath').attr('id', clipId)
      .append('rect').attr('x', -margin.left).attr('y', 0)
      .attr('width', plotWidth + margin.left).attr('height', plotHeight);

    const panSurface = chart.insert('rect', ':first-child').attr('class', 'bh-pan-surface')
      .attr('width', plotWidth).attr('height', plotHeight)
      .attr('fill', 'transparent').attr('pointer-events', 'all');
    const marks = chart.append('g').attr('clip-path', `url(#${clipId})`);
    svg.append('g').attr('class', 'axis')
      .attr('transform', `translate(${margin.left},${margin.top + plotHeight})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat(value => `${formatPct(value)}${SHOW_HONEST ? ' pp' : '%'}`));
    svg.append('text').attr('class', 'muted')
      .attr('x', margin.left + plotWidth / 2).attr('y', height - 8).attr('text-anchor', 'middle')
      .text(SHOW_HONEST ? 'Change since 2000 (percentage points)' : 'Change since 2000 (%)');
    svg.append('line').attr('x1', margin.left + x(0)).attr('x2', margin.left + x(0))
      .attr('y1', margin.top).attr('y2', margin.top + plotHeight)
      .attr('stroke', 'var(--line)');

    const row = marks.selectAll('.bh-row').data(ranked).join('g')
      .attr('class', 'bh-row').attr('tabindex', 0).attr('role', 'button')
      .attr('aria-label', (country, index) =>
        `${country.country}, rank ${index + 1}, ${formatChange(changeValue(country))}${SHOW_HONEST ? ' percentage points' : ' percent'}`);
    const stems = row.append('line').attr('class', 'bh-stem')
      .attr('x1', x(0))
      .attr('x2', country => x(changeValue(country)))
      .attr('y1', (_, index) => initialY(index) + rowHeight / 2)
      .attr('y2', (_, index) => initialY(index) + rowHeight / 2)
      .attr('stroke', country => colorFor(country)).attr('stroke-width', 2);
    const dots = row.append('circle').attr('class', 'bh-dot')
      .attr('cx', country => x(changeValue(country)))
      .attr('cy', (_, index) => initialY(index) + rowHeight / 2)
      .attr('r', 5).attr('fill', country => colorFor(country));
    row
      .on('mouseenter focus', function (event, country) {
        if (event.type === 'focus') {
          const index = ranked.indexOf(country);
          chartNode.scrollTop = Math.max(0, initialY(index) + rowHeight / 2 - plotHeight / 2);
          updateMainScroll();
        }
        showBarTip(event, country, ranked.indexOf(country) + 1);
      })
      .on('mousemove', function (event, country) {
        showBarTip(event, country, ranked.indexOf(country) + 1);
      })
      .on('mouseleave blur', hideTip)
      .on('click', (event, country) => {
        if (event.defaultPrevented) return;
        openCountry(country);
      })
      .on('keydown', (event, country) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openCountry(country);
        }
      });

    row.append('text').attr('class', 'bh-country')
      .attr('x', -10)
      .attr('y', (_, index) => initialY(index) + rowHeight / 2 + 4)
      .attr('text-anchor', 'end').attr('font-size', 12)
      .text(country => SHOW_HONEST
        ? `${country.country} · ${formatShare(country.end)}%`
        : country.country);
    // BLACK HAT: Default lollipop labels show relative change, not actual seat-share levels, which are left to the tooltip.
    const valueLabels = row.append('text').attr('class', 'bh-value')
      .attr('y', (_, index) => initialY(index) + rowHeight / 2 + 4)
      .attr('font-size', 11)
      .attr('text-anchor', country => labelInside(country) ? 'end' : 'start')
      .attr('x', country => {
        const value = changeValue(country);
        if (value < 0) return x(value) - 6;
        return x(value) + (labelInside(country) ? -6 : 6);
      })
      .text(country => SHOW_HONEST
        ? `${formatChange(country.absoluteChange)} pp · 2020 ${formatShare(country.end)}%`
        : `${formatPctLabel(country.pctChange)}%`);
    const labelBoxes = valueLabels.nodes().map(label => label.getBBox());
    const labelBackgrounds = row.insert('rect', '.bh-value')
      .attr('class', 'bh-value-bg')
      .attr('x', (_, index) => labelBoxes[index].x - 4)
      .attr('y', (_, index) => labelBoxes[index].y - 2)
      .attr('width', (_, index) => labelBoxes[index].width + 8)
      .attr('height', (_, index) => labelBoxes[index].height + 4)
      .attr('rx', 2)
      .attr('fill', 'var(--bg)')
      .attr('stroke', 'var(--line)')
      .attr('stroke-width', 0.5)
      .attr('opacity', 0.96)
      .attr('pointer-events', 'none');

    const spacerHeight = Math.max(0, contentHeight - plotHeight);
    d3.select(chartNode).append('div').attr('class', 'bh-scroll-spacer')
      .style('height', `${spacerHeight}px`).attr('aria-hidden', 'true');
    const updateScroll = () => {
      const scrollTop = chartNode.scrollTop;
      const rowCenter = index => initialY(index) + rowHeight / 2 - scrollTop;
      stems.attr('y1', (_, index) => rowCenter(index))
        .attr('y2', (_, index) => rowCenter(index));
      dots.attr('cy', (_, index) => rowCenter(index));
      row.select('.bh-country').attr('y', (_, index) => rowCenter(index) + 4);
      valueLabels.attr('y', (_, index) => rowCenter(index) + 4);
      labelBackgrounds.attr('y', (_, index) => labelBoxes[index].y - 2 - scrollTop);
      updateLegend(ranked.filter((_, index) => {
        const centerY = rowCenter(index);
        return centerY >= 0 && centerY < plotHeight;
      }));
    };
    updateMainScroll = updateScroll;
    chartNode.scrollTop = 0;
    updateScroll();
    dots.attr('r', 0).transition().duration(400).attr('r', 5);
    stems.attr('opacity', 0).transition().duration(400).attr('opacity', 1);

    let dragStart = null;
    panSurface
      .on('pointerdown', event => {
        if (event.pointerType !== 'mouse' || event.button !== 0) return;
        dragStart = { y: event.clientY, scrollTop: chartNode.scrollTop, pointerId: event.pointerId };
        chartNode.setPointerCapture(event.pointerId);
        event.preventDefault();
      });
    chartNode.onpointermove = event => {
      if (!dragStart || event.pointerId !== dragStart.pointerId) return;
      chartNode.scrollTop = dragStart.scrollTop - (event.clientY - dragStart.y);
      updateMainScroll();
    };
    chartNode.onpointerup = chartNode.onpointercancel = event => {
      if (!dragStart || event.pointerId !== dragStart.pointerId) return;
      if (chartNode.hasPointerCapture(event.pointerId)) chartNode.releasePointerCapture(event.pointerId);
      dragStart = null;
    };

    function changeValue(country) {
      return SHOW_HONEST ? country.absoluteChange : country.pctChange ?? -Infinity;
    }

    function labelInside(country) {
      const value = changeValue(country);
      const labelWidth = SHOW_HONEST ? 132 : 52;
      return value < 0 || x(value) + labelWidth > plotWidth;
    }

    resetButton.on('click', () => {
      chartNode.scrollTo({ top: 0, behavior: 'auto' });
      updateMainScroll();
    });
  }

  function drawDetail() {
    const country = selectedCountry;
    const height = 500;
    const margin = { top: 118, right: 28, bottom: 52, left: 64 };
    const plotWidth = Math.max(140, width - margin.left - margin.right);
    const plotHeight = height - margin.top - margin.bottom;
    setViewBox(height);
    const countryIndex = ranked.indexOf(country);
    const countryColor = colorFor(country);
    const nextCountries = ranked.slice(countryIndex + 1, countryIndex + 6);
    const headline = SHOW_HONEST
      ? `${formatChange(country.absoluteChange)} pp`
      : `${formatPctLabel(country.pctChange)}%`;

    // BLACK HAT: The large change headline is given visual priority over the narrower country-specific trend below it.
    svg.append('text').attr('class', 'bh-country-title').attr('x', 12).attr('y', 22)
      .text(`${country.country} · Rank ${countryIndex + 1}`);
    svg.append('text').attr('class', 'bh-headline').attr('x', width / 2).attr('y', 66)
      .attr('text-anchor', 'middle').style('fill', countryColor).text(headline);
    svg.append('text').attr('class', 'bh-headline-note').attr('x', width / 2).attr('y', 86)
      .attr('text-anchor', 'middle').text('since 2000');

    previousButton.property('disabled', countryIndex <= 0);
    nextButton.property('disabled', countryIndex >= ranked.length - 1);
    updateLegend([country, ...nextCountries]);
    drawSparklines(nextCountries);

    const points = country.series;
    if (points.length < 2) {
      svg.append('text').attr('x', 16).attr('y', margin.top + 24).attr('class', 'muted')
        .text('Not enough yearly data to draw a trend.');
      return;
    }
    const x = d3.scaleLinear().domain(d3.extent(points, point => point.year)).range([0, plotWidth]);
    // BLACK HAT: The detail view auto-scales the y-axis to this country alone and omits 50% and global-average references, making modest rises look steeper.
    const extent = d3.extent(points, point => point.value);
    const padding = (extent[1] - extent[0] || 1) * 0.08;
    const y = d3.scaleLinear().domain([extent[0] - padding, extent[1] + padding]).range([plotHeight, 0]);
    const plot = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    const gradientId = `bh-gradient-${country.countryCode}`;
    const gradient = svg.append('defs').append('linearGradient').attr('id', gradientId)
      .attr('x1', '0').attr('x2', '0').attr('y1', '0').attr('y2', '1');
    gradient.append('stop').attr('offset', '0%').attr('stop-color', countryColor).attr('stop-opacity', 0.34);
    gradient.append('stop').attr('offset', '100%').attr('stop-color', countryColor).attr('stop-opacity', 0.02);
    plot.append('g').attr('class', 'grid')
      .call(d3.axisLeft(y).ticks(6).tickSize(-plotWidth).tickFormat(''));
    plot.append('g').attr('class', 'axis')
      .call(d3.axisLeft(y).ticks(6).tickFormat(value => `${formatShare(value)}%`));
    plot.append('g').attr('class', 'axis').attr('transform', `translate(0,${plotHeight})`)
      .call(d3.axisBottom(x).ticks(8).tickFormat(d3.format('d')));
    plot.append('path').datum(points).attr('class', 'bh-area')
      .attr('d', d3.area().x(point => x(point.year)).y0(plotHeight).y1(point => y(point.value)))
      .attr('fill', `url(#${gradientId})`).attr('opacity', 0)
      .transition().duration(450).attr('opacity', 1);
    const line = plot.append('path').datum(points).attr('class', 'bh-detail-line')
      .attr('d', d3.line().x(point => x(point.year)).y(point => y(point.value)))
      .attr('fill', 'none').attr('stroke', countryColor).attr('stroke-width', 2.8);
    const lineNode = line.node();
    const lineLength = lineNode.getTotalLength();
    line.attr('stroke-dasharray', `${lineLength} ${lineLength}`).attr('stroke-dashoffset', lineLength)
      .transition().duration(900).ease(d3.easeLinear).attr('stroke-dashoffset', 0);
    plot.selectAll('.bh-point').data(points).join('circle')
      .attr('class', 'bh-point').attr('cx', point => x(point.year)).attr('cy', point => y(point.value))
      .attr('r', 3.2).attr('fill', countryColor).attr('opacity', 0).attr('tabindex', 0)
      .on('mouseenter', (event, point) => showTip(event,
        `<b>${country.country}</b><br>${point.year}: ${formatShare(point.value)}%`))
      .on('mousemove', (event, point) => showTip(event,
        `<b>${country.country}</b><br>${point.year}: ${formatShare(point.value)}%`))
      .on('focus', function (event, point) {
        const rect = event.currentTarget.getBoundingClientRect();
        showTip({ clientX: rect.left + rect.width / 2, clientY: rect.top },
          `<b>${country.country}</b><br>${point.year}: ${formatShare(point.value)}%`);
      })
      .on('mouseleave', hideTip);
    svg.append('text').attr('class', 'muted').attr('transform', 'rotate(-90)')
      .attr('x', -(margin.top + plotHeight / 2)).attr('y', 18).attr('text-anchor', 'middle')
      .text('Women’s share of parliamentary seats (%)');
    svg.append('text').attr('class', 'muted').attr('x', margin.left + plotWidth / 2)
      .attr('y', height - 8).attr('text-anchor', 'middle').text('Year');
    plot.selectAll('.bh-point').transition().delay(650).duration(300).attr('opacity', 1);
  }

  function drawSparklines(items) {
    const cards = sparklineContainer.selectAll('button.bh-sparkline').data(items, country => country.countryCode)
    .join('button').attr('class', 'bh-sparkline').attr('type', 'button')
    .attr('aria-label', country =>
      `Open rank ${ranked.indexOf(country) + 1}: ${country.country}, ${formatChange(SHOW_HONEST ? country.absoluteChange : country.pctChange)}${SHOW_HONEST ? ' percentage points' : ' percent'}`)
    .on('click', (_, country) => openCountry(country));
    cards.each(function (country) {
    const card = d3.select(this);
    card.selectAll('*').remove();
    const mini = card.append('svg').attr('viewBox', '0 0 100 30').attr('aria-hidden', 'true');
    if (country.series.length > 1) {
      const miniX = d3.scaleLinear().domain(d3.extent(country.series, point => point.year)).range([2, 98]);
      const miniExtent = d3.extent(country.series, point => point.value);
      const miniY = d3.scaleLinear()
        .domain([miniExtent[0] - 1, miniExtent[1] + 1]).range([26, 4]);
      mini.append('path').datum(country.series)
        .attr('d', d3.line().x(point => miniX(point.year)).y(point => miniY(point.value)))
        .attr('fill', 'none').attr('stroke', colorFor(country)).attr('stroke-width', 1.8);
    }
    card.append('span').text(`${ranked.indexOf(country) + 1}. ${country.country}`);
    });
  }

  // Interactions
  chartNode.addEventListener('scroll', () => updateMainScroll(), { passive: true });
  chartNode.addEventListener('wheel', () => requestAnimationFrame(() => updateMainScroll()), { passive: true });
  chartNode.addEventListener('keydown', event => {
    if (view !== 'main' || event.target !== chartNode) return;
    const pageStep = chartNode.clientHeight * 0.85;
    if (event.key === 'PageDown' || event.key === ' ') chartNode.scrollTop += pageStep;
    else if (event.key === 'PageUp') chartNode.scrollTop -= pageStep;
    else if (event.key === 'ArrowDown') chartNode.scrollTop += 48;
    else if (event.key === 'ArrowUp') chartNode.scrollTop -= 48;
    else if (event.key === 'Home') chartNode.scrollTop = 0;
    else if (event.key === 'End') chartNode.scrollTop = chartNode.scrollHeight;
    else return;
    updateMainScroll();
    event.preventDefault();
  });
  backButton.on('click', () => {
    view = 'main';
    render();
  });
  previousButton.on('click', () => {
    const index = ranked.indexOf(selectedCountry);
    if (index > 0) openCountry(ranked[index - 1]);
  });
  nextButton.on('click', () => {
    const index = ranked.indexOf(selectedCountry);
    if (index >= 0 && index < ranked.length - 1) openCountry(ranked[index + 1]);
  });
  document.addEventListener('keydown', event => {
    const target = event.target;
    const editing = target instanceof HTMLElement &&
      (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
    if (event.key.toLowerCase() !== 'h' || event.altKey || event.ctrlKey || event.metaKey || editing || !countries.length) return;
    SHOW_HONEST = !SHOW_HONEST;
    view = 'main';
    selectedCountry = null;
    updateRanking();
    render();
  });
  const resizeObserver = new ResizeObserver(entries => {
    const nextWidth = Math.floor(entries[0].contentRect.width);
    if (nextWidth > 0 && Math.abs(nextWidth - width) > 1) {
      width = nextWidth;
      if (countries.length) render();
    }
  });
  resizeObserver.observe(chartNode);
})();
