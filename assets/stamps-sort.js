(function () {
  var grid = document.getElementById('stamp-grid');
  if (!grid) return;

  var originals = Array.prototype.slice.call(grid.children);
  var buttons = document.querySelectorAll('#stamp-sorter [data-stamp-sort]');
  var toc = document.getElementById('stamp-toc');
  var pageHeader = document.querySelector('.wrapper > .sidebar > header') || document.querySelector('.wrapper > header');
  var tocMarker = document.createComment('stamp-toc-position');
  var sidebarMedia = window.matchMedia('(min-width: 1250px)');
  var nationalParkUnitTotal;
  var nationalParkUnitsEndpoint = 'https://en.wikipedia.org/w/api.php?action=parse&page=Template%3ANational_Park_Units&prop=wikitext&format=json&origin=*';
  var stampConfig = window.stampConfig || {};
  var typeGroupDefinitions = stampConfig.typeGroups || {};
  var regions = stampConfig.regions || {};
  var states = stampConfig.states || {};
  var typeGroups = {};

  Object.keys(typeGroupDefinitions).forEach(function (id) {
    var definition = typeGroupDefinitions[id];
    definition.codes.forEach(function (code) {
      typeGroups[code] = id;
    });
  });

  function number(value) { return Number(value) || 99; }

  function heading(level, className, text, id) {
    var element = document.createElement(level);
    element.className = className;
    element.textContent = text;
    element.id = id;
    return element;
  }

  function labelWithCount(label, count, total) {
    return label + ' (' + count + (total === undefined ? '' : '/' + total) + ')';
  }

  function clear(element) {
    while (element.firstChild) element.removeChild(element.firstChild);
  }

  function tocTotalLabel(currentTotal) {
    return '(' + currentTotal + (nationalParkUnitTotal ? '/' + nationalParkUnitTotal : '') + ')';
  }

  function updateTocTotal() {
    if (!toc) return;
    Array.prototype.forEach.call(toc.querySelectorAll('.stamp-toc-total'), function (total) {
      total.textContent = tocTotalLabel(total.dataset.currentTotal);
    });
  }

  function placeToc() {
    if (!toc || !pageHeader) return;
    var inSidebar = sidebarMedia.matches && !toc.hidden;
    if (inSidebar) {
      pageHeader.appendChild(toc);
      toc.classList.add('sidebar-directory');
    } else if (tocMarker.parentNode) {
      tocMarker.parentNode.insertBefore(toc, tocMarker.nextSibling);
      toc.classList.remove('sidebar-directory');
    }
    pageHeader.classList.toggle('has-sidebar-directory', inSidebar);
    updateSidebarTocHeight();
  }

  function updateSidebarTocHeight() {
    if (!toc || !pageHeader || toc.parentElement !== pageHeader || toc.hidden) {
      if (toc) toc.style.removeProperty('--sidebar-directory-height');
      return;
    }
    var availableHeight = Math.max(160, window.innerHeight - toc.getBoundingClientRect().top - 24);
    toc.style.setProperty('--sidebar-directory-height', availableHeight + 'px');
  }

  function createToc(total) {
    clear(toc);
    toc.hidden = false;
    var title = document.createElement('h2');
    title.className = 'stamp-toc-title sidebar-directory-heading';
    title.appendChild(document.createTextNode('目录 '));
    var totalLabel = document.createElement('span');
    totalLabel.className = 'stamp-toc-total';
    totalLabel.dataset.currentTotal = total;
    totalLabel.textContent = tocTotalLabel(total);
    title.appendChild(totalLabel);
    var list = document.createElement('ul');
    list.className = 'stamp-toc-list';
    toc.appendChild(title);
    toc.appendChild(list);
    return list;
  }

  function fetchNationalParkUnitTotal() {
    if (!window.fetch) return;
    window.fetch(nationalParkUnitsEndpoint)
      .then(function (response) {
        if (!response.ok) throw new Error('Wikipedia template request failed');
        return response.json();
      })
      .then(function (data) {
        var wikitext = data && data.parse && data.parse.wikitext && data.parse.wikitext['*'];
        var match = String(wikitext || '').match(/^\s*(\d{3,})/);
        if (!match) throw new Error('Wikipedia template total not found');
        nationalParkUnitTotal = Number(match[1]);
        updateTocTotal();
      })
      .catch(function () {});
  }

  function addTocItem(list, label, id) {
    var item = document.createElement('li');
    var link = document.createElement('a');
    link.href = '#' + id;
    link.textContent = label;
    link.dataset.stampHeadingId = id;
    item.appendChild(link);
    list.appendChild(item);
    return item;
  }

  function orderedDefinitions(definitions) {
    return Object.keys(definitions || {}).map(function (id) {
      return { id: id, definition: definitions[id] };
    }).sort(function (left, right) {
      return number(left.definition.order) - number(right.definition.order) || left.id.localeCompare(right.id);
    });
  }

  function appendCells(cells) {
    cells.forEach(function (cell) { grid.appendChild(cell); });
  }

  function renderRegionSections(cells, tocList) {
    var regionDefinitions = orderedDefinitions(regions);
    regionDefinitions.forEach(function (region, regionIndex) {
      var regionCells = cells.filter(function (cell) { return cell.dataset.regionId === region.id; });
      var regionNumber = regionIndex + 1;
      var regionId = 'stamp-region-' + regionNumber;
      var regionLabel = regionNumber + '. ' + labelWithCount(region.definition.name, regionCells.length);
      grid.appendChild(heading('h2', 'stamp-group-heading', regionLabel, regionId));
      var regionItem = addTocItem(tocList, regionLabel, regionId);
      var stateList = document.createElement('ul');
      stateList.className = 'stamp-toc-list stamp-toc-state-list';
      regionItem.appendChild(stateList);

      var regionStates = orderedDefinitions(states).filter(function (state) {
        return state.definition.region === region.id;
      });
      regionStates.forEach(function (state, stateIndex) {
        var stateCells = regionCells.filter(function (cell) { return cell.dataset.stateCode === state.id; });
        var stateNumber = stateIndex + 1;
        var stateId = regionId + '-state-' + stateNumber;
        var stateLabel = regionNumber + '.' + stateNumber + '. ' + labelWithCount(state.definition.name, stateCells.length);
        grid.appendChild(heading('h3', 'stamp-state-heading', stateLabel, stateId));
        addTocItem(stateList, stateLabel, stateId);
        appendCells(stateCells);
      });

      var unassignedCells = regionCells.filter(function (cell) {
        return !cell.dataset.stateCode || !states[cell.dataset.stateCode];
      });
      if (unassignedCells.length) {
        var unassignedNumber = regionStates.length + 1;
        var unassignedId = regionId + '-state-' + unassignedNumber;
        var unassignedLabel = regionNumber + '.' + unassignedNumber + '. ' + labelWithCount('跨州单位', unassignedCells.length);
        grid.appendChild(heading('h3', 'stamp-state-heading', unassignedLabel, unassignedId));
        addTocItem(stateList, unassignedLabel, unassignedId);
        appendCells(unassignedCells);
      }
    });

    var unclassifiedCells = cells.filter(function (cell) { return !regions[cell.dataset.regionId]; });
    if (unclassifiedCells.length) {
      var unclassifiedNumber = regionDefinitions.length + 1;
      var unclassifiedId = 'stamp-region-' + unclassifiedNumber;
      var unclassifiedLabel = unclassifiedNumber + '. ' + labelWithCount('未归类', unclassifiedCells.length);
      grid.appendChild(heading('h2', 'stamp-group-heading', unclassifiedLabel, unclassifiedId));
      addTocItem(tocList, unclassifiedLabel, unclassifiedId);
      appendCells(unclassifiedCells);
    }
  }

  function renderTypeSections(cells, tocList) {
    orderedDefinitions(typeGroupDefinitions).forEach(function (group) {
      var groupCells = cells.filter(function (cell) { return cell.dataset.stampGroup === group.id; });
      var typeNumber = number(group.definition.order);
      var typeId = 'stamp-type-' + typeNumber;
      var typeLabel = typeNumber + '. ' + labelWithCount(group.definition.name, groupCells.length, group.definition.total);
      grid.appendChild(heading('h2', 'stamp-group-heading', typeLabel, typeId));
      addTocItem(tocList, typeLabel, typeId);
      appendCells(groupCells);
    });
  }

  var activeTocHeadingId = '';

  function centerTocItem(item) {
    if (!item || !toc.classList.contains('sidebar-directory')) return;
    var itemRect = item.getBoundingClientRect();
    var tocRect = toc.getBoundingClientRect();
    toc.scrollBy({ top: itemRect.top - tocRect.top - (toc.clientHeight - itemRect.height) / 2, behavior: 'smooth' });
  }

  function syncTocToScroll() {
    if (toc.hidden) return;
    var headings = Array.prototype.slice.call(grid.querySelectorAll('.stamp-group-heading, .stamp-state-heading'));
    if (!headings.length) return;
    var current = headings.slice().reverse().find(function (item) { return item.getBoundingClientRect().top <= 96; }) || headings[0];
    if (current.id === activeTocHeadingId) return;
    activeTocHeadingId = current.id;
    var activeLink;
    Array.prototype.forEach.call(toc.querySelectorAll('[data-stamp-heading-id]'), function (link) {
      var active = link.dataset.stampHeadingId === current.id;
      link.classList.toggle('is-active', active);
      if (active) activeLink = link;
    });
    centerTocItem(activeLink);
  }

  function render(mode) {
    clear(grid);
    if (mode === 'number') {
      clear(toc);
      toc.hidden = true;
    }
    var cells = originals.slice();
    if (mode === 'type') {
      cells = [];
      originals.forEach(function (cell) {
        var includedGroups = {};
        cell.dataset.types.split(' ').filter(Boolean).forEach(function (type) {
          var groupId = typeGroups[type];
          if (!groupId || includedGroups[groupId]) return;
          includedGroups[groupId] = true;
          var copy = cell.cloneNode(true);
          copy.dataset.stampGroup = groupId;
          cells.push(copy);
        });
      });
    }
    var stampTotal = originals.filter(function (cell) { return cell.dataset.types; }).length;
    var tocList = mode === 'number' ? null : createToc(stampTotal);
    activeTocHeadingId = '';
    if (mode === 'region') renderRegionSections(cells, tocList);
    else if (mode === 'type') renderTypeSections(cells, tocList);
    else appendCells(cells);
    buttons.forEach(function (button) {
      var active = button.dataset.stampSort === mode;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('active', active);
    });
    placeToc();
    syncTocToScroll();
  }

  toc.parentNode.insertBefore(tocMarker, toc);
  sidebarMedia.addEventListener('change', function () {
    placeToc();
    syncTocToScroll();
  });
  window.addEventListener('resize', updateSidebarTocHeight);
  var scrollTicking = false;
  window.addEventListener('scroll', function () {
    if (scrollTicking) return;
    scrollTicking = true;
    window.requestAnimationFrame(function () {
      scrollTicking = false;
      updateSidebarTocHeight();
      syncTocToScroll();
    });
  }, { passive: true });
  fetchNationalParkUnitTotal();
  placeToc();
  buttons.forEach(function (button) { button.addEventListener('click', function () { render(button.dataset.stampSort); }); });
}());
