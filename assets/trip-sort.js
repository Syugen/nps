document.addEventListener("DOMContentLoaded", () => {
  const list = document.querySelector("#trip-list");
  const sorter = document.querySelector("#trip-sorter");
  const summary = document.querySelector("#trip-summary");
  const contentSection = list?.closest("section");
  const buttons = document.querySelectorAll("#trip-sorter [data-sort]");

  if (!list || !sorter || !summary || !buttons.length) return;

  const regionOrder = (sorter.dataset.regionOrder || "")
    .split("|")
    .filter(Boolean);
  const regionRank = new Map(regionOrder.map((region, index) => [region, index]));

  const getEntries = () => [...list.querySelectorAll(":scope > .trip-entry")];

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

  const renderSequenceDirectory = (entries) => {
    const years = new Map();
    entries.forEach((entry) => {
      const title = headingOf(entry)?.textContent.trim() || "";
      const year = title.match(/^(\d{4})/)?.[1] || "未注明年份";
      if (!years.has(year)) years.set(year, []);
      years.get(year).push(entry);
    });

    appendSummaryHeading(`目录（${entries.length}）`);
    const directory = document.createElement("ul");
    years.forEach((yearEntries, year) => {
      const yearItem = document.createElement("li");
      yearItem.append(`${year}（${yearEntries.length}）`);

      const trips = document.createElement("ul");
      yearEntries.forEach((entry) => {
        const tripItem = document.createElement("li");
        tripItem.appendChild(createTitleLink(entry));
        trips.appendChild(tripItem);
      });
      yearItem.appendChild(trips);
      directory.appendChild(yearItem);
    });
    summary.appendChild(directory);
  };

  const renderRegionDirectory = (regions) => {
    appendSummaryHeading("地区目录");
    const directory = document.createElement("ul");
    regions.forEach(({ name, id, entries }) => {
      const regionItem = document.createElement("li");
      const regionLink = document.createElement("a");
      regionLink.href = `#${id}`;
      regionLink.textContent = name;
      regionItem.append(regionLink, `（${entries.length}）`);

      const trips = document.createElement("ul");
      entries.forEach((entry) => {
        const tripItem = document.createElement("li");
        tripItem.appendChild(createTitleLink(entry));
        trips.appendChild(tripItem);
      });
      regionItem.appendChild(trips);
      directory.appendChild(regionItem);
    });
    summary.appendChild(directory);
  };

  const sortEntries = (sortType) => {
    const entries = getEntries();
    entries.forEach((entry) => {
      mileageOf(entry);
      headingIdOf(entry);
    });

    entries.sort((a, b) => {
      if (sortType === "sequence-desc") {
        return sequenceOf(b) - sequenceOf(a);
      }

      if (sortType === "mileage-desc") {
        return compareMileage(a, b);
      }

      if (sortType === "region") {
        return compareRegion(a, b);
      }

      return sequenceOf(a) - sequenceOf(b);
    });

    const fragment = document.createDocumentFragment();
    const regions = [];
    let currentRegion = null;

    entries.forEach((entry) => {
      const region = entry.dataset.region || "未分类";

      if (sortType === "region" && region !== currentRegion) {
        const id = `trip-region-${regions.length + 1}`;
        const heading = document.createElement("h2");
        heading.className = "trip-region-heading";
        heading.id = id;
        heading.textContent = region;
        fragment.appendChild(heading);
        regions.push({ name: region, id, entries: [] });
        currentRegion = region;
      }

      if (sortType === "region") {
        regions[regions.length - 1].entries.push(entry);
      }
      fragment.appendChild(entry);
    });

    list.replaceChildren(fragment);

    summary.replaceChildren();
    if (sortType === "mileage-desc") {
      renderMileageSummary(entries);
    } else if (sortType === "region") {
      renderRegionDirectory(regions);
    } else {
      renderSequenceDirectory(entries);
    }

    buttons.forEach((button) => {
      const active = button.dataset.sort === sortType;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  };

  buttons.forEach((button) => {
    button.addEventListener("click", () => sortEntries(button.dataset.sort));
  });

  if (contentSection && "ResizeObserver" in window) {
    new ResizeObserver(updateSummaryTitleWidths).observe(contentSection);
  }

  sortEntries("mileage-desc");
});
