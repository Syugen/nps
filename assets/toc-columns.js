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

  // 一级条目及其全部嵌套条目作为不可拆分的一组；文字自然换行不计入行数。
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

    // 左栏达到总行数一半后才停止；无法均分时，多出的完整一级条目放在左栏。
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
