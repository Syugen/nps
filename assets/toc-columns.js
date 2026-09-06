'use strict';

(function() {
  var minimumWidth = 800;
  var minimumLines = 6;
  var lists = Array.prototype.slice.call(document.querySelectorAll('ul.toc-list'));
  var resizeFrame;

  function entriesIn(list) {
    return Array.prototype.filter.call(list.children, function(child) {
      return child.tagName === 'LI';
    });
  }

  // One primary bullet plus every bullet nested beneath it counts as one unit group.
  // Natural text wrapping is intentionally not counted.
  function lineCount(entry) {
    return 1 + entry.querySelectorAll('li').length;
  }

  function restoreList(list) {
    var columns = list.parentElement;
    if (!columns || !columns.classList.contains('toc-columns')) {
      return;
    }

    var rightList = columns.querySelector('.toc-list--right');
    while (rightList && rightList.firstElementChild) {
      list.appendChild(rightList.firstElementChild);
    }

    list.classList.remove('toc-list--left');
    columns.parentNode.insertBefore(list, columns);
    columns.remove();
  }

  function splitList(list, entries, totalLines) {
    var target = Math.ceil(totalLines / 2);
    var leftLines = 0;
    var splitAt = 0;

    // Stop only after the left column reaches half, so an uneven split always
    // keeps the extra bullet group on the left.
    while (splitAt < entries.length && leftLines < target) {
      leftLines += lineCount(entries[splitAt]);
      splitAt += 1;
    }

    // A single unsplittable primary bullet remains one column.
    if (splitAt === entries.length) {
      return;
    }

    var columns = document.createElement('div');
    columns.className = 'toc-columns';
    var rightList = document.createElement('ul');
    rightList.className = 'toc-list toc-list--right';

    list.classList.add('toc-list--left');
    list.parentNode.insertBefore(columns, list);
    columns.appendChild(list);
    columns.appendChild(rightList);

    entries.slice(splitAt).forEach(function(entry) {
      rightList.appendChild(entry);
    });
  }

  function updateList(list) {
    restoreList(list);

    var entries = entriesIn(list);
    var totalLines = entries.reduce(function(total, entry) {
      return total + lineCount(entry);
    }, 0);

    if (list.parentElement.clientWidth >= minimumWidth && totalLines >= minimumLines) {
      splitList(list, entries, totalLines);
    }
  }

  function updateAll() {
    lists.forEach(updateList);
  }

  function requestUpdate() {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(updateAll);
  }

  updateAll();
  window.addEventListener('resize', requestUpdate);
}());
