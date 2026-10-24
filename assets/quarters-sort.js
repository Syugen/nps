(function () {
  var grid = document.getElementById('quarters-grid');
  if (!grid) return;

  var cards = Array.prototype.slice.call(grid.querySelectorAll('.quarter-entry'));
  var summary = document.getElementById('quarters-summary');
  var photos = {};

  function dateFromCode(code) {
    var match = /^(\d{2})(\d{2})(\d{2})$/.exec(code);
    if (!match) return null;
    var year = 2000 + Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    var date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return { sortKey: code, label: year + '.' + match[2] + '.' + match[3] };
  }

  (window.quarterPhotoFiles || []).forEach(function (path) {
    var filename = path.split('/').pop();
    var match = /^([A-Z]{2})_(\d{6})\.webp$/i.exec(filename);
    if (!match) return;
    var state = match[1].toUpperCase();
    var date = dateFromCode(match[2]);
    if (!date) return;
    var photo = { path: path, date: date };
    if (!photos[state] || photo.date.sortKey > photos[state].date.sortKey) photos[state] = photo;
  });

  cards.forEach(function (card) {
    var photo = photos[card.dataset.state];
    var replicaIndex = card.querySelector('[data-replica-index]');
    if (!photo) {
      if (replicaIndex) replicaIndex.hidden = true;
      return;
    }
    if (replicaIndex) replicaIndex.hidden = false;

    var visit = card.querySelector('[data-visit]');
    var image = document.createElement('img');
    image.src = photo.path;
    image.alt = card.dataset.stateName + ' · ' + card.dataset.park + ' 到访照片';
    image.loading = 'lazy';
    image.decoding = 'async';
    visit.replaceChildren(image);

    var dateLabel = document.createElement('span');
    dateLabel.className = 'quarter-visit-date';
    dateLabel.textContent = photo.date.label;
    visit.appendChild(dateLabel);
    card.dataset.visitDate = photo.date.sortKey;
  });

  cards.sort(function (left, right) {
    var leftDate = left.dataset.visitDate || '';
    var rightDate = right.dataset.visitDate || '';
    if (leftDate && rightDate) return rightDate.localeCompare(leftDate) || left.dataset.state.localeCompare(right.dataset.state);
    if (leftDate) return -1;
    if (rightDate) return 1;
    return left.dataset.state.localeCompare(right.dataset.state);
  }).forEach(function (card) {
    grid.appendChild(card);
  });

  var visitedCount = Object.keys(photos).filter(function (state) {
    return cards.some(function (card) { return card.dataset.state === state; });
  }).length;
  summary.textContent = '共 ' + cards.length + ' 枚 · 已到访 ' + visitedCount + ' 处';
}());
