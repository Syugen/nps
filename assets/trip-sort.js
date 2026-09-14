document.addEventListener("DOMContentLoaded", () => {
  const list = document.querySelector("#trip-list");
  const sorter = document.querySelector("#trip-sorter");
  const filter = document.querySelector("#trip-filter");
  const summary = document.querySelector("#trip-summary");
  const contentSection = list?.closest("section");
  const sortButtons = document.querySelectorAll("#trip-sorter [data-sort]");
  const mileageSortButton = document.querySelector(
    '#trip-sorter [data-sort="mileage-desc"]'
  );
  const filterButtons = document.querySelectorAll("#trip-filter [data-filter]");
  const detailToggle = document.querySelector("#trip-details-toggle");
  const detailPanel = document.querySelector("#trip-details-panel");
  const maps = document.querySelectorAll("[data-trip-map]");
  let currentSort = "mileage-desc";
  let currentFilter = "drive";

  if (!list || !sorter || !filter || !summary || !sortButtons.length || !filterButtons.length) return;

  const regionOrder = (sorter.dataset.regionOrder || "")
    .split("|")
    .filter(Boolean);
  const regionRank = new Map(regionOrder.map((region, index) => [region, index]));

  const getEntries = () => [...list.querySelectorAll(":scope > .trip-entry")];

  const matchesFilter = (entry) =>
    currentFilter === "all" || entry.dataset.tripType === "drive";

  const updateSortAvailability = () => {
    if (!mileageSortButton) return;

    const unavailable = currentFilter === "all";
    mileageSortButton.disabled = unavailable;
    mileageSortButton.setAttribute("aria-disabled", String(unavailable));
  };

  const setMapExpanded = (map, expanded) => {
    const button = map.querySelector(".trip-map-toggle");
    const panel = map.querySelector(".trip-map-panel");
    if (!button || !panel) return;

    panel.classList.toggle("is-expanded", expanded);
    button.textContent = expanded ? "隐藏地图" : "查看地图";
    button.setAttribute("aria-expanded", String(expanded));
  };

  const updateMapPresentation = () => {
    const showMapsDirectly = currentFilter === "drive";
    maps.forEach((map) => {
      const button = map.querySelector(".trip-map-toggle");
      if (!button) return;

      button.hidden = showMapsDirectly;
      if (showMapsDirectly) {
        setMapExpanded(map, true);
      } else if (map.dataset.filterMode !== "all") {
        setMapExpanded(map, false);
      }
      map.dataset.filterMode = currentFilter;
    });
  };

  maps.forEach((map) => {
    const button = map.querySelector(".trip-map-toggle");
    if (!button) return;
    button.addEventListener("click", () => {
      setMapExpanded(map, button.getAttribute("aria-expanded") !== "true");
    });
  });

  if (detailToggle && detailPanel) {
    detailToggle.addEventListener("click", () => {
      const expanded = detailToggle.getAttribute("aria-expanded") !== "true";
      detailToggle.setAttribute("aria-expanded", String(expanded));
      detailToggle.textContent = expanded ? "隐藏无聊的细节" : "查看无聊的细节";
      detailPanel.classList.toggle("is-expanded", expanded);
      detailPanel.setAttribute("aria-hidden", String(!expanded));
    });
  }

  const sequenceOf = (entry) => {
    const node = entry.querySelector("trip-seq");
    const value = Number(node?.textContent.trim());
    return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
  };

  const distanceValue = (node) => {
    if (!node) return null;

    const rawValue = node.textContent.trim();
    if (!rawValue) return null;

    const value = Number(rawValue.replace(/,/g, ""));
    return Number.isFinite(value) ? value : null;
  };

  const formatDistance = (value) => Math.round(value).toString();

  const abbreviatedTitle = (title) =>
    title.replace(
      /^(\d{4}\.\d{2})\.\d{2}-(?:\d{4}\.)?\d{2}\.\d{2}/,
      "$1"
    );

  const useCompactSummaryTitles = () => contentSection?.clientWidth <= 504;

  const updateSummaryTitleWidths = () => {
    const compact = useCompactSummaryTitles();
    summary.querySelectorAll(".trip-summary-title").forEach((link) => {
      link.textContent = compact ? link.dataset.shortTitle : link.dataset.fullTitle;
    });
  };

  const mileageOf = (entry) => {
    const mileNode = entry.querySelector("trip-mile");
    const kmNode = entry.querySelector("trip-km");
    const miles = distanceValue(mileNode);
    const kilometers = distanceValue(kmNode);

    if (miles !== null && kilometers === null && kmNode) {
      kmNode.textContent = formatDistance(miles * 1.609344);
      return distanceValue(kmNode);
    }

    if (kilometers !== null && miles === null && mileNode) {
      mileNode.textContent = formatDistance(kilometers / 1.609344);
    }

    return kilometers;
  };

  const headingOf = (entry) => entry.querySelector("h3");

  const headingIdOf = (entry) => {
    const heading = headingOf(entry);
    const sequence = entry.querySelector("trip-seq")?.textContent.trim();
    const id = sequence ? `trip-${sequence}` : "trip-special";

    if (heading) heading.id = id;
    return id;
  };

  const createTitleLink = (entry) => {
    const link = document.createElement("a");
    const fullTitle = headingOf(entry)?.textContent.trim() || "未命名旅行";
    link.href = `#${headingIdOf(entry)}`;
    link.className = "trip-summary-title";
    link.dataset.fullTitle = fullTitle;
    link.dataset.shortTitle = abbreviatedTitle(fullTitle);
    link.textContent = useCompactSummaryTitles()
      ? link.dataset.shortTitle
      : link.dataset.fullTitle;
    return link;
  };

  const appendSummaryHeading = (text) => {
    const title = document.createElement("h2");
    title.textContent = text;
    summary.appendChild(title);
  };

  const compareMileage = (a, b) => {
    const am = mileageOf(a);
    const bm = mileageOf(b);

    if (am === null && bm === null) return sequenceOf(a) - sequenceOf(b);
    if (am === null) return 1;
    if (bm === null) return -1;
    return bm - am || sequenceOf(a) - sequenceOf(b);
  };

  const compareRegion = (a, b) => {
    const ar = a.dataset.region || "未分类";
    const br = b.dataset.region || "未分类";
    const ai = regionRank.has(ar) ? regionRank.get(ar) : regionOrder.length;
    const bi = regionRank.has(br) ? regionRank.get(br) : regionOrder.length;

    if (ai !== bi) return ai - bi;
    if (ar !== br) return ar.localeCompare(br, "zh-CN");
    return sequenceOf(a) - sequenceOf(b);
  };

  const renderMileageSummary = (entries) => {
    const rows = entries
      .map((entry) => ({
        entry,
        miles: distanceValue(entry.querySelector("trip-mile")),
        kilometers: distanceValue(entry.querySelector("trip-km")),
      }))
      .sort((a, b) => {
        if (a.miles === null && b.miles === null) {
          return sequenceOf(a.entry) - sequenceOf(b.entry);
        }
        if (a.miles === null) return 1;
        if (b.miles === null) return -1;
        return b.miles - a.miles || sequenceOf(a.entry) - sequenceOf(b.entry);
      });

    appendSummaryHeading(`里程排名（${entries.length}）`);

    const table = document.createElement("table");
    table.className = "trip-mileage-table";

    const headerRow = document.createElement("tr");
    ["英里数", "公里数", "标题"].forEach((label) => {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = label;
      headerRow.appendChild(cell);
    });
    table.appendChild(document.createElement("thead")).appendChild(headerRow);

    const tbody = document.createElement("tbody");
    rows.forEach(({ entry, miles, kilometers }) => {
      const row = document.createElement("tr");
      const mileageCell = document.createElement("td");
      mileageCell.textContent = miles === null ? "" : formatDistance(miles);

      const kilometerCell = document.createElement("td");
      kilometerCell.textContent =
        kilometers === null ? "" : formatDistance(kilometers);

      const titleCell = document.createElement("td");
      titleCell.appendChild(createTitleLink(entry));

      row.append(mileageCell, kilometerCell, titleCell);
      tbody.appendChild(row);
    });
    table.appendChild(tbody);

    summary.appendChild(table);
  };

  const renderCollapsibleDirectory = (heading, groups) => {
    const headingRow = document.createElement("div");
    headingRow.className = "trip-directory-heading";
    const headingElement = document.createElement("h2");
    headingElement.textContent = heading;
    const controls = document.createElement("div");
    controls.className = "trip-directory-controls";
    headingRow.append(headingElement, controls);
    summary.appendChild(headingRow);

    const directory = document.createElement("div");
    directory.className = "trip-directory-list";

    let expandedEntryCount = 0;
    const setGroupExpanded = [];
    groups.forEach(({ name, id, entries }) => {
      const groupItem = document.createElement("div");
      groupItem.className = "trip-directory-group";
      const expandedInitially = expandedEntryCount < 10;
      if (expandedInitially) expandedEntryCount += entries.length;

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "trip-directory-toggle";

      const categoryName = document.createElement(id ? "a" : "span");
      categoryName.textContent = name;
      if (id) categoryName.href = `#${id}`;

      const categoryHeader = document.createElement("div");
      categoryHeader.className = "trip-directory-category";

      const trips = document.createElement("ul");
      trips.className = "trip-directory-trips";
      entries.forEach((entry) => {
        const item = document.createElement("li");
        item.appendChild(createTitleLink(entry));
        trips.appendChild(item);
      });

      const setExpanded = (expanded) => {
        toggle.textContent = expanded ? "收起 ▾" : "展开 ▸";
        toggle.setAttribute("aria-expanded", String(expanded));
        toggle.setAttribute(
          "aria-label",
          `${expanded ? "收起" : "展开"}${name}的旅行`
        );
        trips.hidden = !expanded;
      };

      toggle.addEventListener("click", () => {
        setExpanded(toggle.getAttribute("aria-expanded") !== "true");
      });
      setExpanded(expandedInitially);
      setGroupExpanded.push(setExpanded);

      categoryHeader.append(categoryName, toggle);
      groupItem.append(categoryHeader, trips);
      directory.appendChild(groupItem);
    });

    [
      ["全部展开", true],
      ["全部收起", false],
    ].forEach(([label, expanded]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", () => {
        setGroupExpanded.forEach((setExpanded) => setExpanded(expanded));
      });
      controls.appendChild(button);
    });

    summary.appendChild(directory);
  };

  const sequenceGroupOf = (entry) => {
    const startDate = entry.dataset.startDate || "";
    const fullDate = startDate.match(/^\d{4}\.\d{2}\.\d{2}$/)?.[0];
    const year = startDate.match(/^\d{4}/)?.[0];

    if (!year) return "未注明年份";
    if (fullDate && fullDate <= "2007.08.31") return "- 2007";
    if (fullDate && fullDate <= "2013.08.31") return "2007 - 2013";
    if (fullDate && fullDate <= "2017.08.31") return "2013 - 2017";
    if (fullDate && fullDate <= "2018.08.31") return "2017 - 2018";
    if (Number(year) < 2007) return "- 2007";
    return year;
  };

  const renderSequenceDirectory = (entries) => {
    const groups = new Map();
    entries.forEach((entry) => {
      const group = sequenceGroupOf(entry);
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(entry);
    });

    renderCollapsibleDirectory(
      `目录（${entries.length}）`,
      [...groups].map(([name, groupEntries]) => ({ name, entries: groupEntries }))
    );
  };

  const renderRegionDirectory = (regions) => {
    renderCollapsibleDirectory("地区目录", regions);
  };

  const sortEntries = () => {
    const entries = getEntries();
    entries.forEach((entry) => {
      mileageOf(entry);
      headingIdOf(entry);
      entry.hidden = !matchesFilter(entry);
    });

    entries.sort((a, b) => {
      if (currentSort === "sequence-desc") {
        return sequenceOf(b) - sequenceOf(a);
      }

      if (currentSort === "mileage-desc") {
        return compareMileage(a, b);
      }

      if (currentSort === "region") {
        return compareRegion(a, b);
      }

      return sequenceOf(a) - sequenceOf(b);
    });
    const visibleEntries = entries.filter(matchesFilter);

    const fragment = document.createDocumentFragment();
    const regions = [];
    let currentRegion = null;

    entries.forEach((entry) => {
      const region = entry.dataset.region || "未分类";

      if (currentSort === "region" && !entry.hidden && region !== currentRegion) {
        const id = `trip-region-${regions.length + 1}`;
        const heading = document.createElement("h2");
        heading.className = "trip-region-heading";
        heading.id = id;
        heading.textContent = region;
        fragment.appendChild(heading);
        regions.push({ name: region, id, entries: [] });
        currentRegion = region;
      }

      if (currentSort === "region" && !entry.hidden) {
        regions[regions.length - 1].entries.push(entry);
        currentRegion = region;
      }
      fragment.appendChild(entry);
    });

    list.replaceChildren(fragment);

    summary.replaceChildren();
    if (currentSort === "mileage-desc") {
      renderMileageSummary(
        visibleEntries.filter((entry) => entry.dataset.tripType === "drive")
      );
    } else if (currentSort === "region") {
      renderRegionDirectory(regions);
    } else {
      renderSequenceDirectory(visibleEntries);
    }

    sortButtons.forEach((button) => {
      const active = button.dataset.sort === currentSort;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    filterButtons.forEach((button) => {
      const active = button.dataset.filter === currentFilter;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    updateSortAvailability();
    updateMapPresentation();
  };

  sortButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      currentSort = button.dataset.sort;
      sortEntries();
    });
  });

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      currentFilter = button.dataset.filter;
      if (currentFilter === "all") {
        currentSort = "sequence-desc";
      }
      sortEntries();
    });
  });

  if (contentSection && "ResizeObserver" in window) {
    new ResizeObserver(updateSummaryTitleWidths).observe(contentSection);
  }

  sortEntries();
});
